# Gemeinsame Vorgaben für alle Richtungsskizzen

Ziel: je Richtung EINE selbständige HTML-Datei, die den ersten Bildschirm (1440 × 900 px) zeigt.
Sie dient einer Entscheidungsseite als Skizze; Text unter 22 px wird dort als Balken gezeichnet, also tragen
Komposition, Flächen, Linien, Kontraste und große Schrift die Aussage.

## Technische Regeln (hart)
- Ein Dokument mit `<!doctype html>`, `<html lang="de">`, `<meta charset="utf-8">`, inline `<style>`, KEIN JavaScript.
- `html, body { width:1440px; height:900px; overflow:hidden; margin:0 }`.
- Nichts extern laden außer optional Google Fonts. Keine Bilder: Vorschaubilder als ruhige CSS-Flächen
  (lineare Verläufe in gedeckten, unterschiedlichen Tönen, jedes Feld anders), keine Fotos, keine SVG-Illustrationen.
- Unter 200 Zeilen. Keine Kommentare über die Richtung, keine Meta-Texte im Bild.
- Schrift: System-/Inter-Stack wie ComfyUI (`Inter, ui-sans-serif, system-ui, sans-serif`);
  Zahlen mit `font-variant-numeric: tabular-nums`.
- Farben nur aus ComfyUI-Dunkel-Standard: Canvas #202020 mit feinem Punktraster, Menü #353535,
  Sekundär #292929, Eingabe #222222, Panel #171718, Linien #4e4e4e / #3a3a3a, Text #ffffff / #b0b0b0 / #8a8a8a,
  Akzent #0b8ce9, Gefahr #e05252, Warnung #e0a030, Erfolg #3fb950. Jede Richtung setzt diese Werte anders ein.

## Szene (für alle gleich, echter Inhalt)
Hintergrund: ComfyUI-Knoteneditor (dunkles Punktraster, 2–3 angedeutete Knoten als Rechtecke mit Kopfzeile),
oben links ComfyUI-Menüleiste schmal. Darüber die Topbar der Erweiterung, darüber das Bibliotheksfenster
(max. ~1380 × 800, zentriert, abgedunkelter Hintergrund ohne Unschärfe).

Topbar der Erweiterung (42 px hoch, zwei Gruppen):
- links „aktueller Workflow“: Workflow-Name „Porträt-Studie v3“ mit Ungespeichert-Punkt, Speichern, Version „v12“,
  Menü ▾, Galerie-Knopf (Bild-Symbol + „Galerie“).
- rechts „Bibliothek“: Knopf „Bibliothek“ (aktiv), Download-Ring mit Zahl 2, Andocken-Symbol, Einstellungen-Zahnrad.

Bibliotheksfenster, Bereich **Modelle › Installiert**:
- Seitenleiste mit drei Gruppen: ARBEIT – Workflows 64 · Galerie 128 · Prompts 23 / MODELLE – Installiert 412 (aktiv)
  · Entdecken / SYSTEM – Downloads 2 · Einstellungen. Unten: „Andocken“ und „Esc zurück“.
- Kopf: Titel „Installiert“, Unterzeile „412 Modelle · 1,9 TB“, Hauptaktion rechts „Modell installieren“, Schließen ✕.
- Werkzeugzeile (immer diese Reihenfolge): Suche „Modelle durchsuchen…“, Typ-Filter als Segment/Chips
  (Alle 412 · Checkpoints 38 · LoRA 296 · VAE 6 · Text-Encoder 9 · Upscaler 12 · Diffusion 21),
  Basismodell-Auswahl „Alle Basismodelle ▾“, Sortierung „Zuletzt hinzugefügt ▾“, Ansicht Raster/Liste.
- Raster fester Karten (gleiche Größe, Bild oben, Kennzeile, Name, 1 Zeile Meta), mindestens 10 Karten sichtbar:
  1. flux1-dev-fp8 – Checkpoint · Flux.1 D · 11,9 GB
  2. juggernautXL_v9 – Checkpoint · SDXL 1.0 · 6,6 GB
  3. wan2.1_t2v_14B_fp8 – Diffusion · Wan 2.1 · 14,3 GB
  4. pixel-art-xl – LoRA · SDXL 1.0 · 163 MB · Trigger-Tag „pixel art“
  5. add-detail-xl – LoRA · SDXL 1.0 · 228 MB
  6. Lustige Katze LoRA – LoRA · Flux.1 D · 72 MB – NSFW-unscharf (Fläche stark verwischt, Hinweis „NSFW · anzeigen“)
  7. krea2_turbo – Checkpoint · Krea 2 · 9,8 GB – lädt gerade: Fortschritt 64 % · 38,2 MB/s · noch 1:42
  8. ae – VAE · Flux.1 D · 335 MB
  9. t5xxl_fp8_e4m3fn – Text-Encoder · 4,9 GB
  10. 4x-UltraSharp – Upscaler · 67 MB
  11. old_style_lora – LoRA · SD 1.5 · 144 MB – „Nicht auf Civitai“, Knopf „Auf CivArchive suchen“
  12. minimax_h3_video – Diffusion · MiniMax H3 · 18,1 GB
- Fußzeile: „412 Modelle · 3 ausgewählt“ NICHT – Auswahl gibt es noch nicht; stattdessen „412 Modelle“ und
  „Hash-Prüfung: 2 ausstehend“.
- Deutlich sichtbarer Standort: welcher Bereich aktiv ist, muss aus Seitenleiste, Kopf UND Topbar ablesbar sein.

## Qualitätsmaßstab
Muss als echtes Produkt seiner Kategorie lesbar sein (Standard-Bedienelemente: Suchfeld, Chips, Selects,
Knöpfe, Karten), sauber ausgerichtet, ein Abstandsraster, klare Hierarchie. Die Richtung zeigt sich nur über
Schrift-Rang, Flächen-/Farbeinsatz, Dichte und EIN Erkennungsmerkmal – nie als Kostüm.
