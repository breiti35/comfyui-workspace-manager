"""Editable free-text notes per installed model.

Stored server-side in model_notes.json next to the hash cache (so on Runpod it
lives on the persistent volume via WORKSPACE_MANAGER_HASH_DIR). Key:
"<model_type>/<model_name><model_extension>". The client never supplies a
file path; it only names the model.
"""

import asyncio
import json
import os
import threading

import server
from aiohttp import web

from ..path_utils import atomic_write_text, bad_path_response

MAX_NOTE_LENGTH = 10_000
_lock = threading.Lock()


def _notes_path():
    # Resolved at call time (late import avoids a cycle with model_list,
    # which calls remove_note when a model is deleted).
    from . import model_list

    return os.path.join(model_list.FILE_HASH_DICT_FOLDER_PATH, "model_notes.json")


def note_key(model_type, model_name, model_extension):
    return f"{model_type}/{model_name}{model_extension}"


def _load():
    try:
        with open(_notes_path(), "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {k: v for k, v in data.items() if isinstance(k, str) and isinstance(v, str)}


def _save(notes):
    atomic_write_text(_notes_path(), json.dumps(notes, ensure_ascii=False, indent=2))


def get_notes():
    with _lock:
        return _load()


def set_note(model_type, model_name, model_extension, note):
    """Store a note; an empty (or whitespace-only) note deletes the entry.
    Raises ValueError on invalid input."""
    if not all(isinstance(x, str) for x in (model_type, model_name, model_extension)):
        raise ValueError("model_type, model_name and model_extension are required")
    if not (model_type and model_name):
        raise ValueError("model_type and model_name must not be empty")
    if not isinstance(note, str):
        raise ValueError("note must be a string")
    if len(note) > MAX_NOTE_LENGTH:
        raise ValueError(f"note is too long (max {MAX_NOTE_LENGTH} characters)")
    key = note_key(model_type, model_name, model_extension)
    with _lock:
        notes = _load()
        if note.strip():
            notes[key] = note
        elif key in notes:
            del notes[key]
        else:
            return
        _save(notes)


def remove_note(model_type, model_name, model_extension):
    """Best-effort removal (used when a model is deleted)."""
    key = note_key(model_type, model_name, model_extension)
    try:
        with _lock:
            notes = _load()
            if key in notes:
                del notes[key]
                _save(notes)
    except OSError as e:
        print(f"[Workspace Manager] Could not remove model note {key}: {e}")


@server.PromptServer.instance.routes.get("/model_manager/model_notes")
async def model_notes_route(request):
    notes = await asyncio.get_running_loop().run_in_executor(None, get_notes)
    return web.json_response(notes)


@server.PromptServer.instance.routes.post("/model_manager/model_note")
async def model_note_route(request):
    try:
        data = await request.json()
        if not isinstance(data, dict):
            raise ValueError("JSON object expected")
        await asyncio.get_running_loop().run_in_executor(
            None,
            set_note,
            data.get("model_type"),
            data.get("model_name"),
            data.get("model_extension"),
            data.get("note"),
        )
    except (ValueError, OSError) as e:
        return bad_path_response(e)
    return web.json_response({"success": True})
