"""Tests fuer die Pfad-Sicherheit aller Routen, die Pfade vom Client annehmen.

ComfyUI hat keine Authentifizierung und ist auf RunPod & Co. oeffentlich
erreichbar. Vorher liess sich ueber diese Routen jede Datei auf dem Server
lesen, ueberschreiben, umbenennen oder loeschen. Geprueft wird:

- safe_join() selbst (relative/absolute Pfade, "..", "C:foo", NUL)
- die Workflow-Routen: Zugriff nur innerhalb des my-workflows-Ordners,
  legitime Aufrufe (relative Pfade, wie die UI sie schickt) funktionieren
  unveraendert
- save_db/get_db: Tabellenname nur [A-Za-z0-9_], atomares UTF-8-Schreiben
- /workspace/images/save: nur Bilder, nur der Dateiname, kein Pfad

Die Routen laufen ueber einen echten aiohttp-Testserver (wie in
test_media_service.py), kein Mock des Request-Objekts.
"""

import asyncio
import importlib.util
import json
import os
import sys

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from service import db_service, file_sync_service, path_utils, twoway_sync_folder_service
from service import scan_my_workflows_folder, media_service
from service.path_utils import UnsafePathError, safe_join, safe_name

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ---------------------------------------------------------------------------
# safe_join
# ---------------------------------------------------------------------------

def test_safe_join_relativ_bleibt_drin(tmp_path):
    assert safe_join(tmp_path, "a/b.json") == os.path.realpath(tmp_path / "a" / "b.json")
    assert safe_join(tmp_path, "a", "b.json") == os.path.realpath(tmp_path / "a" / "b.json")
    assert safe_join(tmp_path, "") == os.path.realpath(tmp_path)


def test_safe_join_absolut_innerhalb_ist_erlaubt(tmp_path):
    innen = str(tmp_path / "sub" / "x.json")
    assert safe_join(tmp_path, innen) == os.path.realpath(innen)


def test_safe_join_absolut_verboten_wenn_abgeschaltet(tmp_path):
    with pytest.raises(UnsafePathError):
        safe_join(tmp_path, str(tmp_path / "x"), allow_absolute=False)


@pytest.mark.parametrize(
    "boese",
    [
        "..",
        "../x.json",
        "a/../../x.json",
        "..\\x.json" if os.name == "nt" else "../x.json",
        "/etc/passwd" if os.name != "nt" else "C:\\Windows\\win.ini",
        "C:foo",
        "c:",
        "x\x00.json",
    ],
)
def test_safe_join_blockt_ausbruch(tmp_path, boese):
    with pytest.raises(UnsafePathError):
        safe_join(tmp_path / "base", boese)


def test_safe_join_blockt_nachbarordner_mit_gleichem_praefix(tmp_path):
    """/base_evil beginnt mit /base - ein naiver startswith-Check faellt
    darauf herein, commonpath nicht."""
    (tmp_path / "base").mkdir()
    (tmp_path / "base_evil").mkdir()
    with pytest.raises(UnsafePathError):
        safe_join(tmp_path / "base", str(tmp_path / "base_evil" / "x.json"))


def test_safe_join_nimmt_nur_strings(tmp_path):
    for wert in (None, 42, ["a"], {"a": 1}):
        with pytest.raises(UnsafePathError):
            safe_join(tmp_path, wert)


@pytest.mark.parametrize("name", ["../x", "a/b", "a\\b", "..", ".", "", "C:x"])
def test_safe_name_verlangt_reinen_namen(name):
    with pytest.raises(UnsafePathError):
        safe_name(name)


def test_safe_name_laesst_normale_namen_durch():
    assert safe_name("Mein Workflow (2).json") == "Mein Workflow (2).json"


# ---------------------------------------------------------------------------
# Testserver-Fahrgestell
# ---------------------------------------------------------------------------

def _call(routes, method, path, **kwargs):
    async def run():
        app = web.Application()
        for m, p, handler in routes:
            app.router.add_route(m, p, handler)
        async with TestClient(TestServer(app)) as client:
            resp = await client.request(method, path, **kwargs)
            text = await resp.text()
            return resp.status, text

    return asyncio.run(run())


@pytest.fixture
def workflows(tmp_path, monkeypatch):
    """my-workflows-Ordner mit einer Datei und einem Unterordner, plus eine
    "fremde" Datei daneben, die unangetastet bleiben muss."""
    wf = tmp_path / "my_workflows"
    (wf / "ordner").mkdir(parents=True)
    (wf / "flow.json").write_text(json.dumps({"extra": {"workspace_info": {"id": "abc"}}}), encoding="utf-8")
    fremd = tmp_path / "fremd.json"
    fremd.write_text('{"nicht": "anfassen"}', encoding="utf-8")
    for mod in (file_sync_service, twoway_sync_folder_service, scan_my_workflows_folder):
        monkeypatch.setattr(mod, "get_my_workflows_dir", lambda: str(wf))
    return {"wf": wf, "fremd": fremd}


# ---------------------------------------------------------------------------
# Workflow-Dateien (file_sync_service)
# ---------------------------------------------------------------------------

def test_file_save_ausserhalb_ist_400(workflows):
    status, _ = _call(
        [("POST", "/s", file_sync_service.save_file)], "POST", "/s",
        json={"path": "../fremd.json", "json": "{}"},
    )
    assert status == 400
    assert json.loads(workflows["fremd"].read_text(encoding="utf-8")) == {"nicht": "anfassen"}


def test_file_save_innerhalb_funktioniert(workflows):
    neu = json.dumps({"extra": {"workspace_info": {"id": "abc"}}, "v": 2})
    status, text = _call(
        [("POST", "/s", file_sync_service.save_file)], "POST", "/s",
        json={"path": "flow.json", "json": neu},
    )
    assert status == 200 and json.loads(text) == {"success": True}
    assert json.loads((workflows["wf"] / "flow.json").read_text(encoding="utf-8"))["v"] == 2


def test_file_rename_mit_pfad_im_neuen_namen_ist_400(workflows):
    status, _ = _call(
        [("POST", "/r", file_sync_service.rename_file)], "POST", "/r",
        json={"path": "flow.json", "newName": "../../entkommen.json"},
    )
    assert status == 400
    assert (workflows["wf"] / "flow.json").exists()


def test_file_rename_legitim(workflows):
    status, text = _call(
        [("POST", "/r", file_sync_service.rename_file)], "POST", "/r",
        json={"path": "flow.json", "newName": "neu.json"},
    )
    assert status == 200 and json.loads(text)["success"] is True
    assert (workflows["wf"] / "neu.json").exists()


def test_file_move_ausserhalb_ist_400(workflows, tmp_path):
    status, _ = _call(
        [("POST", "/m", file_sync_service.move_file)], "POST", "/m",
        json={"path": "flow.json", "newParentPath": str(tmp_path)},
    )
    assert status == 400
    assert (workflows["wf"] / "flow.json").exists()


def test_create_workflow_mit_pfad_im_namen_bleibt_drin(workflows, tmp_path):
    status, _ = _call(
        [("POST", "/c", file_sync_service.create_workflow_file)], "POST", "/c",
        json={"parentFolderPath": "", "name": "../../boese", "json": "{}"},
    )
    assert status == 400
    assert not (tmp_path / "boese.json").exists()


def test_get_workflow_file_ausserhalb_ist_400(workflows):
    status, _ = _call(
        [("POST", "/g", file_sync_service.get_workflow_file)], "POST", "/g",
        json={"path": "../fremd.json", "id": "x"},
    )
    assert status == 400


def test_alter_scan_liest_und_schreibt_keine_fremden_ordner(workflows, tmp_path):
    """/workspace/scan_my_workflows_files hat frueher JSON in beliebigen
    Ordnern gelesen UND (fehlende id) zurueckgeschrieben."""
    status, _ = _call(
        [("POST", "/scan", file_sync_service.scan_local_new_files)], "POST", "/scan",
        json={"path": str(tmp_path)},
    )
    assert status == 400
    assert json.loads(workflows["fremd"].read_text(encoding="utf-8")) == {"nicht": "anfassen"}


def test_neuer_scan_innerhalb_liefert_dateien(workflows):
    status, text = _call(
        [("POST", "/scan", scan_my_workflows_folder.scan_my_workflows_files)], "POST", "/scan",
        json={"path": "", "recursive": True, "metaInfoOnly": True},
    )
    assert status == 200
    namen = {f["name"] for f in json.loads(text)}
    assert {"flow.json", "ordner"} <= namen


def test_neuer_scan_ausserhalb_ist_400(workflows):
    status, _ = _call(
        [("POST", "/scan", scan_my_workflows_folder.scan_my_workflows_files)], "POST", "/scan",
        json={"path": "..", "recursive": True},
    )
    assert status == 400


def test_copy_json_files_nur_aus_dem_aktuellen_ordner(workflows, tmp_path):
    ziel = tmp_path / "ziel"
    ziel.mkdir()
    geheim = tmp_path / "geheim"
    geheim.mkdir()
    (geheim / "x.json").write_text("{}", encoding="utf-8")
    route = [("POST", "/cp", file_sync_service.copy_json_files)]

    status, _ = _call(route, "POST", "/cp", json={"src": str(geheim), "dst": str(ziel)})
    assert status == 400
    assert not (ziel / "x.json").exists()

    status, text = _call(route, "POST", "/cp", json={"src": str(workflows["wf"]), "dst": str(ziel)})
    assert status == 200 and json.loads(text)["success"] is True
    assert (ziel / "flow.json").exists()


def test_copy_json_files_nicht_in_sich_selbst(workflows):
    status, _ = _call(
        [("POST", "/cp", file_sync_service.copy_json_files)], "POST", "/cp",
        json={"src": str(workflows["wf"]), "dst": str(workflows["wf"] / "ordner")},
    )
    assert status == 400


# ---------------------------------------------------------------------------
# Ordner (twoway_sync_folder_service)
# ---------------------------------------------------------------------------

def test_folder_delete_wurzel_und_ausserhalb_sind_400(workflows):
    route = [("POST", "/d", twoway_sync_folder_service.delete_folder)]
    for pfad in ["", "..", "../", str(workflows["wf"])]:
        status, _ = _call(route, "POST", "/d", json={"path": pfad})
        assert status == 400, pfad
    assert workflows["wf"].exists()


def test_folder_rename_mit_pfad_im_namen_ist_400(workflows, tmp_path):
    status, _ = _call(
        [("POST", "/r", twoway_sync_folder_service.rename_folder)], "POST", "/r",
        json={"absPath": "ordner", "newName": "../../weg"},
    )
    assert status == 400
    assert (workflows["wf"] / "ordner").exists()


def test_folder_create_und_rename_legitim(workflows):
    status, _ = _call(
        [("POST", "/c", twoway_sync_folder_service.create_folder)], "POST", "/c",
        json={"path": "neu/tief"},
    )
    assert status == 200 and (workflows["wf"] / "neu" / "tief").is_dir()
    status, _ = _call(
        [("POST", "/r", twoway_sync_folder_service.rename_folder)], "POST", "/r",
        json={"absPath": "neu", "newName": "umbenannt"},
    )
    assert status == 200 and (workflows["wf"] / "umbenannt" / "tief").is_dir()


def test_folder_create_ausserhalb_ist_400(workflows, tmp_path):
    status, _ = _call(
        [("POST", "/c", twoway_sync_folder_service.create_folder)], "POST", "/c",
        json={"path": "../draussen"},
    )
    assert status == 400
    assert not (tmp_path / "draussen").exists()


# ---------------------------------------------------------------------------
# Routen im Root-__init__.py
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def root_modul():
    """Das Custom-Node-__init__.py als Paket laden (wie ComfyUI es tut)."""
    import server

    # Das Root-Modul holt sich (ueber model_installer) beim Import den Loop.
    try:
        asyncio.get_event_loop()
    except RuntimeError:
        asyncio.set_event_loop(asyncio.new_event_loop())
    if not hasattr(server.PromptServer.instance, "app"):
        server.PromptServer.instance.app = type("App", (), {"add_routes": lambda self, r: None})()
    name = "wm_root_under_test"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(
        name, os.path.join(REPO_ROOT, "__init__.py"), submodule_search_locations=[REPO_ROOT]
    )
    modul = importlib.util.module_from_spec(spec)
    sys.modules[name] = modul
    spec.loader.exec_module(modul)
    return modul


@pytest.fixture
def root_wf(root_modul, workflows, monkeypatch):
    monkeypatch.setattr(root_modul, "get_my_workflows_dir", lambda: str(workflows["wf"]))
    monkeypatch.delenv("WORKSPACE_MANAGER_BROWSE_ROOTS", raising=False)
    return root_modul


def test_delete_file_relativ_legitim_und_ausserhalb_400(root_wf, workflows):
    route = [("POST", "/del", root_wf.delete_file)]
    status, _ = _call(route, "POST", "/del", json={"file_path": "../fremd.json"})
    assert status == 400
    assert workflows["fremd"].exists()

    # Ohne send2trash-Nebenwirkung auf den echten Papierkorb.
    root_wf.send2trash = None
    status, _ = _call(route, "POST", "/del", json={"file_path": "flow.json"})
    assert status == 200
    assert not (workflows["wf"] / "flow.json").exists()


def test_delete_file_loescht_keine_ordner(root_wf, workflows):
    root_wf.send2trash = None
    status, _ = _call([("POST", "/del", root_wf.delete_file)], "POST", "/del", json={"file_path": ""})
    assert status == 404
    assert workflows["wf"].exists()


def test_update_file_nur_json_und_nur_drin(root_wf, workflows, tmp_path):
    route = [("POST", "/u", root_wf.update_file)]
    status, _ = _call(route, "POST", "/u", json={"file_path": "../boese.json", "json_str": "{}"})
    assert status == 400 and not (tmp_path / "boese.json").exists()
    status, _ = _call(route, "POST", "/u", json={"file_path": "x.py", "json_str": "{}"})
    assert status == 400 and not (workflows["wf"] / "x.py").exists()
    status, _ = _call(route, "POST", "/u", json={"file_path": "sub/neu.json", "json_str": '{"ü": 1}'})
    assert status == 200
    assert (workflows["wf"] / "sub" / "neu.json").read_text(encoding="utf-8") == '{"ü": 1}'


def test_rename_file_route_eingesperrt(root_wf, workflows, tmp_path):
    route = [("POST", "/rn", root_wf.rename_file)]
    status, _ = _call(route, "POST", "/rn", json={"file_path": str(workflows["fremd"]), "new_file_path": "x.json"})
    assert status == 400
    status, _ = _call(route, "POST", "/rn", json={"file_path": "flow.json", "new_file_path": str(tmp_path / "raus.json")})
    assert status == 400
    assert (workflows["wf"] / "flow.json").exists()
    status, _ = _call(route, "POST", "/rn", json={"file_path": "flow.json", "new_file_path": "rein.json"})
    assert status == 200 and (workflows["wf"] / "rein.json").exists()


def test_delete_folder_route_eingesperrt(root_wf, workflows, tmp_path):
    route = [("POST", "/df", root_wf.delete_folder)]
    for pfad in [str(tmp_path), "..", "", str(workflows["wf"])]:
        status, _ = _call(route, "POST", "/df", json={"folder_path": pfad})
        assert status == 400, pfad
    assert workflows["wf"].exists()
    status, _ = _call(route, "POST", "/df", json={"folder_path": "ordner"})
    assert status == 200 and not (workflows["wf"] / "ordner").exists()


def test_get_system_dir_mit_browse_roots(root_wf, tmp_path, monkeypatch):
    route = [("POST", "/sd", root_wf.get_system_dir)]
    # Ohne Env: Ordnerauswahl darf ueberall hin (sie waehlt ja einen neuen Ordner).
    status, text = _call(route, "POST", "/sd", json={"absolute_dir": str(tmp_path)})
    assert status == 200 and "my_workflows" in json.loads(text)["dir_contents"]

    monkeypatch.setenv("WORKSPACE_MANAGER_BROWSE_ROOTS", str(tmp_path / "my_workflows"))
    status, text = _call(route, "POST", "/sd", json={"absolute_dir": str(tmp_path)})
    assert status == 400
    # Der Dialog erkennt genau diesen Text und zeigt den Hinweis statt Absturz.
    assert "Operation not permitted" in json.loads(text)["error"]
    status, text = _call(route, "POST", "/sd", json={"absolute_dir": ""})
    assert status == 200 and json.loads(text)["dir_path"] == os.path.realpath(tmp_path / "my_workflows")


def test_get_system_dir_kein_ordner(root_wf, tmp_path):
    status, text = _call(
        [("POST", "/sd", root_wf.get_system_dir)], "POST", "/sd",
        json={"absolute_dir": str(tmp_path / "gibtsnicht")},
    )
    assert "Not a directory" in json.loads(text)["error"]


def test_open_file_browser_ohne_programm_ist_kein_500(root_wf, monkeypatch):
    def fehlt(*a, **kw):
        raise FileNotFoundError("xdg-open")

    monkeypatch.setattr(root_wf.subprocess, "Popen", fehlt)
    status, text = _call(
        [("POST", "/ob", root_wf.open_workflow_file_browser)], "POST", "/ob"
    )
    assert status == 501
    assert "error" in json.loads(text)


# ---------------------------------------------------------------------------
# db_service
# ---------------------------------------------------------------------------

@pytest.fixture
def db_dir(tmp_path, monkeypatch):
    d = tmp_path / "db"
    monkeypatch.setattr(db_service, "db_dir_path", str(d))
    return d


@pytest.mark.parametrize("table", ["../../evil", "a/b", "a.b", "", "x y", "..\\x"])
def test_save_db_ungueltiger_tabellenname_ist_400(db_dir, tmp_path, table):
    status, _ = _call(
        [("POST", "/save", db_service.save_db)], "POST", "/save",
        json={"table": table, "json": "{}"},
    )
    assert status == 400
    assert not (tmp_path / "evil.json").exists()


def test_get_db_ungueltiger_tabellenname_ist_400(db_dir):
    status, _ = _call([("GET", "/get", db_service.get_workspace)], "GET", "/get?table=../settings")
    assert status == 400


def test_save_db_schreibt_utf8_und_liest_zurueck(db_dir):
    inhalt = json.dumps([{"name": "Größe & Übergang – 猫"}])
    status, _ = _call(
        [("POST", "/save", db_service.save_db)], "POST", "/save",
        json={"table": "prompts", "json": inhalt},
    )
    assert status == 200
    roh = (db_dir / "prompts.json").read_bytes().decode("utf-8")
    assert json.loads(roh) == inhalt
    status, text = _call([("GET", "/get", db_service.get_workspace)], "GET", "/get?table=prompts")
    assert json.loads(text) == inhalt
    # Keine Temp-Reste.
    assert [p.name for p in db_dir.iterdir()] == ["prompts.json"]


def test_atomic_write_laesst_alte_datei_bei_fehler_stehen(tmp_path, monkeypatch):
    ziel = tmp_path / "t.json"
    ziel.write_text("alt", encoding="utf-8")

    def kaputt(*a, **kw):
        raise OSError("Platte voll")

    monkeypatch.setattr(path_utils.os, "replace", kaputt)
    with pytest.raises(OSError):
        path_utils.atomic_write_text(str(ziel), "neu")
    assert ziel.read_text(encoding="utf-8") == "alt"
    assert [p.name for p in tmp_path.iterdir()] == ["t.json"]


# ---------------------------------------------------------------------------
# /workspace/images/save
# ---------------------------------------------------------------------------

@pytest.fixture
def output_dir(tmp_path, monkeypatch):
    out = tmp_path / "output"
    out.mkdir()
    monkeypatch.setattr(file_sync_service.folder_paths, "get_output_directory", lambda: str(out))
    return out


def _upload(files):
    """Multipart-Body von Hand: aiohttps FormData wuerde "../" im Dateinamen
    prozent-kodieren - ein Angreifer schickt ihn aber roh."""
    boundary = "grenze1234"
    crlf = bytes([13, 10])
    body = b""
    for i, (name, data) in enumerate(files):
        kopf = f'Content-Disposition: form-data; name="images[{i}]"; filename="{name}"'
        body += b"--" + boundary.encode() + crlf + kopf.encode() + crlf
        body += b"Content-Type: application/octet-stream" + crlf + crlf + data + crlf
    body += b"--" + boundary.encode() + crlf
    body += b'Content-Disposition: form-data; name="subfolder"' + crlf + crlf
    body += b"workspace_manager" + crlf + b"--" + boundary.encode() + b"--" + crlf
    return _call(
        [("POST", "/img", file_sync_service.save_images)], "POST", "/img",
        data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )


def test_bild_upload_legitim(output_dir):
    status, text = _upload([("cover.png", b"\x89PNG-daten")])
    assert status == 200
    ziel = output_dir / "workspace_manager" / "cover.png"
    assert ziel.read_bytes() == b"\x89PNG-daten"
    assert json.loads(text)["imgPaths"] == [os.path.realpath(ziel)]


def test_bild_upload_pfad_wird_zum_dateinamen(output_dir, tmp_path):
    status, _ = _upload([("../../ausbruch.png", b"x")])
    assert status == 200
    assert not (tmp_path / "ausbruch.png").exists()
    assert (output_dir / "workspace_manager" / "ausbruch.png").exists()


def test_bild_upload_nur_bildendungen(output_dir):
    status, text = _upload([("__init__.py", b"import os")])
    assert status == 400
    assert not (output_dir / "workspace_manager" / "__init__.py").exists()
    assert json.loads(text)["errors"]


# ---------------------------------------------------------------------------
# media_service: Flags
# ---------------------------------------------------------------------------

def test_isinput_false_liest_aus_output(tmp_path, monkeypatch):
    out = tmp_path / "o"
    inp = tmp_path / "i"
    out.mkdir()
    inp.mkdir()
    (out / "a.mp4").write_bytes(b"output")
    monkeypatch.setattr(media_service.folder_paths, "get_output_directory", lambda: str(out))
    monkeypatch.setattr(media_service.folder_paths, "get_input_directory", lambda: str(inp))
    status, text = _call(
        [("GET", "/v", media_service.view_file)], "GET", "/v?filename=a.mp4&isInput=false"
    )
    assert status == 200 and text == "output"


def test_workflows_dir_wurzel_und_systemordner_verboten(tmp_path):
    import os
    from service.path_utils import is_forbidden_workflows_dir

    assert is_forbidden_workflows_dir(os.path.abspath(os.sep))
    assert not is_forbidden_workflows_dir(str(tmp_path))
    if os.path.exists("/etc"):
        assert is_forbidden_workflows_dir("/etc")
