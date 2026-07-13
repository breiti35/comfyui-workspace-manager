# Install-Models-Panel als Entdeckungs-Zentrale

**Datum:** 2026-07-13
**Status:** Design freigegeben, bereit zur Umsetzungsplanung
**Vorgänger-Fundament:** `2026-07-12-models-panel-rich-card-detail-design.md`

## Ziel

Das Install-Models-Panel (die Download-Zentrale für Checkpoints, LoRAs, VAEs
usw. aus Civitai) vom aktuellen „Tabelle mit Download-Knöpfen"-Zustand zu einer
übersichtlichen, app-store-artigen **Entdeckungs-Zentrale** umbauen — im
etablierten Hausstil (dunkles Anthrazit + Blau als Leitakzent, getönte
semantische Farben) und mit derselben DNA wie das bereits fertige Models-Panel
(reiche Karte + Detailansicht + Browser-Toolbar), aber getunt auf *Entdecken &
Herunterladen* statt *Verwalten*.

## Warum (Ist-Zustand / Probleme)

- **Jede Karte ist ein Bedienpult**: Versions-Dropdown + Größe + Install-Button
  + Badge auf jeder der ~30 Karten → visuelles Rauschen.
- **Keine Entscheidungsinformation**: Downloads, Likes, Bewertung, Basismodell —
  der Civitai-Sozialbeweis — fehlen komplett.
- **Kein Lazy-Loading/Windowing** → „model cover image"-Platzhalter, dieselben
  Performance-Probleme, die im Models-Panel schon gelöst sind.
- **Versionswahl auf der Kachel**, bevor man das Modell überhaupt will.
- **Keine Detailansicht**: Beschreibung, Trigger-Wörter, Beispielbilder, Prompts
  fehlen — obwohl im Models-Panel bereits gebaut.
- **Keine „schon installiert"-Erkennung** → versehentliche Doppel-Downloads.
- **Beginnerhafte Kopfzeile**, alles in eine Zeile gequetscht, keine
  Sortierung/Filter.

## Getroffene Entscheidungen

- **Download-Flow: Ein-Klick + Detail.** Die Kachel hat genau einen
  Install-Button (neueste Version → Standardordner). Wer Version/Ordner wählen
  will, öffnet die Detailansicht und installiert dort. → Das Bedienpult
  verschwindet von der Kachel.
- **Alle drei Extra-Innovationen sind dabei**: Trending-Feed beim Öffnen,
  Fortschritt auf der Karte, Sortier- & Basismodell-Filter.

## Architektur (5 Bausteine)

### 1. `InstallModelsModal` (Umbau von `install-models/InstallModelsModal.tsx`)

Zustandshalter: `searchQuery`, `modelType`, `sortBy`, `baseModelFilter`,
`results`, `loading`, `detailItem`. Rendert **Toolbar + Grid**, oder — wenn
`detailItem` gesetzt ist — die **Detailansicht** (gleiche Grid↔Detail-Umschaltung
wie im Models-Panel via bedingtem Render). Schließen-Button bleibt der
getönt-rote Button (`rgba(245,101,101,0.14)`, Größe `md`, wie im Models-Panel).
Default beim Öffnen: leere Query + `sortBy="Most Downloaded"` → sofort ein
Trending-Feed statt leerer Suchmaske.

### 2. `InstallToolbar` (neu, spiegelt `ModelsPanelToolbar`)

- **Zeile 1** (`galleryPanelBg`): Titel „Install Models" + große Suchleiste
  (`SearchInput`, `variant` gefüllt/rund) + `NsfwToggleButton` (wiederverwendet)
  + dezentes Überlauf-Menü (⋯) mit „Custom URL Install" und „Set Civitai API
  Key" — beide wandern aus der Hauptzeile ins Menü.
- **Zeile 2** (`galleryActiveBg`): `CategoryTabs` (`{key:"",label:"All"}` +
  `ALL_MODEL_TYPES`), wie bereits vorhanden.
- **Zeile 3**: **Sortier-Menü** (Meiste Downloads · Beste Bewertung · Neueste)
  + **Basismodell-Filter-Menü** (Alle · SD 1.5 · SDXL · Pony · Flux ·
  Illustrious) + Trefferzahl-Hinweis. Getönter Aktiv-Zustand wie beim
  Favoriten-Filter im Models-Panel.

### 3. `InstallModelCard` (Umbau von `install-models/ModelCard.tsx`)

Portrait 3/4 (`aspectRatio:"3/4"`), `useInView("400px")` gatet den
Thumbnail-Load, `civitThumbUrl` + `loading="lazy"` (Perf-Parität mit
Models-Panel):

- **Overlay unten**: Name + Basismodell-Chip + Typ-Badge.
- **Stats-Chips**: ⬇ Downloads · ♥ Likes aus `model.stats.downloadCount` /
  `stats.favoriteCount`, kompakt formatiert (`12.4k`). Eine kleine
  `formatCount`-Hilfe.
- **NSFW-Blur-Reveal**: konsistent über `showNsfwModelThumbnail` +
  `showNsfwModelThumbnail`-Event (wie bestehende Karte).
- **„Installiert"-Status**: grüner Haken/Badge statt Install-Button, wenn das
  Modell lokal vorhanden ist (Abgleich siehe Datenfluss).
- **Hover → Ein-Klick-Install**: installiert die neueste Version in den
  Standardordner des Typs (`defaultFolders[type]`), über die bestehende
  `onClickInstallModel`/`downloadModels`-Logik.
- **Fortschritt auf der Karte**: Ring/Overlay überm Bild während des Downloads,
  gespeist aus der bestehenden `InstallProgress`-Datenquelle (statt separater
  Liste unten). Fallback: „Installing…"-Zustand über die bestehende
  `installing`-Liste, falls kein Prozentwert verfügbar ist.
- **Klick aufs Bild** (nicht auf Install) → `onOpenDetail(model)`. Der bisherige
  „Civitai-Tab öffnen"-Klick wandert als Link-Icon in die Detailansicht.

### 4. `InstallDetailView` (neu, aus den `civitDetailApi`-Bausteinen)

Verwendet dieselben Legosteine wie `ModelDetailView`: `getCivitModelDetail`,
`getCivitVersionImages`, `civitThumbUrl`, `civitDescriptionToText`, sowie die
`ImageMeta`- und `SectionLabel`-Muster (bei Bedarf in gemeinsam nutzbare Helfer
extrahieren, statt zu duplizieren). Primäraktion ist hier **Installieren**:

- **Links**: Cover (`civitThumbUrl(...,512)`, stabil aus der ausgewählten
  Version) + Typ·Basismodell + Trigger-Wort-Chips.
- **Rechts**: **Versionsliste** in kontrollierter Scroll-Box (`hideScrollbarSx`)
  — jede Zeile mit Name, Größe, Basismodell und **eigenem Install-Button**;
  Zielordner-Auswahl (Default-Folder des Typs, änderbar). *Hier* passiert die
  Versionswahl.
- **Darunter**: Beschreibung in eigener kontrollierter Scroll-Box
  (`civitDescriptionToText`, kein `dangerouslySetInnerHTML`).
- **Beispielbilder mit Prompts**: `getCivitVersionImages` (mit `withMeta=true`
  und `browsingLevel=31`-Logik auf civitai.red), `ImageMeta`-Muster für
  Prompt/Sampler/Steps/CFG/Seed, Bild-Toggle per Array-Index, NSFW-Blur nach
  `levelNum`.
- **Zurück-Button** → zurück zum Grid.

### 5. API-Schicht (`getModelFromCivitAPI.ts`)

`getModelFromCivitAPi` um optionale Parameter `sort` (`"Most Downloaded" |
"Highest Rated" | "Newest"`) und `baseModels` (String) erweitern und an die
`URLSearchParams` anhängen. Host-aware und Cache-Logik bleiben; der Cache-Key ist
bereits die volle URL, also greift das Caching pro Sortier-/Filter-Kombination
automatisch. NSFW-Param-Logik bleibt unverändert.

## Datenfluss

1. Toolbar-Änderung (Query / Typ / Sort / Basismodell) → `getModelFromCivitAPi(
   modelType, query, sort, baseModels)` (host-aware, gecacht) → `results`.
2. Grid rendert `InstallModelCard` je Treffer (auto-fill
   `minmax(190px,1fr)`-Grid wie Models-Panel, `hideScrollbarSx`).
3. **„Installiert"-Abgleich**: Beim Öffnen einmal `indexdb.models` laden und eine
   normalisierte Menge (Modellname und/oder Datei-Hash) bilden; jede Karte prüft
   Zugehörigkeit.
4. Klick auf Karte → `detailItem` gesetzt → `InstallDetailView` lädt Detail +
   Versionsbilder nach.
5. Install (Karte oder Detail) → bestehende `installModelsApi` (unverändert) →
   Fortschritt fließt über die `InstallProgress`-Datenquelle zurück auf die
   Karte.

## Was wegfällt / aufgeräumt wird

- Versions-Dropdown + Größe + Badge-Pult auf jeder Kachel.
- „Custom URL Install" + „API Key" aus der Kopfzeile → ins ⋯-Menü.
- Separate `InstallProgress`-Liste unten → ersetzt durch Fortschritt auf der
  Karte (Datenquelle bleibt, nur die Darstellung wandert).

## Bewusst nicht dabei (YAGNI)

- Kein Civitai-Login / Favoriten-Sync, keine Kommentare.
- Keine ausgebaute Multi-Download-Warteschlangen-UI über das Nötige hinaus.
- Keine Live-Civitai-Verifikation im Dev — visuelle Checks mit Mock/Cache-Daten
  (Fetch-Stub + `model_list`-Event + `indexdb`-Seed), wie im Fundament etabliert.

## Constraints (aus Projektgedächtnis)

- Produktion (Port 8188, `G:\ComfyUI`) nicht anfassen; Verifikation in
  Testumgebung Port 8189.
- Commit-Konvention: Source-Commit + separater `dist`-Rebuild-Commit
  (`npm run build` in `ui/`).
- Ablauf: bauen → Screenshots zeigen → erst auf explizites „OK" des Users
  committen/aufräumen; Testserver nicht sofort stoppen.

## Wiederverwendete Bausteine (kein Neubau nötig)

`CategoryTabs`, `SearchInput` (mit `variant`), `NsfwToggleButton`,
`hideScrollbarSx`, `useInView`, `civitThumbUrl` / `getCivitVersionImages` /
`getCivitModelDetail` / `civitDescriptionToText`, `installModelsApi`,
`getFileEssential`, semantische Tokens (`galleryPanelBg`, `galleryActiveBg` …).
