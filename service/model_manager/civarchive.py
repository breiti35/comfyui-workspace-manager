"""CivArchive fallback lookup.

For models that Civitai no longer knows (deleted models, or models that only
ever lived on another platform), CivArchive (civitaiarchive.com) keeps a
SHA256-indexed mirror that aggregates CivitAI, HuggingFace, TensorArt, SeaArt,
PixAI, ... . It exposes no official JSON API, so we fetch its public
`/sha256/<hash>` page server-side (no browser CORS) and read the model info out
of the embedded Next.js `__NEXT_DATA__` payload.

Server-side on purpose: the browser can't cross-origin-fetch + HTML-parse that
page, and doing it here also lets us cache results process-wide so a big model
grid doesn't hammer CivArchive.
"""

import asyncio
import json
import re
import threading
import time
import urllib.request

import server
from aiohttp import web

_CIVARCHIVE_BASE = "https://civitaiarchive.com"
_NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
    re.DOTALL,
)

# Process-wide cache: hash -> (timestamp, result_or_None). None = a miss
# (not found / error) and gets a much shorter TTL than a hit, so unknown
# hashes retry occasionally instead of re-fetching on every grid render.
_cache = {}
_cache_lock = threading.Lock()
_SUCCESS_TTL = 7 * 24 * 60 * 60  # 7 days
_FAILURE_TTL = 6 * 60 * 60       # 6 hours

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _fetch_html(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as response:
        data = response.read()
        charset = response.headers.get_content_charset("utf-8")
        return data.decode(charset, "replace")


def _lookup_civarchive(file_hash: str):
    """Return a dict with a preview image + model info, {} for a confirmed
    'not in archive', or None on a network/parse error (retry sooner).

    Works across all platforms CivArchive indexes - the result is whatever the
    archive has for this SHA256, regardless of the original source site.
    """
    url = f"{_CIVARCHIVE_BASE}/sha256/{file_hash}"
    try:
        html = _fetch_html(url)
    except Exception:
        return None
    match = _NEXT_DATA_RE.search(html)
    if not match:
        return None
    try:
        page_props = json.loads(match.group(1))["props"]["pageProps"]
    except Exception:
        return None

    meta = page_props.get("meta") or {}
    models = page_props.get("models") or []
    files = page_props.get("files") or []
    image_url = meta.get("image")

    # A real hit has at least one mirrored file/model AND a preview image.
    # The "not found" page still renders __NEXT_DATA__ but with empty lists.
    if not image_url or not (models or files):
        return {}

    model = models[0] if models else {}
    file0 = files[0] if files else {}
    return {
        "imageUrl": image_url,
        "modelName": model.get("name"),
        "modelType": model.get("type"),
        "nsfwLevel": model.get("nsfw_level"),
        # Which platform the mirror came from (civitai, huggingface, ...), so
        # the UI can label / link appropriately.
        "source": file0.get("source"),
        "sourceModelId": file0.get("model_id"),
        "sourceModelVersionId": file0.get("model_version_id"),
    }


@server.PromptServer.instance.routes.get("/model_manager/civarchive_by_hash")
async def civarchive_by_hash(request):
    file_hash = request.query.get("hash")
    if not file_hash:
        return web.json_response({})
    file_hash = file_hash.strip().lower()

    now = time.time()
    with _cache_lock:
        entry = _cache.get(file_hash)
        if entry is not None:
            ts, result = entry
            ttl = _SUCCESS_TTL if result else _FAILURE_TTL
            if now - ts < ttl:
                return web.json_response(result or {})

    # urllib is blocking - keep it off the aiohttp event loop.
    result = await asyncio.get_event_loop().run_in_executor(
        None, _lookup_civarchive, file_hash
    )

    with _cache_lock:
        _cache[file_hash] = (now, result if result else None)
    return web.json_response(result or {})
