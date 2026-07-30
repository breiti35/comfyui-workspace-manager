"""Funktionstests fuer die Medien-Route (Range-Requests, Pfad-Sicherheit).

view_media() liefert Dateien seit der Umstellung per aiohttp FileResponse aus
statt sie komplett in den Speicher zu lesen. FileResponse schreibt seinen
Body aber erst waehrend des echten HTTP-Response-Zyklus (prepare() braucht
einen Request mit Transport) - ein direkter Koroutinen-Aufruf wie bei
civarchive (siehe test_civarchive.py) reicht hier also nicht aus. Stattdessen
laeuft ein echter lokaler aiohttp-Testserver (aiohttp.test_utils), kein Mock
des Response-Objekts - gleiche Philosophie wie beim Download-Test gegen einen
echten HTTP-Server.
"""

import asyncio
import os

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from service import media_service


# ---------------------------------------------------------------------------
# Testserver-Fahrgestell
# ---------------------------------------------------------------------------

def _app() -> web.Application:
    app = web.Application()
    app.router.add_get("/workspace/view_media", media_service.view_file)
    app.router.add_get("/workspace/preview_media", media_service.preview_file)
    return app


async def _request(path: str, params: dict, headers: dict):
    async with TestClient(TestServer(_app())) as client:
        resp = await client.get(path, params=params, headers=headers or {})
        body = await resp.read()
        return resp, body


def view_media_route(**params):
    headers = {}
    if "range" in params:
        headers["Range"] = params.pop("range")
    return asyncio.run(_request("/workspace/view_media", params, headers))


def preview_media_route(**params):
    return asyncio.run(_request("/workspace/preview_media", params, {}))


@pytest.fixture
def medien_dirs(tmp_path, monkeypatch):
    """Biegt den folder_paths-Stub auf ein echtes Testverzeichnis um."""
    output_dir = tmp_path / "output"
    input_dir = tmp_path / "input"
    output_dir.mkdir()
    input_dir.mkdir()
    monkeypatch.setattr(media_service.folder_paths, "get_output_directory", lambda: str(output_dir))
    monkeypatch.setattr(media_service.folder_paths, "get_input_directory", lambda: str(input_dir))
    return {"output": output_dir, "input": input_dir}


# ---------------------------------------------------------------------------
# Voller Request / Range-Requests
# ---------------------------------------------------------------------------

def test_voller_request_liefert_gesamten_inhalt(medien_dirs):
    payload = os.urandom(1000)
    (medien_dirs["output"] / "clip.mp4").write_bytes(payload)

    resp, body = view_media_route(filename="clip.mp4")

    assert resp.status == 200
    assert body == payload
    assert resp.headers["Accept-Ranges"] == "bytes"
    assert resp.headers["Content-Length"] == "1000"


def test_range_request_liefert_206_mit_passendem_content_range(medien_dirs):
    payload = os.urandom(1000)
    (medien_dirs["output"] / "clip.mp4").write_bytes(payload)

    resp, body = view_media_route(filename="clip.mp4", range="bytes=100-199")

    assert resp.status == 206
    assert resp.headers["Content-Range"] == "bytes 100-199/1000"
    assert body == payload[100:200]


def test_offener_range_liefert_bis_zum_dateiende(medien_dirs):
    payload = os.urandom(1000)
    (medien_dirs["output"] / "clip.mp4").write_bytes(payload)

    resp, body = view_media_route(filename="clip.mp4", range="bytes=500-")

    assert resp.status == 206
    assert resp.headers["Content-Range"] == "bytes 500-999/1000"
    assert body == payload[500:]


def test_unerfuellbarer_range_liefert_416(medien_dirs):
    payload = os.urandom(1000)
    (medien_dirs["output"] / "clip.mp4").write_bytes(payload)

    resp, _body = view_media_route(filename="clip.mp4", range="bytes=5000-6000")

    assert resp.status == 416
    assert resp.headers["Content-Range"] == "bytes */1000"


def test_video_endung_setzt_video_content_type(medien_dirs):
    (medien_dirs["output"] / "clip.webm").write_bytes(b"x" * 10)

    resp, _body = view_media_route(filename="clip.webm")

    assert resp.headers["Content-Type"] == "video/webm"


def test_content_disposition_enthaelt_dateinamen(medien_dirs):
    (medien_dirs["output"] / "clip.mp4").write_bytes(b"x" * 10)

    resp, _body = view_media_route(filename="clip.mp4")

    assert resp.headers["Content-Disposition"] == 'filename="clip.mp4"'


# ---------------------------------------------------------------------------
# isInput-Unterscheidung
# ---------------------------------------------------------------------------

def test_isinput_liest_aus_dem_input_verzeichnis(medien_dirs):
    (medien_dirs["input"] / "quelle.png").write_bytes(b"\x89PNG" + b"x" * 20)

    resp, body = view_media_route(filename="quelle.png", isInput="true")

    assert resp.status == 200
    assert body == b"\x89PNG" + b"x" * 20


def test_ohne_isinput_wird_im_output_gesucht(medien_dirs):
    """Nur im Input abgelegt -> im Output nicht auffindbar (404)."""
    (medien_dirs["input"] / "nur_input.png").write_bytes(b"x")

    resp, _body = view_media_route(filename="nur_input.png")

    assert resp.status == 404


# ---------------------------------------------------------------------------
# isPreview-Zweig fuer Bilder bleibt JSON, nicht die Datei
# ---------------------------------------------------------------------------

def test_ispreview_bei_bild_liefert_json_thumbnail(medien_dirs, monkeypatch):
    (medien_dirs["output"] / "bild.png").write_bytes(b"x" * 20)
    monkeypatch.setattr(
        media_service, "get_thumbnail_for_image_file", lambda path: b"thumbnail-bytes"
    )

    resp, body = preview_media_route(filename="bild.png")

    assert resp.status == 200
    assert resp.headers["Content-Type"] == "image/jpeg"
    assert resp.headers["Content-Disposition"] == 'filename="bild.png.jpg"'
    # json_response() wird hier mit body= (rohe Bytes) statt data= aufgerufen -
    # es gibt also keine JSON-Kodierung, das Thumbnail kommt 1:1 durch.
    assert body == b"thumbnail-bytes"


def test_ispreview_bei_video_liefert_keine_json_sondern_die_datei(medien_dirs):
    """Der isPreview-JSON-Zweig gilt nur fuer Bildformate, Video muss weiter
    als FileResponse (Range-faehig) rausgehen."""
    payload = os.urandom(500)
    (medien_dirs["output"] / "clip.mp4").write_bytes(payload)

    resp, body = preview_media_route(filename="clip.mp4")

    assert resp.status == 200
    assert resp.headers["Content-Type"] == "video/mp4"
    assert body == payload


# ---------------------------------------------------------------------------
# Sicherheit: Pfad-Ausbruch, fehlende/leere Dateinamen
# ---------------------------------------------------------------------------

def test_leerer_dateiname_ist_404(medien_dirs):
    resp, _body = view_media_route(filename="")

    assert resp.status == 404


def test_fehlende_datei_ist_404(medien_dirs):
    resp, _body = view_media_route(filename="gibt_es_nicht.mp4")

    assert resp.status == 404


@pytest.mark.parametrize(
    "boesartiger_name",
    [
        "../secret.txt",
        "..\\secret.txt",
        "sub/../../secret.txt",
        "/etc/passwd",
        "\\Windows\\file.txt",
        "C:/Windows/file.txt",
        "C:\\Windows\\file.txt",
    ],
)
def test_pfad_ausbruch_ist_400(medien_dirs, boesartiger_name):
    resp, _body = view_media_route(filename=boesartiger_name)

    assert resp.status == 400, f"{boesartiger_name!r} haette abgelehnt werden muessen"
