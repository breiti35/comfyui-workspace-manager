"""Tests fuer das Modell-Listing (service/model_manager/model_list.py).

Hintergrund: Auf dem RunPod blieb das Modell-Panel teils leer, weil der erste
HTTP-Aufruf die noch leere In-Memory-Liste lieferte und der Rest nur per
WebSocket nachkam. Jetzt muss die HTTP-Antwort die Liste selbst tragen, und
das Hashen darf das Listing nicht blockieren.
"""

import asyncio
import hashlib
import time

import pytest


class _Req:
    def __init__(self, query=None):
        class _Url:
            pass

        self.rel_url = _Url()
        self.rel_url.query = query or {}


@pytest.fixture
def ml(tmp_path, monkeypatch):
    from service.model_manager import model_list as ml
    import folder_paths

    models = {
        "loras": tmp_path / "loras",
        "diffusion_models": tmp_path / "diffusion_models",
        "broken": tmp_path / "broken",
        "configs": tmp_path / "configs",
    }
    for d in models.values():
        d.mkdir()
    (models["loras"] / "a.safetensors").write_bytes(b"lora-a")
    (models["diffusion_models"] / "minimax_h3.safetensors").write_bytes(b"big")
    (models["configs"] / "x.yaml").write_text("x")

    def get_filename_list(folder):
        if folder == "broken":
            raise OSError("network volume gone")
        return sorted(p.name for p in models[folder].iterdir())

    def get_full_path(folder, name):
        return str(models[folder] / name)

    monkeypatch.setattr(
        folder_paths,
        "folder_names_and_paths",
        {k: ([str(v)], set()) for k, v in models.items()},
        raising=False,
    )
    monkeypatch.setattr(folder_paths, "get_filename_list", get_filename_list, raising=False)
    monkeypatch.setattr(folder_paths, "get_full_path", get_full_path, raising=False)
    monkeypatch.setattr(ml, "FILE_HASH_DICT_PATH", str(tmp_path / "hash_dict"))
    monkeypatch.setattr(ml, "_hash_cache_available", True)

    sent = []
    monkeypatch.setattr(ml, "send_ws", lambda ev, data: sent.append((ev, data)))
    monkeypatch.setattr(ml, "file_list", [])
    monkeypatch.setattr(ml, "_scan_done", False)
    monkeypatch.setattr(ml, "_scan_running", False)
    monkeypatch.setattr(ml, "_rescan_requested", False)
    monkeypatch.setattr(ml, "_hash_running", False)
    monkeypatch.setattr(ml, "HASH_PUSH_INTERVAL_S", 0.0)
    ml._test_sent = sent
    ml._test_models = models
    return ml


def _wait(cond, timeout=5.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if cond():
            return True
        time.sleep(0.02)
    return False


def _call(ml, query=None):
    resp = asyncio.run(ml.get_model_list(_Req(query)))
    import json

    return json.loads(resp.body)


def test_erster_aufruf_liefert_vollstaendige_liste(ml):
    data = _call(ml)
    types = sorted({d["model_type"] for d in data})
    assert types == ["diffusion_models", "loras"]


def test_kaputter_ordner_kostet_die_anderen_nicht(ml):
    data = _call(ml)
    assert {d["model_name"] for d in data} == {"a", "minimax_h3"}


def test_hashes_werden_berechnet_und_gepusht(ml):
    _call(ml)
    assert _wait(lambda: all(f["file_hash"] for f in ml.file_list))
    assert _wait(lambda: not ml._hash_running)
    by_name = {f["model_name"]: f["file_hash"] for f in ml.file_list}
    assert by_name["a"] == hashlib.sha256(b"lora-a").hexdigest()
    last = [d for ev, d in ml._test_sent if ev == "model_list"][-1]
    assert all(d["file_hash"] for d in last)


def test_hash_cache_wird_beim_naechsten_scan_genutzt(ml, monkeypatch):
    _call(ml)
    assert _wait(lambda: not ml._hash_running and all(f["file_hash"] for f in ml.file_list))

    def boom(path):
        raise AssertionError("haette aus dem Cache kommen muessen")

    monkeypatch.setattr(ml, "compute_hash", boom)
    data = _call(ml, {"fresh": "1"})
    assert all(d["file_hash"] for d in data)


def test_fresh_findet_neue_datei_sofort(ml):
    _call(ml)
    (ml._test_models["loras"] / "neu.safetensors").write_bytes(b"neu")
    data = _call(ml, {"fresh": "1"})
    assert "neu" in {d["model_name"] for d in data}


def test_rescan_waehrend_laufendem_scan_geht_nicht_verloren(ml, monkeypatch):
    calls = []
    real = ml.scan_models

    def slow_scan():
        calls.append(1)
        time.sleep(0.1)
        return real()

    monkeypatch.setattr(ml, "scan_models", slow_scan)
    ml.start_populate_file_hash_dict()
    ml.start_populate_file_hash_dict()  # kommt waehrend des ersten Scans
    assert _wait(lambda: not ml._scan_running)
    assert len(calls) == 2


def test_delete_model_entfernt_datei_und_vorschau(ml, monkeypatch):
    import folder_paths

    monkeypatch.setattr(
        folder_paths, "get_folder_paths", lambda n: [str(ml._test_models[n])], raising=False
    )
    lora_dir = ml._test_models["loras"]
    (lora_dir / "a.png").write_bytes(b"x")
    ml.delete_model_files("loras", "a", ".safetensors")
    assert not (lora_dir / "a.safetensors").exists()
    assert not (lora_dir / "a.png").exists()


def test_delete_model_lehnt_fremde_pfade_ab(ml, monkeypatch, tmp_path):
    import folder_paths

    monkeypatch.setattr(
        folder_paths, "get_folder_paths", lambda n: [str(ml._test_models[n])], raising=False
    )
    outside = tmp_path / "geheim.txt"
    outside.write_text("x")
    with pytest.raises(ValueError):
        ml.delete_model_files("loras", "../geheim", ".txt")
    assert outside.exists()


# ---- model notes -----------------------------------------------------------


@pytest.fixture
def notes(ml, tmp_path, monkeypatch):
    from service.model_manager import model_notes

    monkeypatch.setattr(ml, "FILE_HASH_DICT_FOLDER_PATH", str(tmp_path / "hashdir"))
    return model_notes


def test_note_save_overwrite_and_clear(notes):
    notes.set_note("loras", "a", ".safetensors", "hello\nÄ")
    assert notes.get_notes() == {"loras/a.safetensors": "hello\nÄ"}
    notes.set_note("loras", "a", ".safetensors", "second")
    assert notes.get_notes() == {"loras/a.safetensors": "second"}
    notes.set_note("loras", "a", ".safetensors", "  ")
    assert notes.get_notes() == {}


def test_note_validation(notes):
    with pytest.raises(ValueError):
        notes.set_note("loras", "a", ".safetensors", "x" * (notes.MAX_NOTE_LENGTH + 1))
    with pytest.raises(ValueError):
        notes.set_note("loras", "a", ".safetensors", 5)
    with pytest.raises(ValueError):
        notes.set_note(None, "a", ".safetensors", "x")
    assert notes.get_notes() == {}


def test_note_corrupt_file_reads_empty(notes):
    import os

    path = notes._notes_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write("{broken")
    assert notes.get_notes() == {}


def test_delete_model_removes_note(ml, notes, monkeypatch):
    import folder_paths

    monkeypatch.setattr(
        folder_paths, "get_folder_paths", lambda n: [str(ml._test_models[n])], raising=False
    )
    notes.set_note("loras", "a", ".safetensors", "keep me?")
    notes.set_note("loras", "other", ".safetensors", "stay")
    ml.delete_model_files("loras", "a", ".safetensors")
    assert notes.get_notes() == {"loras/other.safetensors": "stay"}
