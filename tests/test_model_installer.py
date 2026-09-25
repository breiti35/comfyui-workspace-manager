"""Funktionstests fuer den beschleunigten Modell-Download.

Getestet wird gegen einen echten lokalen HTTP-Server, nicht gegen Mocks - der
Parallel-Download ist genau der Code, bei dem ein Fehler eine stillschweigend
korrupte Modelldatei erzeugen wuerde. Jeder Integritaetstest vergleicht daher
den SHA256 der geschriebenen Datei mit dem des Originals.
"""

import hashlib
import os
import threading
import time

import pytest


def sha256_file(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


# ---------------------------------------------------------------------------
# Kern: Datenintegritaet
# ---------------------------------------------------------------------------

def test_parallel_download_ist_byte_identisch(installer, http_server, tmp_path):
    """20 MB ueber 6 parallele Segmente muessen exakt die Originaldatei ergeben."""
    srv = http_server(size_bytes=20 * 1024 * 1024)  # > PARALLEL_MIN_BYTES (16 MB)

    ok = installer.download_url_with_agent(
        srv.url("/file"), str(tmp_path), "model.safetensors", None
    )

    assert ok is True
    target = tmp_path / "model.safetensors"
    assert target.exists(), "Zieldatei wurde nicht angelegt"
    assert target.stat().st_size == len(srv.payload)
    assert sha256_file(target) == srv.sha256, "Datei ist beim Zusammensetzen korrupt"

    # Wirklich der parallele Pfad? Dann gab es mehrere Range-Requests.
    range_requests = [r for p, r in srv.requests if r and p == "/file"]
    assert len(range_requests) >= installer.DOWNLOAD_CONNECTIONS, (
        f"Erwartet >= {installer.DOWNLOAD_CONNECTIONS} Range-Requests, "
        f"bekommen: {range_requests}"
    )
    # Keine Temp-Datei bleibt zurueck.
    assert not (tmp_path / "model.safetensors.temp").exists()


def test_parallel_download_bei_krummer_dateigroesse(installer, http_server, tmp_path):
    """Groesse nicht durch DOWNLOAD_CONNECTIONS teilbar - das letzte Segment
    muss den Rest mitnehmen, sonst fehlen am Ende Bytes."""
    srv = http_server(size_bytes=17 * 1024 * 1024 + 7)

    ok = installer.download_url_with_agent(
        srv.url("/file"), str(tmp_path), "krumm.safetensors", None
    )

    assert ok is True
    target = tmp_path / "krumm.safetensors"
    assert target.stat().st_size == len(srv.payload)
    assert sha256_file(target) == srv.sha256


def test_kleine_datei_nutzt_einzelstream(installer, http_server, tmp_path):
    """Unter PARALLEL_MIN_BYTES lohnt Segmentierung nicht - und muss auch
    nicht passieren."""
    srv = http_server(size_bytes=256 * 1024)

    ok = installer.download_url_with_agent(
        srv.url("/file"), str(tmp_path), "klein.safetensors", None
    )

    assert ok is True
    target = tmp_path / "klein.safetensors"
    assert sha256_file(target) == srv.sha256
    assert not any(r for _, r in srv.requests), (
        "Fuer kleine Dateien darf gar kein Range-Request gestellt werden"
    )


def test_server_ohne_range_support_faellt_auf_einzelstream_zurueck(
    installer, http_server, tmp_path
):
    """Grosse Datei, aber der Server ignoriert Range: der Fallback muss
    greifen und trotzdem eine vollstaendige Datei liefern."""
    srv = http_server(size_bytes=20 * 1024 * 1024)

    ok = installer.download_url_with_agent(
        srv.url("/norange"), str(tmp_path), "norange.safetensors", None
    )

    assert ok is True
    target = tmp_path / "norange.safetensors"
    assert target.stat().st_size == len(srv.payload)
    assert sha256_file(target) == srv.sha256


# ---------------------------------------------------------------------------
# Der HuggingFace-Stolperstein: finale URL ohne Range aufloesen
# ---------------------------------------------------------------------------

def test_resolve_download_folgt_redirect_ohne_range_header(installer, http_server):
    """`_resolve_download` muss die finale CDN-URL liefern und darf dabei
    KEINEN Range-Header senden - HFs xet-CDN signiert die Redirect-URL sonst
    auf genau diesen Range und lehnt die Segment-Requests danach ab."""
    srv = http_server(size_bytes=1024 * 512)

    final_url, total, _disposition = installer._resolve_download(srv.url("/redirect"))

    assert final_url.endswith("/file"), "Redirect wurde nicht bis zum Ziel verfolgt"
    assert total == len(srv.payload)
    assert all(rng is None for _, rng in srv.requests), (
        f"Beim Aufloesen darf kein Range mitgeschickt werden: {srv.requests}"
    )


def test_supports_range_erkennt_beide_faelle(installer, http_server):
    srv = http_server(size_bytes=1024 * 64)

    assert installer._supports_range(srv.url("/file")) is True
    assert installer._supports_range(srv.url("/norange")) is False


# ---------------------------------------------------------------------------
# Fehlerfaelle: lieber gar keine Datei als eine kaputte
# ---------------------------------------------------------------------------

def test_unvollstaendiges_segment_erzeugt_keine_datei(
    installer, http_server, tmp_path, monkeypatch
):
    """Wenn ein Segment zu wenig Bytes liefert, muss der Download scheitern -
    und darf keine halbfertige Datei am Zielort hinterlassen."""
    monkeypatch.setattr(installer, "PARALLEL_MIN_BYTES", 1024)
    srv = http_server(size_bytes=512 * 1024)

    ok = installer.download_url_with_agent(
        srv.url("/truncated"), str(tmp_path), "kaputt.safetensors", None
    )

    assert ok is False
    assert not (tmp_path / "kaputt.safetensors").exists()
    assert not (tmp_path / "kaputt.safetensors.temp").exists()
    fehler = [d for e, d in installer._test_sent if e == "download_error"]
    assert fehler, "Es haette ein download_error gemeldet werden muessen"
    assert "Incomplete download" in str(fehler[0])


def test_html_loginseite_wird_als_fehlender_apikey_gemeldet(
    installer, http_server, tmp_path
):
    """Civitai liefert bei fehlendem API-Key eine HTML-Loginseite. Die darf
    nicht als .safetensors auf der Platte landen."""
    srv = http_server(size_bytes=1024)

    ok = installer.download_url_with_agent(
        srv.url("/authwall"), str(tmp_path), "gated.safetensors", None
    )

    assert ok is False
    assert not (tmp_path / "gated.safetensors").exists()
    fehler = [d for e, d in installer._test_sent if e == "download_error"]
    assert fehler, "Es haette ein download_error gemeldet werden muessen"
    assert "API key" in str(fehler[0])


def test_abbruch_raeumt_temp_datei_weg(installer, http_server, tmp_path, monkeypatch):
    """Der Abbrechen-Button schickt den Pfad des laufenden Downloads. Danach
    darf weder die Ziel- noch die Temp-Datei zurueckbleiben."""
    monkeypatch.setattr(installer, "PARALLEL_MIN_BYTES", 1024)
    # Kleine Chunks, damit der Download lange genug laeuft, um ihn mitten
    # drin zu erwischen.
    monkeypatch.setattr(installer, "DOWNLOAD_CHUNK_SIZE", 4 * 1024)
    srv = http_server(size_bytes=32 * 1024 * 1024)

    file_path = os.path.join(str(tmp_path), "abbruch.safetensors")
    ergebnis = {}

    def cancel_soon():
        # Warten, bis der Download aktiv ist und seinen Zielpfad kennt.
        deadline = time.time() + 5
        while time.time() < deadline:
            if installer.request_cancel(file_path) == "active":
                ergebnis["cancel"] = "active"
                return
            time.sleep(0.005)

    t = threading.Thread(target=cancel_soon, daemon=True)
    t.start()

    ok = installer.download_url_with_agent(
        srv.url("/file"), str(tmp_path), "abbruch.safetensors", None
    )
    t.join(timeout=5)

    assert ergebnis.get("cancel") == "active"
    assert ok is False
    assert not os.path.exists(file_path)
    assert not os.path.exists(file_path + ".temp")


# ---------------------------------------------------------------------------
# Fortschrittsanzeige: Tempo + Restzeit
# ---------------------------------------------------------------------------

def test_fortschritt_meldet_tempo_und_groessen(installer, http_server, tmp_path):
    """Die UI berechnet MB/s und ETA aus diesen Feldern - fehlt eines,
    bleibt die Anzeige leer."""
    srv = http_server(size_bytes=20 * 1024 * 1024)

    installer.download_url_with_agent(
        srv.url("/file"), str(tmp_path), "fortschritt.safetensors", None
    )

    updates = [
        payload
        for event, data in installer._test_sent
        if event == "download_progress"
        for payload in (data if isinstance(data, list) else [data])
        if isinstance(payload, dict) and "total" in payload
    ]
    assert updates, "Es kam ueberhaupt kein Fortschritt an"

    for u in updates:
        assert set(["save_path", "progress", "speed", "downloaded", "total"]) <= set(u)
        assert 0 <= u["progress"] <= 100
        assert u["speed"] >= 0
        assert 0 <= u["downloaded"] <= u["total"]

    assert updates[-1]["progress"] == pytest.approx(100.0), (
        "Der letzte Tick muss 100 % melden, sonst haengt der Balken bei 99 %"
    )
    assert updates[-1]["downloaded"] == updates[-1]["total"]


def test_speedmeter_glaettet_und_drosselt(installer):
    meter = installer._SpeedMeter()

    # Direkt hintereinander: keine Neuberechnung (Schutz gegen Zappeln).
    assert meter.update(1000) == 0.0

    time.sleep(0.3)
    erste = meter.update(1_000_000)
    assert erste > 0, "Nach >0.25 s muss ein Tempo berechnet werden"

    time.sleep(0.3)
    zweite = meter.update(2_000_000)
    assert zweite > 0
    # Geglaettet (EMA), nicht der reine Momentanwert -> keine Spruenge um
    # Groessenordnungen bei gleichmaessigem Durchsatz.
    assert 0.2 * erste < zweite < 5 * erste


def test_chunkgroesse_und_verbindungen_sind_gesetzt(installer):
    """Regressionsschutz: mit 1-KB-Chunks war der Download auf schnellen
    Leitungen ausgebremst."""
    assert installer.DOWNLOAD_CHUNK_SIZE == 1024 * 1024
    assert installer.DOWNLOAD_CONNECTIONS == 6
    assert installer.PARALLEL_MIN_BYTES == 16 * 1024 * 1024
