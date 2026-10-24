import platform
from aiohttp import web
import asyncio
import json
import os
import traceback
import logging
from threading import Lock
import server
import uuid
from .setting_service import get_my_workflows_dir
from .path_utils import safe_join, is_within, UnsafePathError, bad_path_response, atomic_write_text

@server.PromptServer.instance.routes.get('/workspace/get_os')
async def scan_my_workflows_files(request):
    return web.Response(text= json.dumps({'os': platform.system()}), content_type='application/json')

@server.PromptServer.instance.routes.post('/workspace/file/scan_my_workflows_folder')
async def scan_my_workflows_files(request):
    reqJson = await request.json()
    base = get_my_workflows_dir()
    user_path = reqJson.get('path')
    try:
        # Validate only - traversal keeps using the plain join so the 'path'
        # fields in the answer stay byte-identical to before (no realpath /
        # case normalization that the frontend might compare against).
        safe_join(base, user_path)
    except UnsafePathError as e:
        return bad_path_response(e)
    path = os.path.join(base, user_path)
    recursive = reqJson.get('recursive', False)
    metaInfoOnly = reqJson.get('metaInfoOnly', False)

    fileList = await asyncio.to_thread(folder_handle, path, recursive, metaInfoOnly, None, base)
    return web.Response(text=json.dumps(fileList), content_type='application/json')

def folder_handle(path, recursive, metaInfoOnly, fileList=None, base=None):
    if fileList is None:
        fileList = []
    if base is None:
        base = path
    for item in os.listdir(path):
        item_path = os.path.join(path, item)
        try:
            # A symlink inside the workflows dir can point anywhere. file_handle
            # rewrites JSON files (to add a missing id), so never follow links
            # out of the workflows dir - that would modify foreign files.
            if not is_within(base, item_path):
                continue
            if os.path.isfile(item_path) and item_path.endswith('.json'):
                file_handle(item, fileList, item_path, metaInfoOnly)

            elif os.path.isdir(item_path):
                createTime, updateTime = getFileCreateTime(item_path)
                fileList.append({
                    'name': item,
                    'path': item_path,
                    'type': 'folder',
                    'createTime': createTime,
                    'updateTime': updateTime
                })
                # Recursively scan if recursive is True
                if recursive:
                    folder_handle(item_path, recursive, metaInfoOnly, fileList, base)
        except Exception as e:
            logging.error(f"Error scan workflow {item_path}: {e}, {traceback.format_exc()}")
    return fileList

def file_handle(name, fileList, file_path, metaInfoOnly):
    with open(file_path, 'r', encoding='utf-8') as f:
        json_data = json.load(f)

    if not isinstance(json_data, (dict,)):
        logging.error(f"{file_path} not in proper ComfyUI workflow format")
        return
    
    createTime, updateTime = getFileCreateTime(file_path)
    workspace_info = json_data.get('extra', {}).get('workspace_info', {})   
    workflow_id = workspace_info.get('id', str(uuid.uuid4())) 
    saveLock = workspace_info.get('saveLock', False) 
    cloudID = workspace_info.get('cloudID', None) 
    coverMediaPath = workspace_info.get('coverMediaPath', None) 
    # Update JSON data with new ID if needed and write back to file
    if 'id' not in workspace_info:
        if 'extra' not in json_data:
            json_data['extra'] = {}
        if 'workspace_info' not in json_data['extra']:
            json_data['extra']['workspace_info'] = {}
        json_data['extra']['workspace_info']['id'] = workflow_id
        atomic_write_text(file_path, json.dumps(json_data, ensure_ascii=False, indent=4))
    
    fileInfo = {
            'name': name,
            'type': "workflow",
            'id': workflow_id,
            'path': file_path,
            'saveLock': saveLock,
            'cloudID': cloudID,
            'coverMediaPath': coverMediaPath,
            'createTime': createTime,
            'updateTime': updateTime
        }
    
    if not metaInfoOnly:
        fileInfo['json'] = json.dumps(json_data)
        
    fileList.append(fileInfo)

def getFileCreateTime(path):
    # Cross-platform compatibility for creation time
    file_stats = os.stat(path)
    if platform.system() == 'Windows':
        createTime = int(file_stats.st_ctime * 1000)
    else:  # macOS and potentially others
        createTime = int(getattr(file_stats, 'st_birthtime', file_stats.st_ctime) * 1000)
    
    updateTime = int(file_stats.st_mtime * 1000)
    return createTime, updateTime
