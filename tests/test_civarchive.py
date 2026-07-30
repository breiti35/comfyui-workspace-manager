"""Funktionstests fuer den CivArchive-Fallback.

CivArchive hat keine offizielle API - wir lesen die Modelldaten aus dem
`__NEXT_DATA__`-Payload der Seite. Das ist der fragile Teil: aendert sich die
Seitenstruktur, muss der Parser sauber "nichts gefunden" melden statt
irgendetwas Halbgares in die Modellkarten zu schreiben.

Die Tests laufen gegen Fixture-HTML (kein Netzzugriff), damit sie auch ohne
Internet und ohne Last fuer civitaiarchive.com durchlaufen.
"""

import asyncio
import json

import pytest

from service.model_manager import civarchive


HASH = "93628a4e" + "0" * 56


def seite(page_props: dict) -> str:
    """Baut eine Next.js-Seite mit dem uebergebenen pageProps-Payload."""
    data = {"props": {"pageProps": page_props}}
    return (
        "<html><body><div>irgendwas</div>"
        '<script id="__NEXT_DATA__" type="application/json">'
        + json.dumps(data)
        + "</script></body></html>"
    )


TREFFER = {
    "meta": {"image": "https://image.civitai.com/xyz/abc/width=450/preview.jpeg"},
    "models": [{"name": "Aang and Zuko", "type": "LORA", "nsfw_level": 1}],
    "files": [
        {"source": "civitai", "model_id": 123456, "model_version_id": 789012}
    ],
}


@pytest.fixture(autouse=True)
def leerer_cache():
    """Prozessweiter Cache darf nicht zwischen Tests durchschlagen."""
    civarchive._cache.clear()
    yield
    civarchive._cache.clear()


# ---------------------------------------------------------------------------
# Parsen
# ---------------------------------------------------------------------------

def test_treffer_liefert_bild_und_modellinfos(monkeypatch):
    monkeypatch.setattr(civarchive, "_fetch_html", lambda url: seite(TREFFER))

    result = civarchive._lookup_civarchive(HASH)

    assert result == {
        "imageUrl": "https://image.civitai.com/xyz/abc/width=450/preview.jpeg",
        "modelName": "Aang and Zuko",
        "modelType": "LORA",
        "nsfwLevel": 1,
        "source": "civitai",
        "sourceModelId": 123456,
        "sourceModelVersionId": 789012,
    }


def test_hash_landet_in_der_abgefragten_url(monkeypatch):
    gerufen = []

    def fake_fetch(url):
        gerufen.append(url)
        return seite(TREFFER)

    monkeypatch.setattr(civarchive, "_fetch_html", fake_fetch)
    civarchive._lookup_civarchive(HASH)

    assert gerufen == [f"https://civitaiarchive.com/sha256/{HASH}"]


def test_quelle_kann_auch_huggingface_sein(monkeypatch):
    """Der Sinn des Fallbacks: plattformuebergreifend ueber den SHA256."""
    payload = {
        "meta": {"image": "https://image.civitai.com/hf/preview.jpeg"},
        "models": [{"name": "Some HF Model", "type": "Checkpoint"}],
        "files": [{"source": "huggingface", "model_id": "org/repo"}],
    }
    monkeypatch.setattr(civarchive, "_fetch_html", lambda url: seite(payload))

    result = civarchive._lookup_civarchive(HASH)

    assert result["source"] == "huggingface"
    assert result["modelName"] == "Some HF Model"
    assert result["sourceModelVersionId"] is None


# ---------------------------------------------------------------------------
# "Nicht im Archiv" vs. "Fehler" - der Unterschied steuert die Cache-Dauer
# ---------------------------------------------------------------------------

def test_leere_trefferseite_ist_ein_sauberes_nichts(monkeypatch):
    """Die 'not found'-Seite rendert ebenfalls __NEXT_DATA__, aber ohne
    Inhalte. Das ist eine bestaetigte Fehlanzeige -> {} (nicht None)."""
    monkeypatch.setattr(
        civarchive,
        "_fetch_html",
        lambda url: seite({"meta": {}, "models": [], "files": []}),
    )

    assert civarchive._lookup_civarchive(HASH) == {}


def test_treffer_ohne_vorschaubild_zaehlt_nicht(monkeypatch):
    """Ohne Bild bringt der Eintrag fuer die Modellkarte nichts."""
    payload = dict(TREFFER, meta={})
    monkeypatch.setattr(civarchive, "_fetch_html", lambda url: seite(payload))

    assert civarchive._lookup_civarchive(HASH) == {}


def test_fehlendes_next_data_ist_ein_fehler(monkeypatch):
    """Seitenstruktur geaendert -> None, damit frueher erneut versucht wird."""
    monkeypatch.setattr(
        civarchive, "_fetch_html", lambda url: "<html><body>nichts</body></html>"
    )

    assert civarchive._lookup_civarchive(HASH) is None


def test_kaputtes_json_ist_ein_fehler(monkeypatch):
    kaputt = (
        '<script id="__NEXT_DATA__" type="application/json">{ nicht json </script>'
    )
    monkeypatch.setattr(civarchive, "_fetch_html", lambda url: kaputt)

    assert civarchive._lookup_civarchive(HASH) is None


def test_netzwerkfehler_wird_geschluckt(monkeypatch):
    def boom(url):
        raise OSError("Verbindung fehlgeschlagen")

    monkeypatch.setattr(civarchive, "_fetch_html", boom)

    assert civarchive._lookup_civarchive(HASH) is None


# ---------------------------------------------------------------------------
# Route + Cache
# ---------------------------------------------------------------------------

class FakeQuery(dict):
    pass


class FakeRequest:
    def __init__(self, **query):
        self.query = FakeQuery(query)


def route_aufrufen(**query):
    resp = asyncio.run(civarchive.civarchive_by_hash(FakeRequest(**query)))
    return json.loads(resp.body.decode())


def test_route_liefert_die_archivdaten(monkeypatch):
    monkeypatch.setattr(civarchive, "_fetch_html", lambda url: seite(TREFFER))

    body = route_aufrufen(hash=HASH)

    assert body["modelName"] == "Aang and Zuko"
    assert body["imageUrl"].startswith("https://image.civitai.com/")


def test_route_ohne_hash_antwortet_leer(monkeypatch):
    def darf_nicht_aufgerufen_werden(url):
        raise AssertionError("Ohne Hash darf CivArchive nicht abgefragt werden")

    monkeypatch.setattr(civarchive, "_fetch_html", darf_nicht_aufgerufen_werden)

    assert route_aufrufen() == {}


def test_zweite_abfrage_kommt_aus_dem_cache(monkeypatch):
    """Ein Modellraster mit vielen Karten darf CivArchive nicht mehrfach
    pro Hash abfragen."""
    aufrufe = []

    def zaehlend(url):
        aufrufe.append(url)
        return seite(TREFFER)

    monkeypatch.setattr(civarchive, "_fetch_html", zaehlend)

    erste = route_aufrufen(hash=HASH)
    zweite = route_aufrufen(hash=HASH)

    assert erste == zweite
    assert len(aufrufe) == 1, f"CivArchive wurde {len(aufrufe)}x abgefragt"


def test_hash_wird_normalisiert(monkeypatch):
    """Gross/klein + Leerzeichen duerfen keinen zweiten Cache-Eintrag
    erzeugen."""
    aufrufe = []
    monkeypatch.setattr(
        civarchive,
        "_fetch_html",
        lambda url: (aufrufe.append(url), seite(TREFFER))[1],
    )

    route_aufrufen(hash=HASH.upper())
    route_aufrufen(hash=f"  {HASH}  ")

    assert len(aufrufe) == 1
    assert aufrufe[0].endswith(HASH.lower())


def test_fehlanzeige_wird_ebenfalls_gecacht(monkeypatch):
    aufrufe = []

    def zaehlend(url):
        aufrufe.append(url)
        return seite({"meta": {}, "models": [], "files": []})

    monkeypatch.setattr(civarchive, "_fetch_html", zaehlend)

    assert route_aufrufen(hash=HASH) == {}
    assert route_aufrufen(hash=HASH) == {}
    assert len(aufrufe) == 1


def test_fehlanzeige_laeuft_frueher_ab_als_ein_treffer():
    """Unbekannte Hashes sollen es gelegentlich erneut versuchen,
    Treffer nicht."""
    assert civarchive._FAILURE_TTL < civarchive._SUCCESS_TTL
