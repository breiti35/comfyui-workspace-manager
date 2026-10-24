import asyncio
import server
from aiohttp import web
import folder_paths
import shutil
import os
import sys
import subprocess
import json

# Windows consoles commonly default to a legacy codepage (e.g. cp1252) that
# cannot encode the emoji used in this plugin's log messages. An unhandled
# UnicodeEncodeError here previously crashed the entire ComfyUI startup, not
# just this plugin's import. Reconfigure stdout/stderr to UTF-8 up front so
# print() calls anywhere in this plugin can no longer trigger that.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass  # stream has no reconfigure() (older Python) or rejected the encoding


def _safe_print(*args, **kwargs):
    """print() that can never raise UnicodeEncodeError and take the whole
    server down with it, even if the reconfigure() above didn't take effect."""
    try:
        print(*args, **kwargs)
    except UnicodeEncodeError:
        print(*(str(a).encode("ascii", "replace").decode("ascii") for a in args), **kwargs)


from .service.media_service import *
from .service.file_sync_service import *
from .service.node_service import *
from .service.setting_service import *
from .service.model_manager.model_installer import *
from .service.path_utils import safe_join, UnsafePathError, bad_path_response, browse_roots, check_browse_allowed, other_file_exists
try:
    from send2trash import send2trash
except ImportError:
    send2trash = None

WEB_DIRECTORY = "entry"
NODE_CLASS_MAPPINGS = {}
__all__ = ['NODE_CLASS_MAPPINGS']
version = "V2.1.0"

_safe_print(f"🦄🦄Loading: Workspace Manager ({version})")
workspace_path = os.path.join(os.path.dirname(__file__))
comfy_path = os.path.dirname(folder_paths.__file__)
db_dir_path = os.path.join(workspace_path, "db")

dist_path = os.path.join(workspace_path, 'dist/workspace_web')
if os.path.exists(dist_path):
    server.PromptServer.instance.app.add_routes([
        web.static('/workspace_web/', dist_path),
    ])
else:
    _safe_print(f"🦄🦄🔴🔴Error: Web directory not found: {dist_path}")

def _workflow_path(user_path):
    """Resolve a client path (relative, or absolute but inside the workflows
    dir) against the my-workflows dir. Raises UnsafePathError otherwise."""
    return safe_join(get_my_workflows_dir(), user_path)


@server.PromptServer.instance.routes.post("/workspace/get_system_dir")
async def get_system_dir(request):
    try:
        reqData = await request.json()
        dir_path = reqData.get('absolute_dir')
        if not dir_path:
            roots = browse_roots()
            dir_path = roots[0] if roots else comfy_path
        if not isinstance(dir_path, str) or '\x00' in dir_path:
            raise ValueError("[workspace] get_system_dir Not a directory")
        # The folder picker has to browse outside the workflows dir, so this
        # is only limited when WORKSPACE_MANAGER_BROWSE_ROOTS is set.
        check_browse_allowed(dir_path)

        def list_dirs():
            if not os.path.isdir(dir_path):
                raise ValueError("[workspace] get_system_dir Not a directory")
            # Only directory names are returned, never files or contents.
            return [folder for folder in os.listdir(dir_path)
                    if os.path.isdir(os.path.join(dir_path, folder)) and not folder.startswith('.')]

        dir_contents = await asyncio.to_thread(list_dirs)
        return web.Response(text=json.dumps({"dir_path": dir_path, "dir_contents": dir_contents}), content_type='application/json')
    except UnsafePathError as e:
        return web.Response(text=json.dumps({"error": str(e)}), status=400, content_type='application/json')
    except Exception as e:
        print('🔴🔴Error',e)
        return web.Response(text=json.dumps({"error": str(e)}), status=500)


@server.PromptServer.instance.routes.get("/workspace/get_my_workflows_dir")
async def fetch_my_workflows_dir(request):
    try:
        dir = get_my_workflows_dir()
        return web.Response(text=json.dumps({"path": dir, "os": sys.platform}), content_type='application/json')
    except Exception as e:
        return web.Response(text=json.dumps({"error": str(e)}), status=500)

@server.PromptServer.instance.routes.post("/workspace/update_file")
async def update_file(request):
    data = await request.json()
    json_str = data.get('json_str')
    try:
        full_path = _workflow_path(data.get('file_path'))
    except UnsafePathError as e:
        return bad_path_response(e)
    # This route only ever wrote workflow JSON; refusing other extensions keeps
    # it from being usable to drop e.g. a .py next to the workflows.
    if not full_path.lower().endswith('.json') or not isinstance(json_str, str):
        return bad_path_response("Only .json workflow files can be written")

    def write_json_to_file():
        print(f"Writing to file: {full_path}")
        # Create the directory if it doesn't exist
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'w', encoding='utf-8') as file:
            file.write(json_str)

    # Offload the file update to a separate thread
    await asyncio.to_thread(write_json_to_file)
    return web.Response(text="File updated successfully")

@server.PromptServer.instance.routes.post("/workspace/delete_file")
async def delete_file(request):
    data = await request.json()
    try:
        full_path = _workflow_path(data.get('file_path'))
    except UnsafePathError as e:
        return bad_path_response(e)

    def sync_delete_file():
        # isfile, not exists: with send2trash a directory path (including the
        # workflows dir itself for an empty file_path) would be trashed whole.
        if os.path.isfile(full_path):
            if send2trash:
                send2trash(full_path)
            else:
                os.remove(full_path)
                print("❌⛔️send2trash is not available. Deleting file permanently. Please `pip install send2trash`")

            return "File deleted successfully"
        else:
            return "File not found"

    # Run the synchronous file operation in a separate thread
    response_text = await asyncio.to_thread(sync_delete_file)

    if response_text == "File not found":
        return web.Response(text=response_text, status=404)
    else:
        return web.Response(text=response_text)


@server.PromptServer.instance.routes.post("/workspace/rename_file")
async def rename_file(request):
    data = await request.json()
    try:
        # Both ends confined: previously this renamed any path on disk to any
        # other path (there was no base dir at all).
        file_path = _workflow_path(data.get('file_path'))
        new_name = _workflow_path(data.get('new_file_path'))
    except UnsafePathError as e:
        return bad_path_response(e)

    def sync_rename():
        if not os.path.exists(file_path):
            return False
        # os.rename would silently replace an existing target on Linux.
        if other_file_exists(file_path, new_name):
            return None
        os.rename(file_path, new_name)
        return True

    try:
        renamed = await asyncio.to_thread(sync_rename)
    except OSError as e:
        return web.Response(text=f"Rename failed: {e}", status=500)
    if renamed is None:
        return bad_path_response("Target already exists")
    if renamed:
        return web.Response(text="File renamed successfully")
    return web.Response(text="File not found", status=404)

@server.PromptServer.instance.routes.post("/workspace/open_workflow_file_browser")
async def open_workflow_file_browser(request):
    my_workflows_dir = get_my_workflows_dir()
    if sys.platform == 'win32':
        cmd = ['explorer', my_workflows_dir]
    elif sys.platform == 'darwin':
        cmd = ['open', my_workflows_dir]
    else:  # Assuming Unix/Linux
        cmd = ['xdg-open', my_workflows_dir]

    def launch():
        # Popen instead of run(): the file browser is a GUI process and must
        # not hold a worker thread until its window is closed.
        subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        await asyncio.to_thread(launch)
        return web.Response(text=json.dumps('open successfully'), content_type='application/json')
    except FileNotFoundError:
        # Headless servers (RunPod, Docker) have no xdg-open - an expected
        # situation, not a server error worth a 500.
        return web.Response(
            text=json.dumps({"error": f"No file browser available on the server ({cmd[0]} not found). Folder: {my_workflows_dir}"}),
            status=501, content_type='application/json')
    except Exception as e:
        return web.Response(text=json.dumps({"error": str(e)}), status=500, content_type='application/json')

@server.PromptServer.instance.routes.post("/workspace/delete_folder")
async def delete_folder(request):
    data = await request.json()
    try:
        folder_path = _workflow_path(data.get('folder_path'))
    except UnsafePathError as e:
        return bad_path_response(e)
    if os.path.normcase(folder_path) == os.path.normcase(os.path.realpath(get_my_workflows_dir())):
        return bad_path_response("Refusing to delete the workflows root folder")

    if os.path.isdir(folder_path):
        await asyncio.to_thread(shutil.rmtree, folder_path)
        return web.Response(text=f"Successfully deleted folder: {folder_path}")
    else:
        return web.Response(text=f"folder not found: {folder_path}", status=404)
