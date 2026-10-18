# Brief: Menüführung und Navigation (Redesign 10/2026)

Status: **Entwurf zur Freigabe** · Grundlage: `PRODUCT.md` · Modus: Operate (Werkzeug neben dem Knoteneditor)

## 1. Auftrag und Nutzer
Wer ComfyUI mit dem Fork nutzt, öffnet die Erweiterung zwischendurch, holt etwas und will zurück an den Graphen.
Heute öffnet jeder Bereich anders (Workflows als Drawer, Modelle als Overlay mit Reitern, Galerie als 90-%-Modal,
Prompts/Einstellungen als Modals, Schnellsuche nur per Strg+P), und Knöpfe stehen gemischt in der Topbar.
Ziel: **ein Ort, eine Bedienlogik, ein Weg hinein und hinaus.**

## 2. Erfolg
Jede typische Aufgabe aus `PRODUCT.md` beginnt mit höchstens einem Klick aus der Topbar, und Esc führt immer
genau eine Ebene zurück, bis der Canvas wieder frei ist. Keine heutige Aktion geht verloren (Inventar: Abschnitt 8).

## 3. Leitidee
**Eine Bibliothek, zwei Darstellungen.**
- *Bibliotheksfenster* (Overlay, groß) zum Stöbern, Suchen, Ordnen.
- *Angedockte Leiste* (rechts, ohne Abdunkeln, Canvas bleibt bedienbar) für die Arbeit neben dem Graphen.
Beide zeigen dieselben Bereiche mit derselben Logik; der Wechsel behält Bereich und Zustand.

## 4. Topbar: zwei Gruppen
| Gruppe | Inhalt |
|---|---|
| **Aktueller Workflow** (links) | Workflow-Name (bearbeitbar, Ungespeichert-Punkt, Schloss), Speichern, Versionsname, Menü ▾ (Neu, Speichern unter, Zurücksetzen, Versionen, Exportieren …), **Galerie dieses Workflows** |
| **Bibliothek** (rechts) | Knopf „Bibliothek“ mit Text (öffnet den zuletzt genutzten Bereich), Download-Anzeige (Ring + Anzahl, Popover wie heute), Andocken-Schalter, Einstellungen |
- Die Galerie gehört zur Workflow-Gruppe, weil sie fachlich je Workflow ist (`listByWorkflowID`).
- Die Topbar bleibt verschiebbar (Griff) und ComfyUI-hoch (42 px).

## 5. Bibliotheksfenster
**Seitenleiste** (fest, mit Anzahl je Bereich; bei schmalem Fenster nur Symbole):
- *Arbeit:* Workflows · Galerie · Prompts
- *Modelle:* Installiert · Entdecken (Civitai)
- *System:* Downloads · Einstellungen

**Gleiche Anatomie in jedem Bereich:**
1. Kopf: Bereichstitel, ggf. Kontext (z. B. Workflow-Name bei Galerie), eine Hauptaktion rechts
   („Neuer Workflow“, „Rezept anlegen“, „Eigene URL“ …).
2. Werkzeugzeile: Suche · Filter · Sortierung · Ansicht (Raster/Liste) – immer in dieser Reihenfolge.
3. **Reservierte Auswahlzeile** (erscheint erst bei Mehrfachauswahl; Platz für spätere Bulk-Aktionen).
4. Inhalt: Raster oder Liste mit festen Kartengrößen (Virtualisierung bleibt).
5. Fuß: Anzahl, Pagination (Entdecken), Status.

**Detailansicht:** Klick auf Karte öffnet die Detailseite im selben Bereich (Brotkrumen „Modelle › Name“,
Zurück, Vor/Zurück-Pfeile durch die Liste). Gilt einheitlich für Modell, Civitai-Modell, Medium (mit
Parameter-Panel und „Als Rezept speichern“), Rezept und Workflow.

**Galerie ohne geladenen Workflow:** leerer Zustand mit Erklärung und Sprung zu „Workflows“.
**Unterbereiche:** Galerie „Gespeichert / Live“ und Entdecken-Reiter (LoRA, LoCon/DoRA …) als Segmentschalter
in der Werkzeugzeile, nicht als zweite Navigation.

**Workflows (Fahrplan Nr. 9):** reichere Karten mit Vorschaubild (jüngstes Medium des Workflows), Name, Ordner,
Tags, zuletzt geändert; Ordner und „Zuletzt“ als Filter in der Werkzeugzeile; Liste als dichte Alternative.
Strg+P bleibt die Workflow-Schnellsuche und wird in der Workflows-Werkzeugzeile sichtbar angeboten.

## 6. Angedockte Leiste (Kompaktmodus)
Bereiche: **Live-Vorschau · Modelle (Trigger-Words) · Prompts · Downloads**, als Reiter oben in der Leiste.
- Zeilen statt großer Karten; Trigger-Words und Prompt mit Ein-Klick-Kopieren direkt in der Zeile.
- Live: jüngste Ausgabe groß, Parameter darunter.
- „In Bibliothek öffnen“ an jedem Eintrag führt ins Fenster, direkt zur Detailseite.
- Leistenbreite verstellbar; Zustand bleibt beim Umschalten erhalten.

## 7. Navigation, Stack und Tastatur
| Handlung | Wirkung im Stack |
|---|---|
| Bereich in der Seitenleiste wechseln | ersetzt (Geschwister, wie heute Liste/Installation) – kein Stapelwachstum |
| Karte → Detail, Dialog öffnen | `openRoute` (legt eine Ebene auf) |
| Esc / Zurück | `closeRoute` – genau eine Ebene; Suche, Filter, Scrollposition bleiben |
| ✕ im Fensterkopf | `resetRoutes` – Bibliothek ganz zu |
| Andocken / Abdocken | wechselt die Darstellung, Stack bleibt |
- Fokus kehrt beim Schließen zum auslösenden Element zurück; Seitenleiste und Raster per Pfeiltasten bedienbar.
- Sichtbarer Fokus, Tooltips nur als Ergänzung zu Beschriftungen (Hauptknöpfe tragen Text).

## 8. Grenzen
- Keine Änderung an Backend, Datenhaltung, Funktionen. Neu sind nur Routen-Namen/Geschwistergruppen und
  Darstellung im Frontend (`ui/src`).
- Aktionsinventar vor der Umsetzung je Bereich abhaken (Topbar-Menü, Rechtsklick-Menüs, Karten-Aktionen,
  Einstellungen), damit nichts verschwindet.
- Erhalten: NSFW-Blur, Download-Anzeige, Trigger-Word-Tags, Fortschritt auf Karten, Live-Vorschau bei
  geschlossenem Fenster.
- Texte über `i18n` (DE/EN); deutsche Beschriftungen dürfen nicht abschneiden (Seitenleiste, Knöpfe).
- Keine teuren Effekte pro Karte; Overlay-Hintergrund ohne Unschärfe.
- Platz lassen für: Favoriten (Filter + Kartenaktion), Mehrfachauswahl (Auswahlzeile), Galerie-Metadatensuche.

## 9. Bewusst offen
- Größe des Fensters: fast Vollbild oder begrenzte Breite? (Vorschlag: bis ~1440 px, 90 vh.)
- Bleibt der Zustand nach ✕ bis zum Neuladen erhalten? (Vorschlag: ja, je Bereich.)
- Eigenes Tastenkürzel zum Öffnen der Bibliothek (Vorschlag: einstellbar wie Strg+P).
- Visuelle Welt (Farben aus ComfyUI-Variablen, Typografie, Flächen): nächster Schritt, eigene `DESIGN.md`.

## 10. Umsetzungsreihenfolge (je Schritt ein Quellcode- und ein dist-Commit)
1. Rahmen: Topbar-Gruppen, Bibliotheksfenster mit Seitenleiste, Stack-Anpassung, Andocken.
2. Modelle (Installiert + Entdecken) · 3. Galerie · 4. Prompts · 5. Workflows (reiche Karten) ·
6. Downloads + Einstellungen · 7. Kompaktleiste.
