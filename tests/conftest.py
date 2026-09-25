"""Test-Setup fuer die Service-Module.

Die Backend-Module laufen normalerweise IN ComfyUI und importieren dessen
Globals (`server`, `folder_paths`). Fuer den Test stellen wir dafuer minimale
Stubs bereit, damit `service.model_manager.*` ohne ComfyUI importierbar ist.

Ausserdem hier: ein echter lokaler HTTP-Server als Fixture, gegen den der
Download-Code wirklich laeuft (inkl. Range-Requests, Redirects, Auth-Seite).
Kein Mock des Netzwerkstacks - genau das ist der Teil, der beim
Parallel-Download schiefgehen kann.
"""

import asyncio
import hashlib
import http.server
import os
import re
import socket
import sys
import threading
import types
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]


def _install_comfy_stubs():
    """Minimal-Stubs fuer die ComfyUI-Module, die service/ beim Import zieht."""
    if "server" not in sys.modules:
        server_mod = types.ModuleType("server")

        class _Routes:
            def get(self, path):
                def deco(fn):
                    return fn

                return deco

            def post(self, path):
                def deco(fn):
                    return fn

                return deco

        class _Instance:
            routes = _Routes()

            async def send(self, event, data):
                return None

            def send_sync(self, event, data):
                return None

        class PromptServer:
            instance = _Instance()

        server_mod.PromptServer = PromptServer
        sys.modules["server"] = server_mod

    if "nodes" not in sys.modules:
        # node_service liest hierueber die Node-Definitionen. Fuer die
        # Tests reicht eine leere Registry.
        nodes_mod = types.ModuleType("nodes")
        nodes_mod.NODE_CLASS_MAPPINGS = {}
        sys.modules["nodes"] = nodes_mod

    if "folder_paths" not in sys.modules:
        fp = types.ModuleType("folder_paths")
        # model_installer leitet comfy_path aus folder_paths.__file__ ab.
        fp.__file__ = str(REPO_ROOT / "tests" / "_fake_comfy" / "folder_paths.py")
        fp.folder_names_and_paths = {}
        fp.get_folder_paths = lambda name: []
        fp.models_dir = str(REPO_ROOT / "tests" / "_fake_comfy" / "models")
        # media_service braucht Output-/Input-Verzeichnis. Defaults zeigen ins
        # Nirgendwo (_fake_comfy/{output,input} existiert nicht); Tests, die
        # das brauchen, biegen per monkeypatch auf ein echtes tmp_path um.
        fp.get_output_directory = lambda: str(REPO_ROOT / "tests" / "_fake_comfy" / "output")
        fp.get_input_directory = lambda: str(REPO_ROOT / "tests" / "_fake_comfy" / "input")
        sys.modules["folder_paths"] = fp


def _ensure_event_loop():
    """service-Module holen sich beim Import per `asyncio.get_event_loop()`
    den Loop, den ComfyUI zu dem Zeitpunkt schon laufen hat. Im Test gibt es
    den nicht - also einen bereitstellen, sonst schlaegt schon der Import fehl.
    """
    try:
        asyncio.get_event_loop()
    except RuntimeError:
        asyncio.set_event_loop(asyncio.new_event_loop())


_install_comfy_stubs()
_ensure_event_loop()

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


# --------------------------------------------------------------------------
# Lokaler HTTP-Server
# --------------------------------------------------------------------------

class _Handler(http.server.BaseHTTPRequestHandler):
    """Serviert genau einen Byte-Puffer, konfigurierbar pro Server-Instanz.

    Pfade:
      /file            - normale Auslieferung, Range wird unterstuetzt
      /norange         - ignoriert Range komplett (antwortet immer 200)
      /redirect        - 302 auf /file (prueft, dass die finale URL aufgeloest wird)
      /authwall        - HTML-Login-Seite statt der Datei
      /truncated       - liefert bei Range absichtlich zu wenig Bytes
      /flaky           - bricht die Verbindung mitten im Body ab, solange
                         server.flaky_budget > 0 (prueft Retry + Fortsetzen).
                         Ausgenommen: der erste Request ohne Range (das
                         Aufloesen der URL) und die Range-Probe bytes=0-1.
    """

    protocol_version = "HTTP/1.1"

    def log_message(self, *args):  # Testlauf nicht zumuellen
        pass

    # -- Hilfen ------------------------------------------------------------
    @property
    def payload(self) -> bytes:
        return self.server.payload

    def _send_full(self, body: bytes, ctype="application/octet-stream"):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        self.wfile.write(body)

    def _send_range(self, body: bytes, rng: str, short_by: int = 0):
        m = re.match(r"bytes=(\d+)-(\d*)", rng)
        start = int(m.group(1))
        end = int(m.group(2)) if m.group(2) else len(body) - 1
        chunk = body[start : end + 1]
        if short_by:
            chunk = chunk[: max(0, len(chunk) - short_by)]
        self.send_response(206)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Range", f"bytes {start}-{end}/{len(body)}")
        self.send_header("Content-Length", str(len(chunk)))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        self.wfile.write(chunk)

    def _send_cut_off(self, body: bytes, rng):
        """Header versprechen den vollen Umfang, geschickt wird nur die
        Haelfte - dann Verbindung hart zu (wie ein abreissender Proxy)."""
        if rng:
            m = re.match(r"bytes=(\d+)-(\d*)", rng)
            start = int(m.group(1))
            end = int(m.group(2)) if m.group(2) else len(body) - 1
            chunk = body[start : end + 1]
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{len(body)}")
        else:
            chunk = body
            self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(chunk)))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        self.wfile.write(chunk[: len(chunk) // 2])
        self.wfile.flush()
        self.close_connection = True
        try:
            self.connection.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass

    # -- Routen ------------------------------------------------------------
    def do_GET(self):
        path = self.path.split("?")[0]
        rng = self.headers.get("Range")
        self.server.requests.append((path, rng))

        if path == "/authwall":
            body = b"<html><head><title>Sign in</title></head><body>login</body></html>"
            self._send_full(body, ctype="text/html; charset=utf-8")
            return

        if path == "/redirect":
            self.send_response(302)
            self.send_header("Location", "/file")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        if path == "/norange":
            # Range wird bewusst ignoriert -> immer die ganze Datei, Status 200.
            self._send_full(self.payload)
            return

        if path == "/flaky":
            if rng is None:
                self.server.flaky_plain_requests += 1
            truncatable = (rng is None and self.server.flaky_plain_requests > 1) or (
                rng is not None and rng != "bytes=0-1"
            )
            if truncatable and self.server.flaky_budget > 0:
                self.server.flaky_budget -= 1
                self._send_cut_off(self.payload, rng)
                return
            if rng:
                self._send_range(self.payload, rng)
            else:
                self._send_full(self.payload)
            return

        if path == "/truncated":
            if rng:
                self._send_range(self.payload, rng, short_by=16)
                return
            self._send_full(self.payload)
            return

        # /file (Default)
        if rng:
            self._send_range(self.payload, rng)
        else:
            self._send_full(self.payload)


class _TestServer(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class ServerHandle:
    def __init__(self, httpd, port, payload):
        self._httpd = httpd
        self.port = port
        self.payload = payload
        self.sha256 = hashlib.sha256(payload).hexdigest()

    def set_flaky_budget(self, n: int):
        self._httpd.flaky_budget = n

    def url(self, path="/file") -> str:
        return f"http://127.0.0.1:{self.port}{path}"

    @property
    def requests(self):
        return self._httpd.requests


@pytest.fixture
def http_server():
    """Startet den Test-Server; Payload-Groesse ist pro Test einstellbar."""
    handles = []

    def _start(size_bytes: int = 1024 * 64) -> ServerHandle:
        # Deterministischer, gut komprimierbarer-unabhaengiger Zufallsinhalt:
        # os.urandom, damit ein falsch zusammengesetzter Parallel-Download
        # garantiert auffaellt (keine wiederholten Muster).
        payload = os.urandom(size_bytes)
        port = _free_port()
        httpd = _TestServer(("127.0.0.1", port), _Handler)
        httpd.payload = payload
        httpd.requests = []
        httpd.flaky_budget = 0
        httpd.flaky_plain_requests = 0
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        handle = ServerHandle(httpd, port, payload)
        handles.append((httpd, thread))
        return handle

    yield _start

    for httpd, thread in handles:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=5)


@pytest.fixture
def installer(monkeypatch):
    """Das model_installer-Modul mit abgefangenem WebSocket-Versand.

    `sent` sammelt alle Fortschritts-Payloads, damit die Tests pruefen koennen,
    dass Tempo/ETA-Daten wirklich mitgeschickt werden.
    """
    # asyncio.run() in anderen Tests raeumt den Loop hinterher weg - vor dem
    # Import also erneut sicherstellen, dass einer da ist.
    _ensure_event_loop()
    from service.model_manager import model_installer as mi

    sent = []

    def fake_send_ws(event, data):
        # Gleiche Aufbereitung wie der echte send_ws (Token-Maskierung) -
        # die Tests sehen also genau das, was an den Browser ginge.
        sent.append((event, mi._ws_data(data)))

    monkeypatch.setattr(mi, "send_ws", fake_send_ws)
    # Drosselung aus, damit jeder Fortschritts-Tick im Test ankommt.
    monkeypatch.setattr(mi, "last_call_time", 0)
    # Kein globaler cancel_path mehr - Abbruch laeuft pro Download ueber
    # request_cancel(). Vorsichtshalber keinen haengenden Download aus einem
    # frueheren Test uebernehmen.
    monkeypatch.setattr(mi, "_active_download", None)
    # Retries im Test ohne Wartezeit.
    monkeypatch.setattr(mi, "RETRY_DELAY_S", 0)
    mi._test_sent = sent
    return mi
