import asyncio
import subprocess
import os
import re
import sys
from aiohttp import web
import folder_paths
import urllib.request
import threading
import server
import time
from .missing_models import find_missing_models  # type: ignore noqa
from .model_list import start_populate_file_hash_dict, save_file_hash
from . import civarchive  # noqa: F401  (registers /model_manager/civarchive_by_hash)

comfy_path = os.path.dirname(folder_paths.__file__)


def download_url_with_wget(url, save_path):
    print(f"Downloading {url} to {save_path} ...")
    if not is_wget_installed():
        print(
            "wget is not installed. Please install wget or use a different download method."
        )
        return False

    try:
        # url="https://github.com/Weixuanf/cdn-test/blob/main/workspace-manager-5YgCydJJ.js"
        command = f"wget -c '{url}' -O '{save_path}' --show-progress"
        process = subprocess.Popen(command, shell=True, stderr=subprocess.PIPE)

        while True:
            output = process.stderr.readline()
            if process.poll() is not None and output == b"":
                break
            if output:
                progress = parse_wget_output(output.decode())
                sys.stdout.write(f"\r{progress}")
                sys.stdout.flush()

        process.poll()
    except subprocess.CalledProcessError as e:
        print(f"Download error with wget: {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        return False

    print("\nDownload completed successfully.")
    return True


def is_wget_installed():
    try:
        subprocess.run(
            "wget --version",
            shell=True,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except subprocess.CalledProcessError:
        return False


def parse_wget_output(output):
    """
    Parse wget output to extract and return the download progress.
    """
    match = re.search(r"\d+%|\d+K \d+Kb/s", output)
    return match.group(0) if match else ""


# Create a dictionary to store download tasks
download_tasks = []
# Create a lock object to synchronize access to the dictionary
download_tasks_lock = threading.Lock()
# Create a thread that will execute the download tasks
download_thread = None
# Create a variable to store the path of the download that needs to be canceled
cancel_path = None


def download_worker():
    while True:
        task = None
        with download_tasks_lock:
            # Get a task from the list
            if download_tasks:
                task = download_tasks.pop(0)
        if task is not None:
            # Execute the download task and update the download progress
            download_url_with_agent(
                url=task["url"],
                save_path=task["save_path"],
                file_name=task["filename"],
                file_hash=task.get("file_hash"),
                force_filename=task.get("force_filename", False),
            )
            # calculate newly downloaded models' hash
            start_populate_file_hash_dict()

        else:
            # No more tasks, break the loop
            send_ws("download_progress", [])
            break


@server.PromptServer.instance.routes.post("/model_manager/install_model")
async def install_model(request):
    global download_thread

    json_data = await request.json()
    with download_tasks_lock:
        # Add the task to the list
        download_tasks.append(json_data)

    # If the previous thread is not active, start a new one
    if download_thread is None or not download_thread.is_alive():
        download_thread = threading.Thread(target=download_worker)
        download_thread.daemon = True
        download_thread.start()

    return web.Response(
        text=f"Downloading {json_data['url']} to {json_data['save_path']} ..."
    )


@server.PromptServer.instance.routes.post("/model_manager/cancel_installation")
async def cancel_installation(request):
    global download_thread, cancel_path

    json_data = await request.json()
    save_path = json_data["save_path"]
    is_canceled = False
    with download_tasks_lock:
        # Remove the task from the list
        for task in download_tasks:
            if task["filename"] == save_path:
                download_tasks.remove(task)
                is_canceled = True
                break
        print(download_tasks)

    # if the download is not in task list, the download is in progress, cancel it
    if not is_canceled:
        cancel_path = save_path

    return web.Response(text=f"Canceled download to {save_path} ...")


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


def _resolve_download(url):
    """Plain GET (NO Range header) that follows redirects to the final CDN URL
    and reads the total size. Deliberately no Range: some CDNs (HuggingFace's
    xet CDN) sign the redirect target to the exact Range of the first request,
    which would then reject the differing per-segment range requests. Returns
    (final_url, total_bytes, content_disposition)."""
    req = urllib.request.Request(url, headers=_DOWNLOAD_HEADERS)
    with urllib.request.urlopen(req) as response:
        _raise_if_html_auth_page(response)
        return (
            response.geturl(),
            int(response.headers.get("Content-Length", 0) or 0),
            response.headers.get("Content-Disposition"),
        )


def _supports_range(url):
    """Probe whether the already-resolved final URL honors range requests, so
    we know if the download can be split into parallel segments. Runs directly
    against the final URL (no redirect), so the range definitely applies."""
    try:
        req = urllib.request.Request(
            url, headers={**_DOWNLOAD_HEADERS, "Range": "bytes=0-1"}
        )
        with urllib.request.urlopen(req) as response:
            return response.status == 206
    except Exception:
        return False


def _download_single(url, temp_file_path, file_path, total):
    """Fallback: classic single-stream download (used when the server has no
    range support or the file is small)."""
    global cancel_path
    req = urllib.request.Request(url, headers=_DOWNLOAD_HEADERS)
    with urllib.request.urlopen(req) as response, open(temp_file_path, "wb") as f:
        _raise_if_html_auth_page(response)
        if not total:
            total = int(response.headers.get("Content-Length", 0))
        downloaded = 0
        meter = _SpeedMeter()
        while True:
            if cancel_path == file_path:
                break
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
    if cancel_path == file_path:
        return False
    return True


def _download_parallel(url, temp_file_path, file_path, total):
    """Segmented multi-connection download: split the byte range into
    DOWNLOAD_CONNECTIONS parts, fetch them concurrently, and write each into
    its region of the pre-sized temp file. Aggregate progress is reported as a
    single combined percentage."""
    global cancel_path
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
        try:
            req = urllib.request.Request(
                url, headers={**_DOWNLOAD_HEADERS, "Range": f"bytes={start}-{end}"}
            )
            with urllib.request.urlopen(req) as resp, open(
                temp_file_path, "r+b"
            ) as f:
                f.seek(start)
                while not stop.is_set() and cancel_path != file_path:
                    chunk = resp.read(DOWNLOAD_CHUNK_SIZE)
                    if not chunk:
                        break
                    f.write(chunk)
                    with lock:
                        downloaded[idx] += len(chunk)
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
        if cancel_path == file_path:
            stop.set()
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

    if cancel_path == file_path:
        return False
    if errors:
        raise errors[0]
    with lock:
        done = sum(downloaded)
    if done != total:
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


def download_url_with_agent(url, save_path, file_name, file_hash, force_filename=False):
    print("download_url_with_agent", url, save_path)
    global cancel_path

    temp_file_path = None
    try:
        print(f"Downloading {url} to {save_path} ...")
        final_url, total, content_disposition = _resolve_download(url)
        use_parallel = total > PARALLEL_MIN_BYTES and _supports_range(final_url)
        print(f"File size: {total} bytes, parallel: {use_parallel}")

        if not force_filename and content_disposition:
            match = re.search(r'filename="([^"]+)"', content_disposition)
            if match:
                file_name = match.group(1)
        file_path = os.path.join(get_model_dir(save_path), file_name)
        if file_hash is not None:
            save_file_hash(file_path, file_hash)

        temp_file_path = file_path + ".temp"
        if not os.path.exists(os.path.dirname(temp_file_path)):
            os.makedirs(os.path.dirname(temp_file_path))

        if use_parallel:
            completed = _download_parallel(final_url, temp_file_path, file_path, total)
        else:
            completed = _download_single(final_url, temp_file_path, file_path, total)

        if not completed:
            # Canceled - clean up the partial temp file and reset the flag.
            print(f"\nDownload to {save_path} is canceled.")
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            cancel_path = None
            return False

        # Rename temp file to final filename after successful download
        os.rename(temp_file_path, file_path)

    except Exception as e:
        print(f"\nDownload error: {url} / {e}", file=sys.stderr)
        send_ws("download_error", f"{url} / {e}")
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)  # Clean up the temporary file in case of failure
        return False

    print("\nDownload complete. File saved as:", save_path)
    return True

def get_model_dir(save_path):
    if os.path.isabs(save_path):
        return save_path
    else:
        return folder_paths.folder_names_and_paths[save_path][0][0]


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


loop = asyncio.get_event_loop()
def send_ws(event, data):
    asyncio.run_coroutine_threadsafe(
        server.PromptServer.instance.send(event, data), loop
    )
