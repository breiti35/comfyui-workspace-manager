---
version: 1
slug: "ui-src"
primary_target: "ui/src"
related_targets: []
---

# Surface: Bibliothek (Workspace-Manager-Panel)

Modus: Operate. Gilt für das ganze Panel in `ui/src` (Topbar, Bibliotheksfenster, angedockte Leiste, alle Bereiche).
Navigation und Bereichs-Logik: `docs/superpowers/specs/2026-10-18-navigation-redesign-brief.md` (freigegeben 18.10.2026:
Fenster bis ~1440 px / 90 vh, Zustand bleibt nach ✕ bis zum Neuladen, eigenes einstellbares Kürzel für die Bibliothek).
Gewählte Skizze: `.impeccable/mocks/decision/kartei-warm.html` (Komposition, Dichte, Farbrollen).

Erster Durchgang: Rahmen (Topbar-Gruppen, Fenster mit Schrank-Seitenleiste, Stack, Andocken) + Bereich Modelle
(Installiert + Entdecken) im neuen Stil; übrige Bereiche zunächst mit altem Inhalt im neuen Rahmen.

## Direction contract

THESIS: Der Workspace Manager als Zettelkatalog: die Seitenleiste ist der Schubladenschrank mit Reitern, jeder Eintrag
(Modell, Medium, Rezept, Workflow) eine Karteikarte mit Signaturzeile. Verweigert wird das Kategorie-Default: dunkles
Civitai-artiges Dashboard mit runden Glanzkarten, Reitern oben und einem Blau auf Grau.

OWN-WORLD: Warmes Steingrau, folgt dem ComfyUI-Theme. Hell: Grund #e9e6e1, Karten #f7f5f2, Schrank #dedad3, Linien
#cfc9c0/#ddd8d0, Text #24211e/#6b655d/#5a544c. Dunkel: dieselben Rollen als warmes Dunkel, abgeleitet aus ComfyUI-
Variablen per color-mix mit Warmton. Bernstein #c77a12 (Text hell #8a4f00) = aktiver Reiter, Hauptaktion, Fortschritt;
Ocker #e8c27a = Laschen, Filter-Chips. Radius 2px, 1-px-Linien, Signatur Monospace 11px gesperrt, Titel 40px fett,
ComfyUI-Schrift, Tabellenziffern. Keine Unschärfe, kein Papier-Look.

STORY: Aus der Topbar öffnet man die Bibliothek, liest am Reiter, wo man ist, sucht und filtert in der Werkzeugzeile,
erkennt an der Signatur, was eine Karte ist, öffnet die Detailkarte und kommt mit Esc zurück, Zustand erhalten.

FIRST VIEWPORT: Topbar 42px warm-dunkel, links Workflow-Gruppe (Name + Ungespeichert-Punkt, Speichern, Version, Menü,
Galerie), rechts Bibliothek (aktiv Bernstein), Download-Ring, Andocken, Einstellungen. Fenster zentriert, Abdunklung
ohne Unschärfe. Links Schrank 240px: Gruppen ARBEIT/MODELLE/SYSTEM als Schubladenbeschriftung, Zeilen 34px mit Lasche
links und Zahl rechts; aktiv = breite Bernstein-Lasche auf heller Fläche. Rechts Findbuch-Kopf (Titel, Bestandszeile,
Hauptaktion rechts, ✕), Werkzeugzeile (Suche, Typ-Chips, Basismodell, Sortierung, Ansicht), Raster fester Karten
(Signatur / Name / Vorschau / Meta), Fuß in Monospace.
Signaturbewegung: Beim Bereichswechsel schiebt sich die Lasche heraus (8→16px, ~120ms); Detail öffnet als
aufgeschlagene Karteikarte mit derselben Signaturzeile groß. prefers-reduced-motion schaltet die Bewegung ab.

FORM: Karteikatalog, Platz 1 meiner Liste (als hell-warme Variante gewählt). seed:bc1c9d2bda7a9e8a

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Offen
- Genaue Warmton-Ableitung für das dunkle Theme (color-mix-Anteile) beim Bau festlegen und an hell/dunkel prüfen.
- Angedockte Leiste: gelöst als Schrank-Spalte (Symbole, Bernstein-Lasche), siehe DESIGN.md "Dock-Modus".
