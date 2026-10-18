# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Alle, die ComfyUI mit diesem Fork verwenden – öffentliches Repo, lokal und auf RunPod (ComfyUI per Proxy im Browser).
Spannweite vom Einsteiger, der zum ersten Mal ein Modell installiert, bis zum Vielnutzer mit hunderten Modellen,
Bildern und Workflows. Nicht nur der Maintainer.

Situation: Die Person arbeitet im ComfyUI-Knoteneditor und öffnet das Panel zwischendurch, um etwas zu holen,
nachzusehen oder abzulegen – und will danach ohne Umweg zurück an den Graphen.

Typische Aufgaben (Maßstab für die Bedienung):
- Ein Modell suchen, ansehen und installieren.
- Laufende Downloads überwachen und abbrechen, auch bei geschlossenem Panel.
- Bei einem installierten Modell die Trigger-Words schnell kopieren, während am Graphen gearbeitet wird.
- Ein Bild in der Galerie finden, Parameter ansehen, als Rezept speichern.
- Während einer Generierung die Live-Vorschau mit Parametern verfolgen.
- Ein Rezept in der Prompt-Bibliothek finden und anwenden (heute: Positiv-Prompt kopieren).
- Einen Workflow finden und öffnen.

## Product Purpose

Ein Panel innerhalb von ComfyUI (kein eigenständiges Programm), das Modelle, Medien, Prompts und Workflows als
eine Bibliothek zum Suchen, Ordnen und Wiederfinden zusammenführt – inklusive Civitai-Suche und Installation.
Erfolg: Jede typische Aufgabe ist ohne Suchen nach dem richtigen Menü erledigt, und man findet ebenso
selbstverständlich wieder heraus.

## Positioning

Weiterentwicklung des eingestellten Originals von 11cafe (seit 16.04.2025 nicht mehr gepflegt), seit 07/2026
eigenständig als `breiti35/comfyui-workspace-manager`. Unterschied zu Einzelwerkzeugen (LoRA Manager,
ComfyUI-Gallery u. a.): Modelle inkl. Civitai/CivArchive, Galerie mit Live-Vorschau, Prompt-Bibliothek und
Workflow-Liste in einem Panel, gehärtet für den Betrieb auf öffentlich erreichbaren RunPod-Instanzen.
*(Abgeleitet aus `Änderungsübersicht.md`, nicht eigens bestätigt.)*

## Operating Context

- Läuft als Overlay/Panel über dem dunklen ComfyUI-Knoteneditor; Einstieg über die Plugin-Topbar.
- Desktop mit Maus und Tastatur, vom Laptop bis zum Großbildschirm. Touch/Tablet ist kein Ziel.
- Lokal und auf RunPod (Netzwerklatenz, große Modellbestände auf dem Volume).
- ComfyUI-Themes wechseln; das Panel muss in allen funktionieren.

## Capabilities and Constraints

Bereiche: Models-Panel (Reiter Liste und Installation, Karten, Detailansicht mit Trigger-Words), Install/Entdecken
(Civitai-Suche, Sortierung, Basismodell-Filter, Pagination, Custom-URL), Galerie (Bilder und Videos, gespeichert/live,
Live-Vorschau, Parameter-Panel), Prompt-Bibliothek (Rezepte), Workflow-Liste (Ordner, Tags, Mehrfachauswahl,
Versionen), Einstellungen, Topbar mit app-weiter Download-Anzeige.

Laufender Auftrag (10/2026): Aussehen, Menüführung und Bedienung überarbeiten. Bereiche sind einzeln entstanden;
gesucht ist eine durchgehende Menüführung und einheitliche Bedienlogik. Wo etwas liegt, darf sich ändern.

Feste Grenzen:
- Funktionen, Datenhaltung und Backend bleiben unverändert; jede heutige Aktion bleibt erreichbar.
- Änderungen nur in `ui/src`, nie in `dist/` (entsteht per Build, wird getrennt committet).
- Stack: React 18, Chakra UI 2, Tabler Icons, Dexie (IndexedDB), Vite.
- Alle Texte über `ui/src/i18n/` (DE und EN, Standard EN); keine festen Texte. Deutsche Texte sind länger.
- Navigation technisch als Stack (`openRoute`/`closeRoute`/`resetRoutes`, `routeStack.ts`): Schließen führt zur
  vorherigen Ansicht; Suche, Filter und Scrollposition bleiben erhalten.
- Galerie und Models-Grid sind virtualisiert bzw. gefenstert und laden lazy: Karten brauchen vorhersehbare Größen,
  keine teuren Effekte pro Karte (Glas-Unschärfe, aufwendige Animationen).
- Erhalten bleiben: NSFW-Blur, Download-Anzeige, Trigger-Word-Tags, Fortschrittsanzeigen.
- Test am laufenden ComfyUI (Port 8189); Commit erst nach Freigabe, je Bereich ein Quellcode- und ein dist-Commit.

Offen (später, Design lässt Platz): Favoriten/Bewertung, Galerie-Mehrfachauswahl und Bulk-Aktionen, Galerie-Suche
über Metadaten, Modell-Notizen, Recipe-System. Die Workflow-Liste mit reicheren Karten (Fahrplan Nr. 9) gehört
in das Redesign.

## Brand Commitments

- Farben, Schrift und Flächen werden aus den ComfyUI-CSS-Variablen abgeleitet, damit alle Themes funktionieren.
- Struktur, Abstände und Hierarchie bekommen einen eigenen, einheitlichen Stil.
- Das Panel muss neben dem dunklen Knoteneditor bestehen und wie eine Bibliothek wirken; Dichte ist erwünscht,
  wenn sie klar gegliedert ist.
- Anti-Referenz: das bisherige Aussehen. Davon wird nichts übernommen.

## Evidence on Hand

- Funktions- und Verlaufsübersicht: `Änderungsübersicht.md`; Übergabe: `docs/UEBERGABE.md`.
- Fahrplan und Specs: `docs/superpowers/` (Modernisierungs-Fahrplan, Specs zu Models-Panel, Install-Panel,
  Pagination, Settings).
- Echte Inhalte liefert die laufende Instanz (Port 8189): Modelle, Civitai-Daten, Galerie-Medien.

## Product Principles

1. Rein und wieder raus: Jeder Bereich ist in einem Schritt erreichbar, und Schließen führt immer dorthin zurück,
   wo man herkam – mit erhaltenem Zustand.
2. Eine Bedienlogik für alle Bereiche: Suchen, Filtern, Ansehen, Handeln funktioniert überall gleich.
3. Wiederfinden vor Präsentieren: Bestände sind durchsuchbar und scanbar; Dichte ist Mittel, nicht Ausrede.
4. Gast im Editor: Das Panel ordnet sich ComfyUI und seinen Themes unter und kostet keine Leistung.
5. Für Einsteiger lesbar, für Vielnutzer schnell (Tastatur, kurze Wege).

## Accessibility & Inclusion

Solide Grundlage ohne formale Norm: volle Tastaturbedienung, sichtbarer Fokus, ausreichende Kontraste in allen
ComfyUI-Themes, `prefers-reduced-motion` respektieren. Layout trägt längere deutsche Texte.
