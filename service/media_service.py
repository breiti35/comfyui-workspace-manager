
import asyncio
import json
import server
from aiohttp import web
import folder_paths
import os
from .model_manager.model_preview import get_thumbnail_for_image_file
from .path_utils import safe_join, UnsafePathError

image_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
video_extensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv']

def view_media(filename, isPreview = False, isInput = False):
    if not filename:
        return web.Response(status=404)

    # validation for security: prevent accessing arbitrary path.
    # os.path.isabs() also catches a leading backslash and Windows drive paths
    # ("C:\...") on top of a leading "/" - for those, the os.path.join() below
    # would silently drop the base directory and escape it
    # (os.path.join('out', 'C:/x') -> 'C:/x').
    if os.path.isabs(filename) or '..' in filename:
        return web.Response(status=400)

    path = folder_paths.get_input_directory() if isInput else folder_paths.get_output_directory()
    # The checks above only catch the obvious spellings; safe_join resolves
    # the final path (symlinks included) and verifies it is still inside.
    try:
        file_path = safe_join(path, filename, allow_absolute=False)
    except UnsafePathError:
        return web.Response(status=400)

    if not os.path.exists(file_path):
        return web.Response(status=404)

    file_extension = os.path.splitext(filename)[1].lower()
    if isPreview and file_extension in image_extensions:
            return web.json_response(
                body=get_thumbnail_for_image_file(file_path),
                content_type='image/jpeg',
                headers={"Content-Disposition": f"filename=\"{filename}.jpg\""}
            )

    content_type = 'application/json'

    if file_extension in image_extensions:
        content_type = f'image/{file_extension[1:]}'
    if file_extension in video_extensions:
        content_type = f'video/{file_extension[1:]}'

    # FileResponse instead of reading the whole file into memory: it handles
    # Accept-Ranges, 206 partial responses with Content-Range and 416 on an
    # unsatisfiable range by itself - required so the video player can seek,
    # and so a large file isn't pulled into RAM just to serve it. Delivery goes
    # through sendfile in the executor, so it doesn't block the event loop.
    response = web.FileResponse(
        path=file_path,
        headers={"Content-Disposition": f"filename=\"{filename}\""}
    )
    response.content_type = content_type
    return response

@server.PromptServer.instance.routes.get("/workspace/preview_media")
async def preview_file(request):
    filename = request.query.get("filename", None)
    # to_thread still pays off here: the isPreview branch generates a thumbnail
    # synchronously via PIL (blocking). Serving large files no longer blocks in
    # this call - FileResponse handles that itself while sending.
    return await asyncio.to_thread(view_media, filename, True)

@server.PromptServer.instance.routes.get("/workspace/view_media")
async def view_file(request):
    filename = request.query.get("filename", None)
    # Query values are strings: the old truthiness check treated
    # "?isInput=false" as True. Only an explicit "true" enables a flag.
    isPreview = request.query.get("isPreview", "").lower() == "true"
    isInput = request.query.get("isInput", "").lower() == "true"
    return await asyncio.to_thread(view_media, filename, isPreview, isInput)

