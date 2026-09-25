import asyncio
import folder_paths
from datetime import datetime
import server
import os
from aiohttp import web
import json
import uuid
from pathlib import Path
from .twoway_sync_folder_service import *
import shutil
from .scan_my_workflows_folder import *
from .path_utils import safe_join, safe_name, is_within, check_browse_allowed, UnsafePathError, bad_path_response


def _wf_path(user_path):
    """Client path -> absolute path inside the my-workflows dir, or
    UnsafePathError (turned into HTTP 400 by _run_confined)."""
    return safe_join(get_my_workflows_dir(), user_path)


async def _run_confined(sync_fn, *args):
    try:
        data = await asyncio.to_thread(sync_fn, *args)
    except UnsafePathError as e:
        return bad_path_response(e)
    return web.json_response(data, content_type='application/json')

@server.PromptServer.instance.routes.post('/workspace/file/save')
async def save_file(request):
    reqJson = await request.json()
    return await _run_confined(save_file_sync, reqJson)

def save_file_sync(reqJson):
    current_path = reqJson.get('path')
    new_json_data_str = reqJson.get('json')
    current_path = _wf_path(current_path)
    try:
        new_json_data = json.loads(new_json_data_str)
    except json.JSONDecodeError:
        return { "error": "New JSON data is not valid JSON."}
    expected_id = new_json_data.get('extra', {}).get('workspace_info', {}).get('id', None)
    try:
        with open(current_path, 'r', encoding='utf-8') as file:
            current_json_data = json.load(file)
        # Extract the id from the current file's content
        current_id = current_json_data.get('extra', {}).get('workspace_info', {}).get('id', None)

        # Compare the current id with the expected id
        if current_id is not None and current_id != expected_id:
            return {"error": "Mismatching workspace_info.id."}
    except FileNotFoundError:
        return {"error": f"File not found in path {current_path}"}
    except Exception as e:
        return { "error": str(e)}
    
    # If checks pass, write the new JSON data to the file
    try:
        with open(current_path, 'w', encoding='utf-8') as file:
            file.write(new_json_data_str)
        return {"success": True}
    except Exception as e:
        return { "error": str(e)}

@server.PromptServer.instance.routes.post('/workspace/file/rename')
async def rename_file(request):
    reqJson = await request.json()
    return await _run_confined(rename_file_sync, reqJson)

def rename_file_sync(reqJson):
    current_path = Path(_wf_path(reqJson.get('path')))
    # newName must be a bare file name - "../../x" or an absolute path would
    # turn the rename into a move anywhere on disk.
    new_name = safe_name(reqJson.get('newName'))
    new_path = Path(_wf_path(str(current_path.parent / new_name)))
    try:
        Path(current_path).rename(new_path)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

@server.PromptServer.instance.routes.post('/workspace/file/move')
async def move_file(request):
    reqJson = await request.json()
    return await _run_confined(move_file_sync, reqJson)

def move_file_sync(reqJson):
    current_path = reqJson.get('path')
    new_path = reqJson.get('newParentPath')
    current_path = _wf_path(current_path)
    new_path = _wf_path(new_path or "")
    try:
        shutil.move(current_path, new_path)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

@server.PromptServer.instance.routes.post('/workspace/create_workflow_file')
async def create_workflow_file(request):
    reqJson = await request.json()
    return await _run_confined(create_workflow_file_sync, reqJson)

def create_workflow_file_sync(reqJson):
    try:
        parentFolderPath = reqJson.get('parentFolderPath')
        name = reqJson.get('name')
        workflow_json = reqJson.get('json')
        
        if not name or workflow_json is None:
            print('🔴Create workflow missing necessary data')
            return {}  # Missing necessary data
        abs_path = Path(_wf_path(parentFolderPath or ""))
        # Create the directory if it does not exist
        abs_path.mkdir(parents=True, exist_ok=True)
        
        # Ensuring the file name is unique
        base_name, extension = os.path.splitext(name)
        if extension != '.json':  # Ensure the extension is .json
            extension = '.json'
        new_file_name = base_name + extension
        counter = 1
        while (abs_path / new_file_name).exists():
            new_file_name = f"{base_name}_{counter}{extension}"
            counter += 1
        
        # The name comes from the client too: confine the final file as well.
        new_file_path = Path(_wf_path(str(abs_path / new_file_name)))
        # Writing JSON data to the file
        with open(new_file_path, 'w', encoding='utf-8') as file:
            file.write(workflow_json)
        new_base_name,ext = os.path.splitext(new_file_name)
        return {"name": new_base_name}
    except UnsafePathError:
        raise
    except Exception as e:
        print(f"Failed to create workflow file: {e}")
        return {}  # In case of any error

def read_workflow_file(path, id):
    abs_path = _wf_path(path)
    create_time, update_time = getFileCreateTime(abs_path)
    with open(abs_path, 'r', encoding='utf-8') as f:
        json_data = json.load(f)
        if 'extra' in json_data and 'workspace_info' in json_data['extra'] and 'id' in json_data['extra']['workspace_info']:
            workflow_id = json_data['extra']['workspace_info']['id']
            if workflow_id == id:
                return {"json": json_data, "createTime": create_time, "updateTime": update_time}
            return {"error": "Workflow ID doesn't match"}
    return {"error": "No workspace_info.id found in the file"}


def check_and_update_workflow_id(file_path, seen_ids):
    with open(file_path, "r", encoding="utf-8") as f:
        try:
                json_data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"Error reading JSON from {file_path}: {e}")
            return
        if (
            "extra" in json_data
            and "workspace_info" in json_data["extra"]
            and "id" in json_data["extra"]["workspace_info"]
        ):
            workflow_id = json_data["extra"]["workspace_info"]["id"]
            create_time, update_time = getFileCreateTime(file_path)
            if workflow_id in seen_ids:
                if create_time > seen_ids[workflow_id]["time"]:
                    # Update the current file
                    json_data["extra"]["workspace_info"]["id"] = str(uuid.uuid4())
                    with open(file_path, "w", encoding="utf-8") as f:
                        json.dump(json_data, f)
                else:
                    # Update the previously seen file
                    old_file_path = seen_ids[workflow_id]["path"]
                    with open(old_file_path, "r", encoding="utf-8") as f:
                        old_json_data = json.load(f)
                    old_json_data["extra"]["workspace_info"]["id"] = str(uuid.uuid4())
                    with open(old_file_path, "w", encoding="utf-8") as f:
                        json.dump(old_json_data, f)
            seen_ids[workflow_id] = {
                "time": create_time,
                "path": file_path,
            }


def dedupe_workflow_ids():
    abs_path = get_my_workflows_dir()
    seen_ids = {}
    for root, dirs, files in os.walk(abs_path):
        for file in files:
            if not file.endswith(".json"):
                continue
            file_path = os.path.join(root, file)
            # A symlinked .json pointing outside would get its id rewritten.
            if not is_within(abs_path, file_path):
                continue
            try:
                check_and_update_workflow_id(file_path, seen_ids)
            except Exception as e:
                print(f"Error while processing file {file_path}: {e}")

@server.PromptServer.instance.routes.get('/workspace/deduplicate_workflow_ids')
async def deduplicate_workflow_ids(request):
    await asyncio.to_thread(dedupe_workflow_ids)
    return web.json_response(text="success", content_type='application/json')

@server.PromptServer.instance.routes.post('/workspace/get_workflow_file')
async def get_workflow_file(request):
    reqJson = await request.json()
    path = reqJson.get('path')
    id = reqJson.get('id')
    return await _run_confined(read_workflow_file, path, id)


# Scan .json and folders in the given path
@server.PromptServer.instance.routes.post("/workspace/scan_my_workflows_files")
async def scan_local_new_files(request):
    reqJson = await request.json()
    # Legacy route (the UI uses /workspace/file/scan_my_workflows_folder now).
    # It used to list - and rewrite! - JSON in any directory on disk; it is now
    # confined to the workflows dir like everything else. Relative and
    # absolute-inside paths keep working.
    try:
        path = _wf_path(reqJson.get('path'))
    except UnsafePathError as e:
        return bad_path_response(e)

    fileList = await asyncio.to_thread(folder_handle, path)
    return web.Response(text=json.dumps(fileList), content_type='application/json')

def folder_handle(path):
    fileList = []
    for item in os.listdir(path):
        try:
            item_path = os.path.join(path, item)
            # file_handle rewrites files without an id - never via a symlink
            # that points out of the directory being scanned.
            if not is_within(path, item_path):
                continue
            if os.path.isfile(item_path) and item_path.endswith('.json'):
                with open(item_path, 'r', encoding='utf-8') as f:
                    file_handle(item, f, fileList, item_path)

            elif os.path.isdir(item_path):
                createTime, updateTime = getFileCreateTime(item_path)
                fileList.append({
                    'name': item,
                    'type': 'folder',
                    'createTime': createTime,
                    'updateTime': updateTime
                })
        except Exception as e:
            print(f"Error scanning file {item}: {e}")
    return fileList

def file_handle(name, file, fileList, file_path):
    json_data = json.load(file)
    createTime, updateTime = getFileCreateTime(file_path)
    if 'extra' in json_data and 'workspace_info' in json_data['extra'] and 'id' in json_data['extra']['workspace_info']:
        workflow_id = json_data['extra']['workspace_info']['id']
    else:
        # If ID does not exist, generate a new UUID and add it to the JSON data
        new_id = str(uuid.uuid4())
        json_data.setdefault('extra', {}).setdefault('workspace_info', {})['id'] = new_id
        with open(file_path, 'w', encoding='utf-8') as file:
            json.dump(json_data, file, ensure_ascii=False, indent=4)
    
    fileInfo = {
            'json': json.dumps(json_data),
            'name': name,
            'type': "workflow",
            'id': json_data['extra']['workspace_info']['id'],
            'createTime': createTime,
            'updateTime': updateTime
        }
    fileList.append(fileInfo) 

@server.PromptServer.instance.routes.post('/workspace/file/gen_unique_name')
async def generate_unique_file_name(request):
    reqJson = await request.json()
    return await _run_confined(generate_unique_file_name_sync, reqJson)

def generate_unique_file_name_sync(reqJson):
    file_path = reqJson.get('path')
    if not file_path:
        return {"success": False, "error": "File path is required"}

    path = Path(_wf_path(file_path))
    if not path.parent.is_dir():
        return {"success": False, "error": "Directory of the provided path does not exist"}

    original_name = path.stem
    extension = path.suffix
    directory = path.parent
    counter = 1
    new_name = f"{original_name}{extension}"

    while (directory / new_name).exists():
        new_name = f"{original_name}{counter}{extension}"
        counter += 1

    return {"success": True, "uniqueName": new_name}

@server.PromptServer.instance.routes.post('/workspace/file/count_files')
async def count_files(request):
    reqJson = await request.json()
    return await _run_confined(count_files_sync, reqJson)

def count_files_sync(reqJson):
    directory_path = reqJson.get('path')
    if not directory_path:
        return {"success": False, "error": "Directory path is required"}

    path = Path(_wf_path(directory_path))
    if not path.is_dir():
        return {"success": False, "error": "Provided path is not a directory"}
    file_count = 0
    for file in path.rglob('*.json'):  # Only consider .json files
        if file.is_file():
            file_count += 1
    return {"success": True, "count": file_count}
# Begin: Copy all files to the new directory when switching the save directory
@server.PromptServer.instance.routes.post('/workspace/copy_json_files')
async def copy_json_files(request):
    reqJson = await request.json()
    src_dir = reqJson.get('src')
    dest_dir = reqJson.get('dst')
    try:
        # The only caller (settings -> change workflows dir) sends the current
        # workflows dir as src. Anything else would turn this into "copy any
        # directory tree on the server somewhere else".
        if not isinstance(src_dir, str) or not isinstance(dest_dir, str):
            raise UnsafePathError("src and dst are required")
        current = os.path.realpath(get_my_workflows_dir())
        if os.path.normcase(os.path.realpath(src_dir)) != os.path.normcase(current):
            raise UnsafePathError("src must be the current workflows directory")
        check_browse_allowed(dest_dir)
        if not os.path.isdir(dest_dir):
            raise UnsafePathError("dst is not an existing directory")
        # Copying a tree into its own subfolder recurses until the disk is full.
        if is_within(current, dest_dir):
            raise UnsafePathError("dst must not be inside the current workflows directory")
    except UnsafePathError as e:
        return bad_path_response(e)

    try:
        await asyncio.to_thread(_copy_json_files_sync, src_dir, dest_dir)
        return web.json_response({"success": True}, content_type='application/json')
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, content_type='application/json')

def _copy_json_files_sync(src_dir, dest_dir):
    for item in os.listdir(src_dir):
        src_item_path = os.path.join(src_dir, item)
        dest_item_path = os.path.join(dest_dir, item)

        if os.path.isdir(src_item_path):
            dest_item_path = get_unique_dir_name(dest_item_path)
            # symlinks=True: copy links as links instead of pulling in
            # whatever they point to outside the workflows dir.
            shutil.copytree(src_item_path, dest_item_path, symlinks=True)
        elif item.endswith('.json'):
            dest_item_path = get_unique_file_name(dest_item_path)
            shutil.copy2(src_item_path, dest_item_path)

def get_unique_file_name(path):
    base, extension = os.path.splitext(path)
    counter = 1
    while os.path.exists(path):
        path = f"{base}_{counter}{extension}"
        counter += 1
    return path

def get_unique_dir_name(path):
    original_path = path
    counter = 1
    while os.path.exists(path):
        path = f"{original_path}_{counter}"
        counter += 1
    return path
# End: Copy all files to the new directory when switching the save directory

# Cover images only - view_media serves these with an image content type.
ALLOWED_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}
# Cover images are small; the cap keeps a single request from filling the
# (often small, ephemeral) container disk or RAM.
MAX_IMAGE_UPLOAD_BYTES = 50 * 1024 * 1024


def _write_bytes(path, data):
    with open(path, 'wb') as f:
        f.write(data)


@server.PromptServer.instance.routes.post('/workspace/images/save')
async def save_images(request):
    reader = await request.multipart()
    subfolder = "workspace_manager"  # fixed subfolder of the ComfyUI output dir
    output_path = folder_paths.get_output_directory()
    safe_dir = Path(os.path.join(output_path, subfolder))
    if not safe_dir.exists():
        safe_dir.mkdir(parents=True, exist_ok=True)

    files_saved = []
    errors = []
    async for part in reader:
        if not part.name or not part.name.startswith('images'):
            continue
        # basename(): the multipart filename is client controlled
        # ("../../custom_nodes/x.py" would otherwise be written as-is).
        # Browsers already send a bare name, so the UI's
        # "workspace_manager/<file.name>" reference stays valid.
        filename = os.path.basename((part.filename or '').replace('\\', '/'))
        if not filename or filename in ('.', '..'):
            continue
        if os.path.splitext(filename)[1].lower() not in ALLOWED_IMAGE_EXTENSIONS:
            errors.append(f"{filename}: file type not allowed")
            continue
        try:
            file_path = safe_join(safe_dir, filename, allow_absolute=False)
        except UnsafePathError as e:
            errors.append(str(e))
            continue

        data = bytearray()
        too_big = False
        while True:
            chunk = await part.read_chunk(1024 * 1024)
            if not chunk:
                break
            data.extend(chunk)
            if len(data) > MAX_IMAGE_UPLOAD_BYTES:
                too_big = True
                break
        if too_big:
            errors.append(f"{filename}: larger than {MAX_IMAGE_UPLOAD_BYTES // (1024 * 1024)} MB")
            continue
        # One thread hop for the whole file instead of one per 8 KB chunk.
        await asyncio.to_thread(_write_bytes, file_path, bytes(data))
        files_saved.append(str(file_path))

    result = {"imgPaths": files_saved}
    if errors:
        result["errors"] = errors
    status = 400 if errors and not files_saved else 200
    return web.Response(text=json.dumps(result), content_type='application/json', status=status)
