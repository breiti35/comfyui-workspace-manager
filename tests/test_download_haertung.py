"""Tests fuer die Haertung des Modell-Downloads.

Abgedeckt: Validierung von install_model (nur http/https, nur bekannte
Modellordner, keine Pfade im Dateinamen), Zielordner-Wahl ueber
WORKSPACE_MANAGER_MODEL_ROOT, "Datei existiert bereits", Speicherplatz-Check,
Retry mit Fortsetzen nach abgerissener Verbindung, Abbruch pro Download,
Token-Maskierung und der HF_TOKEN-Header, der nie an ein CDN gehen darf.

Wie in test_model_installer.py laeuft alles gegen den echten lokalen
HTTP-Server aus conftest.py.
"""

import asyncio
import hashlib
import os
import urllib.request
from collections import namedtuple

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer


def sha256_file(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


@pytest.fixture
def modellordner(installer, tmp_path, monkeypatch):
    """Registriert zwei Modellordner im folder_paths-Stub: einen auf der
    "Container-Platte" (zuerst, wie ComfyUIs eigenes models/) und einen auf
    dem "Volume"."""
    container = tmp_path / "container" / "models" / "loras"
    volume = tmp_path / "volume" / "models" / "loras"
    container.mkdir(parents=True)
    volume.mkdir(parents=True)
    monkeypatch.setattr(
        installer.folder_paths,
        "folder_names_and_paths",
        {"loras": ([str(container), str(volume)], {".safetensors"})},
    )
    monkeypatch.delenv("WORKSPACE_MANAGER_MODEL_ROOT", raising=False)
    return {"container": container, "volume": volume, "root": tmp_path}


# ---------------------------------------------------------------------------
# install_model: Validierung
# ---------------------------------------------------------------------------

def test_nur_http_und_https_urls(installer, modellordner):
    for url in ["file:///etc/passwd", "ftp://example.com/x.safetensors", "javascript:alert(1)", ""]:
        with pytest.raises(installer.InstallRequestError):
            installer.validate_install_request(
                {"url": url, "save_path": "loras", "filename": "x.safetensors"}
            )
    installer.validate_install_request(
        {"url": "https://civitai.com/api/download/models/1", "save_path": "loras", "filename": "1"}
    )


def test_save_path_muss_bekannter_modellordner_sein(installer, modellordner):
    ok = {"url": "https://example.com/a", "filename": "a.safetensors"}
    # Schluessel und registrierte Pfade (das sendet der Ordner-Dialog) gehen.
    installer.validate_install_request({**ok, "save_path": "loras"})
    installer.validate_install_request({**ok, "save_path": str(modellordner["volume"])})

    for boese in ["../../custom_nodes", str(modellordner["root"]), "/tmp", "C:\\Windows", "unbekannt"]:
        with pytest.raises(installer.InstallRequestError):
            installer.validate_install_request({**ok, "save_path": boese})


@pytest.mark.parametrize(
    "name",
    ["../evil.safetensors", "..\\evil.safetensors", "sub/x.safetensors", "C:evil.safetensors", ".."],
)
def test_dateiname_mit_pfadanteil_wird_abgelehnt(installer, modellordner, name):
    with pytest.raises(installer.InstallRequestError):
        installer.validate_install_request(
            {"url": "https://example.com/a", "save_path": "loras", "filename": name, "force_filename": True}
        )


def test_erzwungener_dateiname_braucht_modell_endung(installer, modellordner):
    with pytest.raises(installer.InstallRequestError):
        installer.validate_install_request(
            {"url": "https://example.com/a", "save_path": "loras", "filename": "x.py", "force_filename": True}
        )
    # Ohne force ist der Name nur ein Fallback (z. B. "12345?type=Model") und
    # wird erst nach dem Content-Disposition-Header endgueltig geprueft.
    installer.validate_install_request(
        {"url": "https://example.com/a", "save_path": "loras", "filename": "12345?type=Model"}
    )


def test_install_route_lehnt_ab_und_meldet_download_error(installer, modellordner, monkeypatch):
    async def run():
        app = web.Application()
        app.router.add_post("/model_manager/install_model", installer.install_model)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post(
                "/model_manager/install_model",
                json={"url": "file:///etc/passwd", "save_path": "loras", "filename": "x.safetensors"},
            )
            return resp.status, await resp.text()

    status, _text = asyncio.run(run())
    assert status == 400
    assert installer.download_tasks == []
    fehler = [d for e, d in installer._test_sent if e == "download_error"]
    assert fehler, "Die UI braucht ein download_error, sonst haengt ihr Pending-Marker"


def test_content_disposition_mit_pfad_wird_auf_basename_reduziert(installer):
    assert installer._filename_from_disposition('attachment; filename="a.safetensors"') == "a.safetensors"
    assert (
        installer._filename_from_disposition("inline; filename*=UTF-8''m%C3%BCde.safetensors; filename=\"m.safetensors\"")
        == "müde.safetensors"
    )


# ---------------------------------------------------------------------------
# Zielordner
# ---------------------------------------------------------------------------

def test_zielordner_ohne_model_root_ist_erster_pfad(installer, modellordner):
    assert installer.resolve_folder_dir("loras") == str(modellordner["container"])


def test_model_root_bevorzugt_pfad_auf_dem_volume(installer, modellordner, monkeypatch):
    monkeypatch.setenv("WORKSPACE_MANAGER_MODEL_ROOT", str(modellordner["root"] / "volume"))
    assert installer.resolve_folder_dir("loras") == str(modellordner["volume"])
    assert installer.get_model_dir("loras") == str(modellordner["volume"])


def test_model_root_ohne_passenden_pfad_faellt_zurueck(installer, modellordner, monkeypatch):
    monkeypatch.setenv("WORKSPACE_MANAGER_MODEL_ROOT", str(modellordner["root"] / "gibtsnicht"))
    assert installer.resolve_folder_dir("loras") == str(modellordner["container"])


# ---------------------------------------------------------------------------
# Vor dem Download: vorhandene Datei, Speicherplatz
# ---------------------------------------------------------------------------

def test_vorhandene_datei_wird_nicht_ueberschrieben(installer, http_server, tmp_path):
    srv = http_server(size_bytes=64 * 1024)
    ziel = tmp_path / "da.safetensors"
    ziel.write_bytes(b"original")

    ok = installer.download_url_with_agent(srv.url("/file"), str(tmp_path), "da.safetensors", None)

    assert ok is False
    assert ziel.read_bytes() == b"original"
    fehler = [d for e, d in installer._test_sent if e == "download_error"]
    assert fehler and "Datei existiert bereits: da.safetensors" in fehler[0]
    # Nur das Aufloesen, kein eigentlicher Download.
    assert len(srv.requests) == 1


def test_zu_wenig_speicherplatz_bricht_vorher_ab(installer, http_server, tmp_path, monkeypatch):
    srv = http_server(size_bytes=64 * 1024)
    Usage = namedtuple("Usage", "total used free")
    monkeypatch.setattr(installer.shutil, "disk_usage", lambda p: Usage(10**12, 10**12, 1024))

    ok = installer.download_url_with_agent(srv.url("/file"), str(tmp_path), "gross.safetensors", None)

    assert ok is False
    assert not (tmp_path / "gross.safetensors.temp").exists()
    fehler = [d for e, d in installer._test_sent if e == "download_error"]
    assert fehler and "Speicherplatz" in fehler[0]


def test_unerlaubte_endung_aus_content_disposition(installer, http_server, tmp_path, monkeypatch):
    srv = http_server(size_bytes=1024)
    monkeypatch.setattr(
        installer, "_resolve_download",
        lambda url, auth_host=None: (url, 1024, 'attachment; filename="../../boese.py"'),
    )

    ok = installer.download_url_with_agent(srv.url("/file"), str(tmp_path), "x", None)

    assert ok is False
    assert not list(tmp_path.iterdir())
    assert not (tmp_path.parent / "boese.py").exists()


# ---------------------------------------------------------------------------
# Retry mit Fortsetzen
# ---------------------------------------------------------------------------

def test_parallel_segment_wird_nach_verbindungsabbruch_fortgesetzt(installer, http_server, tmp_path):
    srv = http_server(size_bytes=20 * 1024 * 1024)
    srv.set_flaky_budget(2)  # zwei Segmente reissen beim ersten Versuch ab

    ok = installer.download_url_with_agent(srv.url("/flaky"), str(tmp_path), "flaky.safetensors", None)

    assert ok is True
    assert sha256_file(tmp_path / "flaky.safetensors") == srv.sha256
    # Fortgesetzt wird mitten im Segment, nicht wieder an dessen Anfang.
    segment_starts = {
        int(r.split("=")[1].split("-")[0]) for p, r in srv.requests if r and r != "bytes=0-1"
    }
    assert len(segment_starts) > installer.DOWNLOAD_CONNECTIONS


def test_einzelstream_wird_per_range_fortgesetzt(installer, http_server, tmp_path):
    srv = http_server(size_bytes=512 * 1024)
    srv.set_flaky_budget(1)

    ok = installer.download_url_with_agent(srv.url("/flaky"), str(tmp_path), "einzeln.safetensors", None)

    assert ok is True
    assert sha256_file(tmp_path / "einzeln.safetensors") == srv.sha256
    assert any(r and r != "bytes=0-" for _p, r in srv.requests), "Kein Fortsetzen per Range"


def test_einzelstream_ohne_range_support_scheitert_sauber(installer, http_server, tmp_path, monkeypatch):
    """Server kann nicht fortsetzen: lieber ein klarer Fehler als eine Datei,
    an die der komplette Inhalt ein zweites Mal angehaengt wurde."""
    srv = http_server(size_bytes=256 * 1024)
    calls = {"n": 0}
    echtes_open = installer._open

    def open_mit_abbruch(url, headers=None, auth_host=None):
        resp = echtes_open(url.replace("/file", "/norange"), headers, auth_host)
        calls["n"] += 1
        if calls["n"] == 2:  # der eigentliche Download (1 = Aufloesen)
            orig_read = resp.read
            state = {"sent": 0}

            def read(n=-1):
                if state["sent"] >= 64 * 1024:
                    raise ConnectionResetError("abgerissen")
                data = orig_read(min(n, 64 * 1024) if n and n > 0 else 64 * 1024)
                state["sent"] += len(data)
                return data

            resp.read = read
        return resp

    monkeypatch.setattr(installer, "_open", open_mit_abbruch)

    ok = installer.download_url_with_agent(srv.url("/file"), str(tmp_path), "nr.safetensors", None)

    assert ok is False
    assert not (tmp_path / "nr.safetensors").exists()
    assert not (tmp_path / "nr.safetensors.temp").exists()
    fehler = [d for e, d in installer._test_sent if e == "download_error"]
    assert fehler and "Fortsetzen" in fehler[0]


# ---------------------------------------------------------------------------
# Abbruch
# ---------------------------------------------------------------------------

def test_abbruch_fuer_unbekannten_pfad_wird_ignoriert(installer, http_server, tmp_path):
    """Frueher blieb so ein Abbruch als globaler cancel_path haengen und traf
    den naechsten Download derselben Datei."""
    assert installer.request_cancel(str(tmp_path / "gibtsnicht.safetensors")) is None

    srv = http_server(size_bytes=64 * 1024)
    ok = installer.download_url_with_agent(
        srv.url("/file"), str(tmp_path), "gibtsnicht.safetensors", None
    )
    assert ok is True


def test_abbruch_nach_dem_letzten_chunk_loescht_nichts(installer, http_server, tmp_path, monkeypatch):
    srv = http_server(size_bytes=256 * 1024)
    echter_status = installer.send_download_status

    def status_und_abbruch(data):
        echter_status(data)
        if data.get("downloaded") == data.get("total"):
            installer.request_cancel(data["save_path"])

    monkeypatch.setattr(installer, "send_download_status", status_und_abbruch)

    ok = installer.download_url_with_agent(srv.url("/file"), str(tmp_path), "fertig.safetensors", None)

    assert ok is True
    assert sha256_file(tmp_path / "fertig.safetensors") == srv.sha256


def test_abbruch_einer_wartenden_aufgabe(installer):
    installer.download_tasks.append({"url": "https://x/a", "save_path": "loras", "filename": "a.safetensors"})
    try:
        assert installer.request_cancel("a.safetensors") == "queued"
        assert installer.download_tasks == []
    finally:
        installer.download_tasks.clear()


def test_kaputte_aufgabe_beendet_den_worker_nicht(installer, monkeypatch):
    erledigt = []
    monkeypatch.setattr(
        installer, "download_url_with_agent",
        lambda **kw: erledigt.append(kw["file_name"]) or True,
    )
    monkeypatch.setattr(installer, "start_populate_file_hash_dict", lambda: None)
    installer.download_tasks.extend([
        {"filename": "kaputt"},  # keine url -> KeyError
        {"url": "https://x/b", "save_path": "loras", "filename": "b.safetensors"},
    ])
    installer.download_worker()  # synchron: muss zurueckkehren

    assert erledigt == ["b.safetensors"]
    assert installer.download_thread is None
    assert any(e == "download_error" for e, _ in installer._test_sent)


# ---------------------------------------------------------------------------
# Geheimnisse
# ---------------------------------------------------------------------------

def test_token_wird_in_download_error_maskiert(installer, http_server, tmp_path):
    """Die UI haengt den Civitai-Key als ?token= an die URL, und die URL steht
    im download_error - der an jeden verbundenen Browser geht."""
    srv = http_server(size_bytes=1024)

    installer.download_url_with_agent(
        srv.url("/authwall") + "?token=GEHEIM123", str(tmp_path), "g.safetensors", None
    )

    fehler = [d for e, d in installer._test_sent if e == "download_error"]
    assert fehler
    assert "GEHEIM123" not in fehler[0]
    assert "token=***" in fehler[0]


def test_mask_deckt_query_token_und_authorization_ab(installer):
    s = installer._mask("https://civitai.com/api/download/models/1?type=Model&token=abc123 Authorization: Bearer hf_xyz")
    assert "abc123" not in s and "hf_xyz" not in s
    assert "type=Model" in s


def test_hf_token_nur_fuer_den_hf_host(installer, monkeypatch):
    monkeypatch.setenv("HF_TOKEN", "hf_geheim")
    hf = "huggingface.co"
    assert installer._auth_headers_for("https://huggingface.co/a/b/resolve/main/x.safetensors", hf) == {
        "Authorization": "Bearer hf_geheim"
    }
    assert installer._auth_headers_for("https://cdn-lfs.hf.co/x", hf) == {}
    assert installer._auth_headers_for("https://cas-bridge.xethub.hf.co/x", hf) == {}
    # Nicht-HF-Host bekommt ihn nie, auch nicht als "Ursprungshost".
    assert installer._auth_headers_for("https://civitai.com/x", "civitai.com") == {}


def test_hf_token_wird_beim_redirect_aufs_cdn_nicht_mitgeschickt(installer, monkeypatch):
    monkeypatch.setenv("HF_TOKEN", "hf_geheim")
    handler = installer._AuthAwareRedirectHandler()
    req = urllib.request.Request("https://huggingface.co/a/b/resolve/main/x.safetensors")
    req._wm_auth_host = "huggingface.co"
    req.add_unredirected_header("Authorization", "Bearer hf_geheim")

    cdn = handler.redirect_request(req, None, 302, "Found", {}, "https://cdn-lfs.hf.co/signed?x=1")
    assert not cdn.has_header("Authorization")
    assert "Authorization" not in cdn.headers and "Authorization" not in cdn.unredirected_hdrs

    selbst = handler.redirect_request(req, None, 307, "Temporary", {}, "https://huggingface.co/a/c/resolve/main/x.safetensors")
    assert selbst.get_header("Authorization") == "Bearer hf_geheim"


def test_401_von_huggingface_erklaert_gated_repo(installer, monkeypatch):
    import urllib.error
    monkeypatch.delenv("HF_TOKEN", raising=False)
    err = urllib.error.HTTPError("https://huggingface.co/x", 401, "Unauthorized", {}, None)
    msg = str(installer._explain_http_error(err, "https://huggingface.co/x"))
    assert "gated" in msg and "HF_TOKEN" in msg
