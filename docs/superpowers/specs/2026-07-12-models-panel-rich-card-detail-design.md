# Models-Panel: reiche Karte + Detailansicht (Fundament)

Datum: 2026-07-12
Status: freigegeben, in Umsetzung

## Ziel

Der ComfyUI "LoRA Manager" dient als **Vorbild, nicht Kopie**. Wir übernehmen
seine Design-/Funktions-DNA (reiche Karten, Detailansicht per Civitai-API) im
bestehenden Hausstil (dunkel, Grau/Blau, Galerie-/Drawer-konsistent). Diese
erste Runde legt das **Fundament am Models-Panel** (installierte Modelle); das
Muster wird später auf Install-Panel und Galerie ausgerollt.

## Umfang dieser Runde

### 1) Karte (schlank)
- Cover füllt die Karte (Portrait). Unten über dem Bild ein Verlauf mit
  **Name (fett) + Versions-Chip** (z. B. `XL5`, `ZENITH V9`).
- NSFW bleibt über den bestehenden globalen Schalter geblurrt (kein
  per-Karte-Reveal in dieser Runde).
- Ziehen-auf-Canvas bleibt erhalten. Klick öffnet die Detailansicht.
- Der bestehende Hash-Lookup (`fetchCivitModelFromHashKey`) speichert
  zusätzlich **Versionsname + Basismodell** (heute nur Modellname), damit der
  Chip echte Daten zeigt. Cache-Version wird erhöht.

### 2) Detailansicht (ersetzt das Grid, Zurück-Pfeil — wie die Galerie)
- Kopf: `← Zurück` + Modellname + "Auf Civitai öffnen"-Link.
- Cover + **Beschreibung** (Civitai-HTML, sanitisiert gerendert) +
  **Trigger-Wörter** als kopierbare Chips.
- **Versionsliste**: alle Versionen mit Größe; installierte Version markiert.
- **Beispielbilder-Galerie**: Klick auf ein Bild zeigt dessen Prompt/Sampler
  (aus `image.meta`) zum Nachbauen. NSFW-Bilder folgen dem globalen Blur.
- Fallback ohne Civitai-Treffer: lokale Infos (Dateiname, Größe, Ordner) +
  Hinweis.

### 3) Technik
- Neuer Util `getCivitModelDetail(modelId)` → `${baseUrl}/api/v1/models/{id}`,
  **domain-bewusst** (civitai.com/.red) und **gecacht** (analog zu den anderen
  Civitai-Calls, eigener versionierter Cache-Key).
- Neue Komponente `ModelDetailView.tsx`.
- `ModelsListDrawer` schaltet Grid ↔ Detail um (selektiertes Modell im State).
- Karten-Umbau in `ModelItem.tsx` (Overlay statt separater Textzeile).
- Detail-Fetch nur bei Klick (nutzergesteuert), keine Massenabfrage.

## Bewusst NICHT in dieser Runde
Badges, Schnellaktions-Icons, Favoriten, Stats-Kennzahlen, sowie die
Übertragung auf Install-Panel und Galerie. Jeweils eigene Folge-Runden.

## Nicht-Ziele / Constraints
- Bestehende Funktionen bleiben unverändert (Ziehen, NSFW-Schalter, Suche,
  Sortierung, Kategorien).
- Keine automatische Live-Verifikation gegen die echte Civitai-API aus der
  Entwicklungsumgebung; Layout-Checks laufen mit Mock/Cache-Daten.
