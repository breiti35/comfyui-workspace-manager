import asyncio
import ipaddress
import os
import re
import shutil
import socket
import sys
from aiohttp import web
import folder_paths
import urllib.error
import urllib.parse
import urllib.request
import threading
import server
import time
from .model_list import start_populate_file_hash_dict, save_file_hash
from . import civarchive  # noqa: F401  (registers /model_manager/civarchive_by_hash)
from ..path_utils import is_within

comfy_path = os.path.dirname(folder_paths.__file__)


# ---------------------------------------------------------------------------
# Secret masking
# ---------------------------------------------------------------------------

# The UI appends the Civitai API key as ?token=... to the download URL, and
# HF_TOKEN goes into an Authorization header. Both used to end up verbatim in
# the server log and in download_error websocket events - which every
# connected browser receives. Everything that is printed or sent goes
# through _mask() first.
_TOKEN_QUERY_RE = re.compile(r"((?:^|[?&;\s])(?:token|api_key|apikey|key)=)[^&#\s'\"]+", re.IGNORECASE)
_AUTH_HEADER_RE = re.compile(r"(Authorization['\"]?\s*[:=]\s*['\"]?(?:Bearer|Basic|Token)?\s*)[^\s'\",}]+", re.IGNORECASE)
_BEARER_RE = re.compile(r"(Bearer\s+)[A-Za-z0-9._~+/=-]+", re.IGNORECASE)


def _mask(value):
    if value is None:
        return value
    text = str(value)
    text = _TOKEN_QUERY_RE.sub(r"\1***", text)
    text = _AUTH_HEADER_RE.sub(r"\1***", text)
    text = _BEARER_RE.sub(r"\1***", text)
    return text


def _log(*args, error=False):
    print(*(_mask(a) for a in args), file=sys.stderr if error else sys.stdout)


# ---------------------------------------------------------------------------
# Download queue
# ---------------------------------------------------------------------------

# Queued download tasks (dicts as sent by the UI, validated in install_model).
download_tasks = []
# Guards download_tasks, download_thread and _active_download. The worker
# decides "queue empty -> exit" under this lock and clears download_thread in
# the same critical section, so install_model can never append a task that
# a just-exiting worker no longer sees (the old is_alive() check had exactly
# that window and the task sat in the queue forever).
download_tasks_lock = threading.Lock()
# The worker thread, or None when no worker is running.
download_thread = None


class _ActiveDownload:
    """The download currently being processed, with its own cancel flag.

    Per task instead of the old global cancel_path: a cancel for a path that
    is neither active nor queued is simply ignored, and a stale cancel can no
    longer hit a later download of the same file.
    """

    def __init__(self, filename):
        self.filename = filename
        self.file_path = None  # known once the final name is resolved
        self.cancel = threading.Event()

    def matches(self, save_path):
        return save_path in (self.filename, self.file_path)


_active_download = None


def _set_active_locked(active):
    """Caller holds download_tasks_lock."""
    global _active_download
    _active_download = active
    return active


def download_worker():
    global download_thread
    while True:
        with download_tasks_lock:
            if not download_tasks:
                # Decided under the lock: install_model either appended before
                # this (and we saw it) or sees download_thread=None afterwards
                # and starts a new worker. The "queue empty" event is sent in
                # here too, so it can never overtake the first progress event
                # of a worker started right after.
                download_thread = None
                send_ws("download_progress", [])
                break
            task = download_tasks.pop(0)
            # Registered in the same critical section as the pop, so a cancel
            # always finds the task either queued or active - never in
            # between (where it used to be lost).
            active = _set_active_locked(_ActiveDownload(task.get("filename")))
        try:
            # Execute the download task and update the download progress
            ok = download_url_with_agent(
                url=task["url"],
                save_path=task["save_path"],
                file_name=task["filename"],
                file_hash=task.get("file_hash"),
                force_filename=task.get("force_filename", False),
                active=active,
            )
            if ok:
                # calculate newly downloaded models' hash
                start_populate_file_hash_dict()
        except Exception as e:
            # One broken task must not kill the worker and strand the queue.
            _log(f"[Workspace Manager] Download task failed: {e}", error=True)
            send_ws("download_error", f"{task.get('url')} / {e}")


def _ensure_worker_locked():
    """Start the worker if none is running. Caller holds download_tasks_lock."""
    global download_thread
    if download_thread is None:
        download_thread = threading.Thread(target=download_worker, daemon=True)
        download_thread.start()


# ---------------------------------------------------------------------------
# Request validation
# ---------------------------------------------------------------------------

# File types a model download may produce. ComfyUI's own list (if present)
# plus the common formats of the model folders this UI installs into.
_COMMON_MODEL_EXTENSIONS = {
    ".safetensors", ".ckpt", ".pt", ".pt2", ".pth", ".bin", ".gguf", ".sft",
    ".onnx", ".pkl",
}


def allowed_model_extensions():
    return _COMMON_MODEL_EXTENSIONS | {
        e.lower() for e in getattr(folder_paths, "supported_pt_extensions", set()) or set()
    }


class InstallRequestError(ValueError):
    pass


def sanitize_model_filename(name, check_extension=True):
    """Reduce a client- or server-supplied name to a safe bare file name.

    Query/fragment parts are dropped (the UI's fallback name for a custom URL
    is the last URL segment, e.g. "x.safetensors?download=true"). A name with
    path components or ".." is rejected instead of being silently cut down -
    it can only come from a manipulated request or a hostile server.
    """
    if not isinstance(name, str):
        raise InstallRequestError("Ungültiger Dateiname")
    name = name.split("?", 1)[0].split("#", 1)[0].strip()
    if not name or "/" in name or "\\" in name or "\x00" in name:
        raise InstallRequestError(f"Ungültiger Dateiname: {name!r}")
    if name in (".", ".."):
        raise InstallRequestError(f"Ungültiger Dateiname: {name!r}")
    if re.match(r"^[A-Za-z]:", name):
        raise InstallRequestError(f"Ungültiger Dateiname: {name!r}")
    if check_extension:
        ext = os.path.splitext(name)[1].lower()
        if ext not in allowed_model_extensions():
            raise InstallRequestError(
                f"Dateityp '{ext or name}' ist für Modell-Downloads nicht erlaubt"
            )
    return name


def validate_save_path(save_path):
    """save_path must be a ComfyUI model folder key ("loras") or one of the
    directories registered for such a key (the folder picker sends those).
    Returns it unchanged. Anything else could write a file anywhere."""
    if not isinstance(save_path, str) or not save_path:
        raise InstallRequestError("save_path fehlt")
    names = folder_paths.folder_names_and_paths
    if save_path in names:
        return save_path
    if os.path.isabs(save_path):
        target = os.path.normcase(os.path.realpath(save_path))
        for paths, _exts in names.values():
            for p in paths:
                if os.path.normcase(os.path.realpath(p)) == target:
                    return save_path
    raise InstallRequestError(f"Unbekannter Modellordner: {save_path}")


def validate_url(url):
    if not isinstance(url, str):
        raise InstallRequestError("URL fehlt")
    parsed = urllib.parse.urlparse(url)
    # Only http(s): urllib would also happily open file:// (read any local
    # file into the models folder) and ftp://.
    if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
        raise InstallRequestError("Nur http- und https-URLs sind erlaubt")
    return url


def validate_install_request(json_data):
    if not isinstance(json_data, dict):
        raise InstallRequestError("Ungültige Anfrage")
    validate_url(json_data.get("url"))
    validate_save_path(json_data.get("save_path"))
    # A forced name is used as-is, so it must be a valid model file name. The
    # non-forced name is only a fallback for a missing Content-Disposition -
    # it is fully checked once the final name is known.
    sanitize_model_filename(
        json_data.get("filename"),
        check_extension=bool(json_data.get("force_filename")),
    )


@server.PromptServer.instance.routes.post("/model_manager/install_model")
async def install_model(request):
    try:
        json_data = await request.json()
        validate_install_request(json_data)
    except Exception as e:
        # Also as download_error: the UI shows a "pending" marker from the
        # moment it sent the request, which only a progress or error event
        # clears.
        msg = f"Download abgelehnt: {e}"
        send_ws("download_error", msg)
        return web.Response(text=_mask(msg), status=400)

    with download_tasks_lock:
        # Add the task to the list
        download_tasks.append(json_data)
        _ensure_worker_locked()

    return web.Response(
        text=_mask(f"Downloading {json_data['url']} to {json_data['save_path']} ...")
    )


def request_cancel(save_path):
    """Cancel a queued or the running download. Returns "queued", "active" or
    None (unknown path - ignored, nothing sticky is left behind)."""
    with download_tasks_lock:
        for task in download_tasks:
            if task.get("filename") == save_path:
                download_tasks.remove(task)
                return "queued"
        active = _active_download
        if active is not None and active.matches(save_path):
            active.cancel.set()
            return "active"
    return None


@server.PromptServer.instance.routes.post("/model_manager/cancel_installation")
async def cancel_installation(request):
    json_data = await request.json()
    save_path = json_data.get("save_path")
    result = request_cancel(save_path)
    if result is None:
        _log(f"[Workspace Manager] Cancel ignored, no such download: {save_path}")
    return web.Response(text=f"Canceled download to {save_path} ...")


@server.PromptServer.instance.routes.get("/model_manager/resolve_folder")
async def resolve_folder(request):
    """Where would a download into this folder key actually land?

    Mirrors get_model_dir() including the WORKSPACE_MANAGER_MODEL_ROOT
    preference, so the UI can show the real target (volume vs. container
    disk) before the user starts a download."""
    folder = request.query.get("folder", "")
    if folder not in folder_paths.folder_names_and_paths:
        return web.json_response({"error": f"Unknown model folder: {folder}"}, status=404)
    try:
        return web.json_response({"path": resolve_folder_dir(folder)})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

_DOWNLOAD_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
}
# 1 MB per read - the old 1 KB meant millions of tiny loop iterations for a
# multi-GB model, which capped throughput on fast connections.
DOWNLOAD_CHUNK_SIZE = 1024 * 1024
# How many parallel HTTP range connections to use for large files. Civitai (and
# most CDNs) throttle per-connection, so several segments in parallel is the
# real speed lever. Kept modest so we don't look like abuse / get rate-limited.
DOWNLOAD_CONNECTIONS = 6
# Only bother segmenting files bigger than this; small files download fine in
# one stream and parallelism just adds overhead.
PARALLEL_MIN_BYTES = 16 * 1024 * 1024
# Socket timeout for connect and for every single read. Without it a stalled
# CDN connection hung the download worker - and with it the whole queue -
# forever.
HTTP_TIMEOUT_S = 60
# Attempts per segment / stream before a download counts as failed. Each
# retry resumes where the previous attempt stopped (Range request).
DOWNLOAD_ATTEMPTS = 3
RETRY_DELAY_S = 0.5
# Required free space on top of the file size: the disk must not be filled to
# the last byte (hash cache, ComfyUI temp files and outputs live there too).
FREE_SPACE_BUFFER_BYTES = 1024 * 1024 * 1024

_HF_HOSTS = ("huggingface.co", "hf.co")


def _host(url):
    return (urllib.parse.urlparse(url).hostname or "").lower()


def _is_hf_host(host):
    return host in _HF_HOSTS or host.endswith(".huggingface.co")


def _auth_headers_for(url, auth_host):
    """Authorization header for gated HuggingFace repos.

    Only for the host the user asked for (auth_host), and only if that is a
    HuggingFace host: HF redirects the actual bytes to a signed CDN URL
    (cdn-lfs / xet) that must NOT get the token - it doesn't need it, and a
    leaked token there would be a real leak.
    """
    token = os.environ.get("HF_TOKEN")
    if not token or not auth_host:
        return {}
    host = _host(url)
    if host != auth_host or not _is_hf_host(host):
        return {}
    return {"Authorization": f"Bearer {token}"}


class _AuthAwareRedirectHandler(urllib.request.HTTPRedirectHandler):
    """urllib never forwards *unredirected* headers to a redirect target -
    that is what keeps the HF token away from the CDN. A redirect that stays
    on the HuggingFace host itself (renamed repo, revision redirect) still
    needs it, so it is re-added only for that case."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        check_public_url(newurl)
        new_req = super().redirect_request(req, fp, code, msg, headers, newurl)
        auth_host = getattr(req, "_wm_auth_host", None)
        if new_req is not None and auth_host:
            new_req._wm_auth_host = auth_host
            for key, value in _auth_headers_for(newurl, auth_host).items():
                new_req.add_unredirected_header(key, value)
        return new_req


def _private_downloads_allowed():
    return os.environ.get("WORKSPACE_MANAGER_ALLOW_PRIVATE_DOWNLOADS") == "1"


def check_public_url(url):
    """Refuse downloads from loopback/private/link-local addresses (SSRF).

    ComfyUI has no auth and often runs on a public pod: without this anyone
    could make the server fetch http://169.254.169.254/... (cloud metadata)
    or internal services. Checked for the first URL and every redirect.
    WORKSPACE_MANAGER_ALLOW_PRIVATE_DOWNLOADS=1 turns it off (LAN mirrors)."""
    if _private_downloads_allowed():
        return
    host = urllib.parse.urlparse(url).hostname
    if not host:
        raise ValueError("Download-URL ohne Host")
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as e:
        raise ValueError(f"Host nicht auflösbar: {host}") from e
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if not ip.is_global or ip.is_multicast:
            raise ValueError(
                f"Download von interner Adresse ({host}) ist nicht erlaubt"
            )


_opener = urllib.request.build_opener(_AuthAwareRedirectHandler)


def _open(url, headers=None, auth_host=None):
    """urlopen with timeout; auth is added as an *unredirected* header so
    urllib's redirect handler does not forward it to the redirect target."""
    check_public_url(url)
    req = urllib.request.Request(url, headers={**_DOWNLOAD_HEADERS, **(headers or {})})
    req._wm_auth_host = auth_host
    for key, value in _auth_headers_for(url, auth_host).items():
        req.add_unredirected_header(key, value)
    return _opener.open(req, timeout=HTTP_TIMEOUT_S)


def _is_transient_http_error(e):
    return isinstance(e, urllib.error.HTTPError) and (e.code >= 500 or e.code == 429)


def _explain_http_error(e, url):
    """Turn 401/403 into something a user can act on."""
    if isinstance(e, urllib.error.HTTPError) and e.code in (401, 403):
        if _is_hf_host(_host(url)):
            if os.environ.get("HF_TOKEN"):
                return ValueError(
                    f"Zugriff verweigert (HTTP {e.code}). Das HuggingFace-Repo ist "
                    f"vermutlich gated: Lizenz auf huggingface.co akzeptieren und "
                    f"prüfen, ob HF_TOKEN Lesezugriff auf das Repo hat."
                )
            return ValueError(
                f"Zugriff verweigert (HTTP {e.code}). Das HuggingFace-Repo ist "
                f"vermutlich gated oder privat: Lizenz auf huggingface.co akzeptieren "
                f"und die Umgebungsvariable HF_TOKEN auf dem Server setzen."
            )
        return ValueError(
            f"Zugriff verweigert (HTTP {e.code}). You need to add API key to "
            f"download this model - oder der API-Key ist ungültig."
        )
    return e


class _SpeedMeter:
    """Smoothed download speed in bytes/sec (exponential moving average), so
    the UI can show throughput + an ETA without the number jumping around."""

    def __init__(self):
        self._last_t = time.time()
        self._last_bytes = 0
        self._speed = 0.0

    def update(self, total_downloaded):
        now = time.time()
        dt = now - self._last_t
        if dt < 0.25:
            return self._speed
        inst = (total_downloaded - self._last_bytes) / dt
        self._speed = inst if self._speed == 0 else 0.6 * self._speed + 0.4 * inst
        self._last_t = now
        self._last_bytes = total_downloaded
        return self._speed


def _raise_if_html_auth_page(response):
    """Civitai serves an HTML sign-in/error page (not the file) when a model
    needs an API key or the token is wrong. Detect that and raise a helpful
    error instead of writing the HTML to a .safetensors file."""
    ctype = response.headers.get("Content-Type", "")
    if "text/html" not in ctype:
        return
    body = response.read(4096).decode("utf-8", "replace")
    match = re.search(r"<title>(.*?)</title>", body, re.IGNORECASE | re.DOTALL)
    title = match.group(1).strip() if match else ""
    if not title or "sign in" in title.lower():
        raise ValueError("You need to add API key to download this model.")
    raise ValueError(f"Download failed. {title}")


def _resolve_download(url, auth_host=None):
    """Plain GET (NO Range header) that follows redirects to the final CDN URL
    and reads the total size. Deliberately no Range: some CDNs (HuggingFace's
    xet CDN) sign the redirect target to the exact Range of the first request,
    which would then reject the differing per-segment range requests. Returns
    (final_url, total_bytes, content_disposition)."""
    try:
        with _open(url, auth_host=auth_host) as response:
            _raise_if_html_auth_page(response)
            return (
                response.geturl(),
                int(response.headers.get("Content-Length", 0) or 0),
                response.headers.get("Content-Disposition"),
            )
    except urllib.error.HTTPError as e:
        raise _explain_http_error(e, url) from None


def _supports_range(url, auth_host=None):
    """Probe whether the already-resolved final URL honors range requests, so
    we know if the download can be split into parallel segments. Runs directly
    against the final URL (no redirect), so the range definitely applies."""
    try:
        with _open(url, {"Range": "bytes=0-1"}, auth_host=auth_host) as response:
            return response.status == 206
    except Exception:
        return False


def _filename_from_disposition(content_disposition):
    """filename*= (RFC 5987, used by HuggingFace for non-ASCII names) wins over
    the plain filename=."""
    if not content_disposition:
        return None
    match = re.search(r"filename\*\s*=\s*([^']*)'[^']*'([^;]+)", content_disposition, re.IGNORECASE)
    if match:
        charset = match.group(1) or "utf-8"
        try:
            return urllib.parse.unquote(match.group(2).strip().strip('"'), encoding=charset)
        except LookupError:
            return urllib.parse.unquote(match.group(2).strip().strip('"'))
    match = re.search(r'filename\s*=\s*"([^"]+)"', content_disposition, re.IGNORECASE)
    if match:
        return match.group(1)
    match = re.search(r"filename\s*=\s*([^;]+)", content_disposition, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return None


def _download_single(url, temp_file_path, file_path, total, cancel, auth_host=None):
    """Fallback: classic single-stream download (used when the server has no
    range support or the file is small).

    A dropped connection is retried by resuming with a Range request; if the
    server then answers 200 instead of 206 it cannot resume and the download
    fails cleanly instead of appending a second copy of the file.

    Returns True when complete, False when canceled."""
    downloaded = 0
    meter = _SpeedMeter()
    last_error = None
    with open(temp_file_path, "wb") as f:
        for attempt in range(DOWNLOAD_ATTEMPTS):
            if attempt:
                if cancel.wait(RETRY_DELAY_S * attempt):
                    return False
                _log(f"[Workspace Manager] Retrying download at byte {downloaded} ({attempt + 1}/{DOWNLOAD_ATTEMPTS}): {last_error}")
            headers = {"Range": f"bytes={downloaded}-"} if downloaded else {}
            try:
                with _open(url, headers, auth_host=auth_host) as response:
                    if downloaded and response.status != 206:
                        raise ValueError(
                            "Download abgebrochen und der Server unterstützt kein "
                            "Fortsetzen (keine Range-Unterstützung)."
                        )
                    if not downloaded:
                        _raise_if_html_auth_page(response)
                        if not total:
                            total = int(response.headers.get("Content-Length", 0) or 0)
                    while True:
                        # A cancel that arrives after the last byte must not
                        # throw away a complete file.
                        if cancel.is_set() and not (total and downloaded >= total):
                            return False
                        chunk = response.read(DOWNLOAD_CHUNK_SIZE)
                        if not chunk:
                            break
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total:
                            send_download_status(
                                {
                                    "save_path": file_path,
                                    "progress": downloaded / total * 100,
                                    "speed": meter.update(downloaded),
                                    "downloaded": downloaded,
                                    "total": total,
                                }
                            )
                if total and downloaded < total:
                    # Stream ended early without an exception (connection
                    # dropped by a proxy) - resume.
                    last_error = f"stream ended at {downloaded}/{total} bytes"
                    continue
                return True
            except urllib.error.HTTPError as e:
                if not _is_transient_http_error(e):
                    raise _explain_http_error(e, url) from None
                last_error = e
            except ValueError:
                raise
            except Exception as e:
                last_error = e
    if total and downloaded < total:
        raise Exception(f"Incomplete download ({downloaded}/{total} bytes): {last_error}")
    raise Exception(f"Download failed: {last_error}")


def _download_parallel(url, temp_file_path, file_path, total, cancel, auth_host=None):
    """Segmented multi-connection download: split the byte range into
    DOWNLOAD_CONNECTIONS parts, fetch them concurrently, and write each into
    its region of the pre-sized temp file. Aggregate progress is reported as a
    single combined percentage.

    Returns True when complete, False when canceled."""
    n = DOWNLOAD_CONNECTIONS
    part = total // n
    segments = []
    for i in range(n):
        start = i * part
        end = total - 1 if i == n - 1 else start + part - 1
        segments.append((start, end))

    # Pre-size the file so each worker can seek to its offset and write.
    with open(temp_file_path, "wb") as f:
        f.truncate(total)

    downloaded = [0] * n
    lock = threading.Lock()
    errors = []
    stop = threading.Event()

    def worker(idx, start, end):
        expected = end - start + 1
        last_error = None
        try:
            with open(temp_file_path, "r+b") as f:
                for attempt in range(DOWNLOAD_ATTEMPTS):
                    if attempt and stop.wait(RETRY_DELAY_S * attempt):
                        return
                    if stop.is_set() or cancel.is_set():
                        return
                    # Resume right after the bytes this segment already has.
                    offset = start + downloaded[idx]
                    try:
                        with _open(url, {"Range": f"bytes={offset}-{end}"}, auth_host=auth_host) as resp:
                            if resp.status != 206:
                                # A 200 would be the whole file from byte 0 -
                                # writing it at `offset` corrupts the model.
                                raise ValueError(f"Server ignored the range request (HTTP {resp.status})")
                            f.seek(offset)
                            while not stop.is_set() and not cancel.is_set():
                                chunk = resp.read(DOWNLOAD_CHUNK_SIZE)
                                if not chunk:
                                    break
                                # Never write past the segment end, even if a
                                # misbehaving server sends more.
                                room = expected - downloaded[idx]
                                chunk = chunk[:room]
                                f.write(chunk)
                                with lock:
                                    downloaded[idx] += len(chunk)
                                if downloaded[idx] >= expected:
                                    break
                    except urllib.error.HTTPError as e:
                        # 4xx is not going to get better - no retry.
                        if not _is_transient_http_error(e):
                            raise _explain_http_error(e, url) from None
                        last_error = e
                    except ValueError:
                        # Range ignored etc. - not transient either.
                        raise
                    except Exception as e:
                        last_error = e
                    if downloaded[idx] >= expected or stop.is_set() or cancel.is_set():
                        return
                    if last_error is None:
                        last_error = f"segment {idx} ended at {downloaded[idx]}/{expected} bytes"
                raise Exception(
                    f"Incomplete download (segment {idx}: {downloaded[idx]}/{expected} bytes): {last_error}"
                )
        except Exception as e:
            errors.append(e)
            stop.set()

    threads = [
        threading.Thread(target=worker, args=(i, s, e), daemon=True)
        for i, (s, e) in enumerate(segments)
    ]
    for th in threads:
        th.start()
    meter = _SpeedMeter()
    while any(th.is_alive() for th in threads):
        with lock:
            done = sum(downloaded)
        send_download_status(
            {
                "save_path": file_path,
                "progress": done / total * 100,
                "speed": meter.update(done),
                "downloaded": done,
                "total": total,
            }
        )
        time.sleep(0.15)
    for th in threads:
        th.join()

    with lock:
        done = sum(downloaded)
    # Completeness wins over a cancel that arrived after the last chunk: the
    # file is whole, deleting it now would just throw away a finished
    # download.
    if done != total:
        if cancel.is_set():
            return False
        if errors:
            raise errors[0]
        raise Exception(f"Incomplete download ({done}/{total} bytes)")
    send_download_status(
        {
            "save_path": file_path,
            "progress": 100.0,
            "speed": 0,
            "downloaded": total,
            "total": total,
        }
    )
    return True


# ---------------------------------------------------------------------------
# Target directory, disk space, orphaned temp files
# ---------------------------------------------------------------------------

def resolve_folder_dir(folder_key):
    """Directory a download into `folder_key` goes to.

    Default is the first registered path - which is ComfyUI's own models dir.
    On RunPod & co. that lives on the ephemeral container disk, so a
    downloaded model is gone after a restart and the (small) container disk
    fills up. With WORKSPACE_MANAGER_MODEL_ROOT set (e.g. /workspace), the
    first registered path under that root (from extra_model_paths.yaml) is
    preferred instead.
    """
    paths = folder_paths.folder_names_and_paths[folder_key][0]
    if not paths:
        raise ValueError(f"No directory registered for model folder '{folder_key}'")
    root = os.environ.get("WORKSPACE_MANAGER_MODEL_ROOT")
    if root:
        for p in paths:
            if is_within(root, p):
                return p
    return paths[0]


def get_model_dir(save_path):
    if os.path.isabs(save_path):
        return save_path
    else:
        return resolve_folder_dir(save_path)


def _check_free_space(directory, total):
    """Fail before downloading instead of after 30 GB with a full disk."""
    if not total:
        return  # size unknown - nothing to check against
    try:
        free = shutil.disk_usage(directory).free
    except OSError:
        return
    needed = total + FREE_SPACE_BUFFER_BYTES
    if free < needed:
        gb = 1024 ** 3
        raise ValueError(
            f"Nicht genug Speicherplatz in {directory}: benötigt "
            f"{needed / gb:.1f} GB (Datei + 1 GB Puffer), frei {free / gb:.1f} GB"
        )


_orphan_checked_dirs = set()
_orphan_lock = threading.Lock()


def _log_orphaned_temp_files(directory, own_temp_path):
    """Log leftover *.temp files from interrupted downloads (crash, restart).

    Only logged, never auto-deleted: a .temp may belong to a download another
    process is running. Once per directory and only the top level, so this
    never walks a huge model tree repeatedly."""
    with _orphan_lock:
        if directory in _orphan_checked_dirs:
            return
        _orphan_checked_dirs.add(directory)
    try:
        orphans = [
            entry.name
            for entry in os.scandir(directory)
            if entry.is_file()
            and entry.name.endswith(".temp")
            and os.path.normcase(entry.path) != os.path.normcase(own_temp_path)
        ]
    except OSError:
        return
    if orphans:
        _log(
            f"[Workspace Manager] Found {len(orphans)} leftover .temp file(s) from "
            f"interrupted downloads in {directory}: {', '.join(orphans[:10])}"
            f"{' ...' if len(orphans) > 10 else ''} - they are not used and can be deleted."
        )


# ---------------------------------------------------------------------------
# Download driver
# ---------------------------------------------------------------------------

def download_url_with_agent(url, save_path, file_name, file_hash, force_filename=False, active=None):
    global _active_download
    if active is None:
        with download_tasks_lock:
            active = _set_active_locked(_ActiveDownload(file_name))
    try:
        return _download_to_folder(url, save_path, file_name, file_hash, force_filename, active)
    finally:
        with download_tasks_lock:
            if _active_download is active:
                _active_download = None


def _download_to_folder(url, save_path, file_name, file_hash, force_filename, active):
    cancel = active.cancel
    temp_file_path = None
    file_path = None
    auth_host = _host(url)
    try:
        _log(f"Downloading {url} to {save_path} ...")
        final_url, total, content_disposition = _resolve_download(url, auth_host)
        use_parallel = total > PARALLEL_MIN_BYTES and _supports_range(final_url, auth_host)
        _log(f"File size: {total} bytes, parallel: {use_parallel}")

        if not force_filename:
            disposition_name = _filename_from_disposition(content_disposition)
            if disposition_name:
                # basename: a hostile server could send "../../x.py".
                file_name = os.path.basename(disposition_name.replace("\\", "/"))
        file_name = sanitize_model_filename(file_name)

        target_dir = get_model_dir(save_path)
        file_path = os.path.join(target_dir, file_name)
        with download_tasks_lock:
            active.file_path = file_path

        # Checked before a single byte is written: overwriting an existing
        # model (possibly one in use) with a partial/different file is worse
        # than refusing.
        if os.path.exists(file_path):
            msg = f"Datei existiert bereits: {file_name}"
            _log(f"[Workspace Manager] {msg} ({file_path})")
            send_ws("download_error", msg)
            return False

        temp_file_path = file_path + ".temp"
        os.makedirs(target_dir, exist_ok=True)
        _log_orphaned_temp_files(target_dir, temp_file_path)
        _check_free_space(target_dir, total)

        if cancel.is_set():
            completed = False
        elif use_parallel:
            completed = _download_parallel(final_url, temp_file_path, file_path, total, cancel, auth_host)
        else:
            completed = _download_single(final_url, temp_file_path, file_path, total, cancel, auth_host)

        if not completed:
            # Canceled - clean up the partial temp file.
            _log(f"\nDownload to {save_path} is canceled.")
            _remove_quietly(temp_file_path)
            return False

    except Exception as e:
        _log(f"\nDownload error: {url} / {e}", error=True)
        send_ws("download_error", f"{url} / {e}")
        if temp_file_path:
            _remove_quietly(temp_file_path)  # Clean up the temporary file in case of failure
        return False

    # Rename temp file to final filename after successful download. Its own
    # error handling: at this point the data is complete, so a failed rename
    # (file locked, permissions) must NOT delete the .temp - the user can
    # still rename it by hand instead of downloading 20 GB again.
    try:
        os.replace(temp_file_path, file_path)
    except OSError as e:
        msg = f"Download fertig, aber Umbenennen fehlgeschlagen ({e}). Die Datei liegt als {temp_file_path}"
        _log(f"\n{msg}", error=True)
        send_ws("download_error", msg)
        return False

    # Only now does the file exist under the name the hash belongs to.
    if file_hash is not None:
        try:
            save_file_hash(file_path, file_hash)
        except Exception as e:
            _log(f"[Workspace Manager] Could not cache file hash: {e}", error=True)

    _log("\nDownload complete. File saved as:", file_path)
    return True


def _remove_quietly(path):
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except OSError as e:
        _log(f"[Workspace Manager] Could not remove {path}: {e}", error=True)


last_call_time = 0
def send_download_status(data):
    global last_call_time
    current_time = time.time()
    if current_time - last_call_time < 0.1:
        return
    last_call_time = time.time()
    with download_tasks_lock:
        progress_list = [data]
        for task in download_tasks:
            progress_list.append({"save_path": task["filename"], "progress": 0})
    send_ws("download_progress", progress_list)


def _ws_data(data):
    # Masked centrally: download_error messages embed the URL, which carries
    # the Civitai API key as ?token=... - and every connected browser gets it.
    return _mask(data) if isinstance(data, str) else data


loop = asyncio.get_event_loop()
def send_ws(event, data):
    asyncio.run_coroutine_threadsafe(
        server.PromptServer.instance.send(event, _ws_data(data)), loop
    )
