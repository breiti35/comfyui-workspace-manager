import asyncio
import logging
import os
import time
import folder_paths
import server
from aiohttp import web
import hashlib
import shelve
import threading
import urllib.request
import json
from .model_preview import preview_file

# The path to the file where file_hash_dict will be saved.
#
# WORKSPACE_MANAGER_HASH_DIR lets a container setup put the cache on a
# persistent volume. Without it the cache lives inside the node folder, and on
# an ephemeral container (RunPod & co.) every restart means re-hashing every
# model - tens of GB read from the network volume before the first Civitai
# lookup can happen.
FILE_HASH_DICT_FOLDER_PATH = os.environ.get("WORKSPACE_MANAGER_HASH_DIR") or os.path.join(
    os.path.dirname(__file__), "../../hash"
)
FILE_HASH_DICT_PATH = os.path.join(FILE_HASH_DICT_FOLDER_PATH, "file_hash_dict")

# Whether the on-disk hash cache is usable. Flipped to False the first time
# it fails to open (permission error, corrupt/locked dbm file, missing
# network drive, ...) so we only warn once instead of once per file.
_hash_cache_available = True

# Serializes every access to the shelve. On Linux shelve sits on gdbm, which
# refuses a second concurrent open with "Resource temporarily unavailable" -
# the scan, the hash worker and the installer all touch it from different
# threads. Without this lock the losing thread silently saw an empty cache.
_hash_dict_lock = threading.RLock()

# Throttle for model_list pushes while hashing. The payload is the whole list
# including base64 previews (easily several MB with a few hundred LoRAs);
# pushing it after every single hash floods the websocket, which a remote
# proxy like RunPod's does not always survive.
HASH_PUSH_INTERVAL_S = 5.0


def _open_hash_dict():
    """Open the file-hash cache, or None if it's unavailable.

    Callers must hold _hash_dict_lock and handle None by treating the cache
    as empty/disabled for that operation rather than letting the exception
    propagate - a broken hash cache should never crash the plugin or the
    whole ComfyUI server, it should just mean hashes aren't cached for this
    session.
    """
    global _hash_cache_available
    try:
        return shelve.open(FILE_HASH_DICT_PATH)
    except Exception as e:
        if _hash_cache_available:
            logging.warning(
                f"[Workspace Manager] File hash cache at '{FILE_HASH_DICT_PATH}' "
                f"could not be opened ({e}). Model hash caching is disabled "
                f"for this session; model management still works, just "
                f"without cached hashes."
            )
            _hash_cache_available = False
        return None


try:
    os.makedirs(FILE_HASH_DICT_FOLDER_PATH, exist_ok=True)
except OSError as e:
    logging.warning(
        f"[Workspace Manager] Could not create hash cache folder "
        f"'{FILE_HASH_DICT_FOLDER_PATH}' ({e}). Model hash caching is "
        f"disabled for this session."
    )
    _hash_cache_available = False
else:
    # Early open shelve for better performance
    with _hash_dict_lock:
        _early_open = _open_hash_dict()
        if _early_open is not None:
            _early_open.close()
            print(f"Workspace manager - Openning file hash dict")

file_list = []
file_list_lock = threading.Lock()

# Scan state. A scan lists the model folders (fast-ish: directory listing plus
# preview thumbnails); hashing is a separate, much slower pass that must never
# hold the list back.
_scan_lock = threading.Lock()  # one scan at a time
_scan_done = False  # file_list holds at least one completed scan
_state_lock = threading.Lock()  # guards the two flags below
_scan_running = False
_rescan_requested = False
_hash_running = False


def _model_key(item):
    return (item["model_type"], item["model_name"], item["model_extension"])


def save_file_hash(file_path, file_hash):
    with _hash_dict_lock:
        file_hash_dict = _open_hash_dict()
        if file_hash_dict is None:
            return
        with file_hash_dict:
            file_hash_dict[file_path] = file_hash


def compute_hash(file_path):
    # sha256 hash of the file. 1 MiB blocks instead of 4K: on a network
    # volume the per-read overhead dominates with tiny blocks.
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(1024 * 1024), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def process_file(folder, file, cached_hashes=None):
    file_path = folder_paths.get_full_path(folder, file)
    file_hash = None
    if cached_hashes is not None:
        file_hash = cached_hashes.get(file_path)
    [model_name, model_extension] = os.path.splitext(file)
    return {
        "model_name": model_name,
        "model_type": folder,
        "model_extension": model_extension,
        "file_hash": file_hash,
        "preview": preview_file(file_path),
        "date": os.path.getmtime(file_path),
    }


def _load_cached_hashes():
    """Snapshot of the whole hash cache, read in one open instead of one
    open per model file."""
    with _hash_dict_lock:
        file_hash_dict = _open_hash_dict()
        if file_hash_dict is None:
            return {}
        with file_hash_dict:
            try:
                return dict(file_hash_dict)
            except Exception as e:
                print(f"[Workspace Manager] Could not read hash cache: {e}")
                return {}


def scan_models():
    """List every model folder ComfyUI knows (incl. extra_model_paths) and
    replace file_list with the result. Blocking; returns the new list."""
    global file_list, _scan_done
    with _scan_lock:
        cached_hashes = _load_cached_hashes()
        local_file_list = []
        folder_list = list(folder_paths.folder_names_and_paths.keys())
        for folder in folder_list:
            if folder == "configs" or folder == "custom_nodes":
                continue
            # One broken folder (missing network path, permission error in a
            # custom node's registered dir, ...) must not cost the others.
            try:
                files = folder_paths.get_filename_list(folder)
            except Exception as e:
                print(f"[Workspace Manager] Could not list model folder '{folder}': {e}")
                continue
            for file in files:
                try:
                    local_file_list.append(process_file(folder, file, cached_hashes))
                except Exception as e:
                    print(f"Error processing file: {file} in folder: {folder}. Error: {e}")
        with file_list_lock:
            file_list = local_file_list
            _scan_done = True
            snapshot = list(file_list)
    send_ws("model_list", snapshot)
    _ensure_hash_worker()
    return snapshot


def _scan_worker():
    """Background scan loop. Repeats while rescans were requested during a
    scan, so a model finished downloading mid-scan is never lost."""
    global _scan_running, _rescan_requested
    while True:
        try:
            scan_models()
        except Exception as e:
            print(f"[Workspace Manager] Model scan failed: {e}")
        with _state_lock:
            if _rescan_requested:
                _rescan_requested = False
                continue
            _scan_running = False
            return


def start_populate_file_hash_dict():
    """Kick off a background rescan (plus hashing of new files). Safe to call
    any time: if a scan is already running, another one is queued behind it
    instead of the request being dropped."""
    global _scan_running, _rescan_requested
    with _state_lock:
        if _scan_running:
            _rescan_requested = True
            return
        _scan_running = True
    threading.Thread(target=_scan_worker, daemon=True).start()


def _ensure_hash_worker():
    global _hash_running
    with _state_lock:
        if _hash_running:
            return
        _hash_running = True
    threading.Thread(target=_hash_worker, daemon=True).start()


def _hash_worker():
    """Hash every listed model that has no hash yet, one file at a time.

    Always picks the next file from the *current* file_list, so a rescan in
    between is picked up instead of hashes landing on a discarded list.
    """
    global _hash_running
    failed = set()
    last_push = time.monotonic()
    dirty = False
    while True:
        with _state_lock:
            with file_list_lock:
                pending = next(
                    (
                        f
                        for f in file_list
                        if f["file_hash"] is None and _model_key(f) not in failed
                    ),
                    None,
                )
            if pending is None:
                # Cleared under the same lock _ensure_hash_worker checks, so a
                # scan finishing right now either sees us running (and we see
                # its files next round) or starts a fresh worker.
                _hash_running = False
                break
        key = _model_key(pending)
        try:
            file_path = folder_paths.get_full_path(
                pending["model_type"], pending["model_name"] + pending["model_extension"]
            )
            file_hash = compute_hash(file_path)
            save_file_hash(file_path, file_hash)
        except Exception as e:
            failed.add(key)
            print(f"Error calculating hash for file: {pending['model_name']}. Error: {e}")
            continue
        with file_list_lock:
            for f in file_list:
                if _model_key(f) == key:
                    f["file_hash"] = file_hash
            snapshot = list(file_list)
        dirty = True
        if time.monotonic() - last_push >= HASH_PUSH_INTERVAL_S:
            send_ws("model_list", snapshot)
            last_push = time.monotonic()
            dirty = False
    if dirty:
        with file_list_lock:
            snapshot = list(file_list)
        send_ws("model_list", snapshot)


def civit_get_model_by_hash(file_hash: str):
    # Currently unreferenced (no route/caller) - the live hash-lookup path is
    # the frontend's fetchCivitModelFromHashKey in ui/src/utils/civitUtils.ts.
    # If this is ever wired up, apply the same civitai.com/civitai.red
    # content-mode handling as that function (see getCivitBaseUrl there).
    if file_hash is None:
        return None
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
        }
        url = f"https://civitai.com/api/v1/model-versions/by-hash/{file_hash}"
        req = urllib.request.Request(url, headers=headers)
        # Making a GET request
        with urllib.request.urlopen(req) as response:
            data = response.read()
            encoding = response.info().get_content_charset("utf-8")
            result = json.loads(data.decode(encoding))
        return result
    except Exception as e:
        return None


@server.PromptServer.instance.routes.get("/model_manager/get_model_list")
async def get_model_list(request):
    # The HTTP answer must carry the full list on its own. Before, the first
    # call returned the still-empty in-memory list and relied on a later
    # websocket push - behind a remote proxy that push got lost often enough
    # that the panel stayed (partly) empty until some later reopen.
    #
    # - first call / ?fresh=1 ("Aktualisieren"): scan now, answer with it
    # - otherwise: answer with the last scan immediately and rescan in the
    #   background; the result follows as a model_list push
    fresh = request.rel_url.query.get("fresh") == "1"
    with file_list_lock:
        have_list = _scan_done
        snapshot = list(file_list)
    if fresh or not have_list:
        snapshot = await asyncio.get_running_loop().run_in_executor(None, scan_models)
    else:
        start_populate_file_hash_dict()
    return web.json_response(snapshot, content_type="application/json")


@server.PromptServer.instance.routes.get("/model_manager/get_folder_list")
def get_folder_list(request):
    dirList = {k: v[0] for k, v in folder_paths.folder_names_and_paths.items()}
    return web.json_response(dirList, content_type="application/json")


loop = asyncio.get_event_loop()
def send_ws(event, data):
    asyncio.run_coroutine_threadsafe(
        server.PromptServer.instance.send(event, data), loop
    )
