import server
import os
import re
import folder_paths
import json
import asyncio
from aiohttp import web
from .model_manager.model_preview import get_thumbnail_for_image_file
from .path_utils import atomic_write_text

workspace_path = os.path.join(os.path.dirname(os.path.dirname(__file__)))
comfy_path = os.path.dirname(folder_paths.__file__)
db_dir_path = os.path.join(workspace_path, "db")
DEFAULT_USER = "guest"

# Table names end up in a file name (db/<table>.json). Without this check
# "table": "../../custom_nodes/x/__init__" wrote arbitrary files - with a .json
# suffix, but still anywhere on disk. All real tables are plain identifiers
# (workflows, userSettings, prompts, ...).
_TABLE_NAME_RE = re.compile(r"^[A-Za-z0-9_]+$")


def is_valid_table_name(table):
    return isinstance(table, str) and bool(_TABLE_NAME_RE.match(table))


def table_file_path(table):
    return os.path.join(db_dir_path, f"{table}.json")


@server.PromptServer.instance.routes.post("/workspace/save_db")
async def save_db(request):
    # Extract parameters from the request
    data = await request.json()
    table = data.get('table')
    json_data = data.get('json')
    if not is_valid_table_name(table):
        return web.json_response({"error": "Invalid table name"}, status=400)

    file_name = table_file_path(table)
    # Offload file writing to a separate thread; atomic so a crash mid-write
    # can't truncate the table (see atomic_write_text).
    await asyncio.to_thread(atomic_write_text, file_name, json.dumps(json_data, indent=4))
    return web.Response(text=f"JSON saved to {file_name}")

def read_table(table):
    if not is_valid_table_name(table):
        return None
    file_name = table_file_path(table)
    if not os.path.exists(file_name):
        return None

    try:
        with open(file_name, 'r', encoding='utf-8') as file:
            data = json.load(file)
            return data
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        return None


@server.PromptServer.instance.routes.get("/workspace/get_db")
async def get_workspace(request):
    # Extract the table parameter from the query string
    table = request.query.get('table')
    if table and not is_valid_table_name(table):
        return web.json_response({"error": "Invalid table name"}, status=400)
    data = await asyncio.to_thread(read_table, table)
    return web.json_response(data)
