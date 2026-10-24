import server
import os
import folder_paths
import json
import asyncio
from aiohttp import web
from .db_service import DEFAULT_USER, read_table, db_dir_path
from .path_utils import (
    atomic_write_text,
    bad_path_response,
    browse_roots,
    is_forbidden_workflows_dir,
    is_within,
)

comfy_path = os.path.dirname(folder_paths.__file__)

@server.PromptServer.instance.routes.get("/workspace/get_settings")
async def get_settings_endpoint(request):
    settings = await asyncio.to_thread(get_settings)
    return web.json_response(text=json.dumps(settings), content_type='application/json')

def get_settings():
    new_settings_path = os.path.join(db_dir_path, 'settings.json')
    if os.path.exists(new_settings_path):
        # to deprecate and remove legacy settings file
        # if os.path.exists(f'{db_dir_path}/useSettings.json'):
        #     os.remove(f'{db_dir_path}/useSettings.json')
        try:
            with open(new_settings_path, 'r', encoding='utf-8') as file:
                return json.load(file)
        except UnicodeDecodeError:
            # Files written before the switch to UTF-8 used the platform
            # default encoding (cp1252 on Windows) - still read those.
            with open(new_settings_path, 'r') as file:
                return json.load(file)
    data = read_table('userSettings')
    if (data):
        records = json.loads(data)
        if DEFAULT_USER in records and 'myWorkflowsDir' in records[DEFAULT_USER]:
            return records[DEFAULT_USER]
    return None

@server.PromptServer.instance.routes.post("/workspace/save_settings")
async def save_settings(request):
    data = await request.json()
    json_data = data
    new_dir = data.get('myWorkflowsDir') if isinstance(data, dict) else None
    if isinstance(new_dir, dict):
        new_dir = new_dir.get('path')
    if isinstance(new_dir, str) and new_dir and is_forbidden_workflows_dir(new_dir):
        return bad_path_response("Operation not permitted: this folder cannot be used as workflows folder")
    file_name = os.path.join(db_dir_path, 'settings.json')
    # Offload file writing to a separate thread. Atomic + UTF-8: a truncated
    # settings.json would lose the configured workflows dir and API keys.
    await asyncio.to_thread(atomic_write_text, file_name, json.dumps(json_data, indent=4))
    return web.Response(text=f"JSON saved to {file_name}")

def get_my_workflows_dir():
    data = get_settings()
    if (data):
        curDir = data.get('myWorkflowsDir')

        # this is to be compatible of a bug that a dict is stored in userSettings.myWorkflowsDir
        # should not be needed once all users refresh their settings
        if curDir is not None and not isinstance(curDir, str):
            curDir = curDir.get('path', None)

        if curDir and os.path.exists(curDir) and is_forbidden_workflows_dir(curDir):
            print(f"[workspace] myWorkflowsDir {curDir} is a system folder, using the default")
        elif curDir and os.path.exists(curDir):
            # The workflows dir is the base every path check confines to. If
            # the operator restricted browsing (WORKSPACE_MANAGER_BROWSE_ROOTS),
            # a dir outside those roots - e.g. "/" set via save_settings -
            # must not become that base.
            roots = browse_roots()
            if not roots or any(is_within(root, curDir) for root in roots):
                return curDir
            print(f"[workspace] myWorkflowsDir {curDir} is outside WORKSPACE_MANAGER_BROWSE_ROOTS, using the default")
    return os.path.join(comfy_path, 'my_workflows')
