# Install-Panel-Pagination (Seitengröße + Vor/Zurück)

**Datum:** 2026-07-13
**Status:** Design freigegeben (User), bereit zur Umsetzung
**Kontext:** Teil des UI-Overhauls (siehe `comfyui-workspace-manager-overhaul`).
Folgt auf Install-Panel + Settings-Umbau + Crash-Fix.

## Ziel

Das Install-Panel lädt aktuell hart `limit=40` und zeigt nie mehr — „40
Treffer" suggeriert fälschlich eine Gesamtzahl. Nutzer sollen die
**Seitengröße wählen** (10/15/25/50, Standard 25) und **vor/zurück blättern**.

## Harte API-Grenze (live verifiziert)

Civitai `/api/v1/models` ist **cursor-basiert**, nicht seiten-/offset-basiert:
- Antwort-`metadata` enthält nur `nextCursor` / `nextPage` — **keine**
  `totalItems`/`totalPages`, **kein** „Seite X von Y".
- `&page=2` → **HTTP 400**. Direktes Anspringen einer Seitennummer ist
  unmöglich (gilt für Suche UND Trending).

Konsequenz: **nur Vor/Zurück** (Cursor), **keine** nummerierten Sprünge, **keine**
Gesamtzahl. „Zurück" funktioniert, indem wir die besuchten Cursor clientseitig
in einem Stack merken.

## Getroffene Entscheidungen

- **Seitengröße:** 10 / 15 / 25 / 50, Standard **25**.
- **Blättern:** Leiste unten `‹ Zurück   Seite N   Weiter ›`. „Weiter" aktiv,
  solange die API `nextCursor` liefert; „Zurück" ab Seite 2 (Cursor-Stack).
  „Seite N" = laufender Zähler (keine Gesamtzahl).
- **Trefferanzeige:** „40 Treffer" → „**N auf dieser Seite**" (ehrlich, da die
  Gesamtzahl unbekannt ist).
- **Reset auf Seite 1** bei jeder Änderung von Suche, Sortierung, Basismodell,
  Kategorie oder Seitengröße.

## Architektur / Datenfluss

### `getModelFromCivitAPi` (util/getModelFromCivitAPI.ts)
- Neue Signatur: zusätzliche Parameter `limit` (Zahl, Default 25) und `cursor`
  (optional). Rückgabe künftig **`{ items: CivitiModel[]; nextCursor?: string }`**
  statt nur `items[]`.
- `nextCursor` aus `json.metadata?.nextCursor` lesen.
- Der Array-Schutz aus dem Crash-Fix bleibt: `items` immer Array, keine
  kaputten Antworten cachen, `fetch`/JSON-Fehler → `{ items: [], nextCursor:
  undefined }`. Cache speichert zusätzlich `nextCursor`; Cache-Key enthält
  `cursor`+`limit` (steckt bereits im `queryString`).

### `InstallModelsModal`
Neuer State: `pageSize` (25), `cursor` (aktuelle Seite; `undefined` = Seite 1),
`prevCursors: (string|undefined)[]` (Rücksprung-Stack), `nextCursor` (aus
Antwort; aktiviert „Weiter"), `pageNumber` (1-basiert, nur Anzeige).
- `loadData(cursor)` nimmt den Cursor explizit, setzt `models` + `nextCursor`.
- `resetAndLoad()` (Seite 1): Stack leeren, `cursor=undefined`, `pageNumber=1`,
  `loadData(undefined)`. Wird vom Effekt auf `[modelType, sortBy, baseModel,
  pageSize]`, von der Suche (Enter) und vom `civitaiIncludeAdultContent`-Event
  aufgerufen.
- `goNext()`: bei vorhandenem `nextCursor` aktuellen Cursor auf den Stack,
  `cursor=nextCursor`, `pageNumber+1`, `loadData(nextCursor)`, Grid nach oben
  scrollen.
- `goPrev()`: ab `pageNumber>1` obersten Stack-Cursor poppen, dorthin laden,
  `pageNumber-1`, hochscrollen.

### `InstallToolbar`
- Neue `PAGE_SIZE_OPTIONS = [10,15,25,50]`; Menü „Anzeigen: N ▾" neben
  Sortierung/Basismodell. Neue Props `pageSize`, `setPageSize`.
- Trefferzeile: „N auf dieser Seite" statt „N Treffer".

### Blätter-Leiste
Unten im (Detail-losen) Panel, zentriert: `‹ Zurück   Seite N   Weiter ›`.
`Zurück` disabled bei Seite 1; `Weiter` disabled ohne `nextCursor` oder während
`loading`.

## Bewusst nicht dabei (YAGNI)

- Kein Sprung zu beliebiger Seite (API-technisch unmöglich).
- Keine Gesamtzahl / „von Y".
- Keine Änderung an Detailansicht, Karten oder Download-Logik.

## Constraints

- Prod (8188) nicht anfassen; Verifikation auf 8189.
- Build-Gate `npm run build` in `ui/`; kein Test-Framework.
- Commit-Konvention: Source-Commit(s) + separater `dist`-Rebuild.
