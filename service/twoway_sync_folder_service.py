import asyncio
import shutil
from aiohttp import web
import os
from pathlib import Path
import server
from .setting_service import get_my_workflows_dir
from .path_utils import safe_join, safe_name, UnsafePathError, bad_path_response
try:
    from send2trash import send2trash
except ImportError:
    send2trash = None


async def _run_confined(sync_fn, reqJson):
    """Run a folder operation in a worker thread; a path that escapes the
    workflows dir becomes an HTTP 400 in the usual {success, error} shape."""
    try:
        data = await asyncio.to_thread(sync_fn, reqJson)
    except UnsafePathError as e:
        return bad_path_response(e)
    return web.json_response(data, content_type='application/json')


def _is_workflows_root(path):
    return os.path.normcase(path) == os.path.normcase(os.path.realpath(get_my_workflows_dir()))


@server.PromptServer.instance.routes.post('/workspace/folder/create')
async def create_folder(request):
    reqJson = await request.json()
    return await _run_confined(create_folder_sync, reqJson)

def create_folder_sync(reqJson):
    folder_path = safe_join(get_my_workflows_dir(), reqJson.get('path'))
    try:
        Path(folder_path).mkdir(parents=True, exist_ok=True)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

@server.PromptServer.instance.routes.post('/workspace/folder/delete')
async def delete_folder(request):
    reqJson = await request.json()
    return await _run_confined(delete_folder_sync, reqJson)

def delete_folder_sync(reqJson):
    folder_path = safe_join(get_my_workflows_dir(), reqJson.get('path'))
    # An empty path resolves to the workflows dir itself - never delete that.
    if _is_workflows_root(folder_path):
        raise UnsafePathError("Refusing to delete the workflows root folder")
    try:
        if send2trash:
            send2trash(folder_path)
        else:
            shutil.rmtree(folder_path)
            print("❌⛔️send2trash is not available. Deleting file permanently. Please `pip install send2trash`")
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

@server.PromptServer.instance.routes.post('/workspace/folder/rename')
async def rename_folder(request):
    reqJson = await request.json()
    return await _run_confined(rename_folder_sync, reqJson)

def rename_folder_sync(reqJson):
    current_path = safe_join(get_my_workflows_dir(), reqJson.get('absPath'))
    if _is_workflows_root(current_path):
        raise UnsafePathError("Refusing to rename the workflows root folder")
    # newName is a bare name: with separators or ".." the "rename" could move
    # the folder anywhere on disk.
    new_name = safe_name(reqJson.get('newName'))
    new_path = safe_join(get_my_workflows_dir(), str(Path(current_path).parent / new_name))
    try:
        Path(current_path).rename(new_path)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

@server.PromptServer.instance.routes.post('/workspace/folder/move')
async def move_folder(request):
    reqJson = await request.json()
    return await _run_confined(move_folder_sync, reqJson)

def move_folder_sync(reqJson):
    current_path = safe_join(get_my_workflows_dir(), reqJson.get('folder'))
    if _is_workflows_root(current_path):
        raise UnsafePathError("Refusing to move the workflows root folder")
    new_path = safe_join(get_my_workflows_dir(), reqJson.get('newParentPath') or "")
    try:
        shutil.move(current_path, new_path)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
