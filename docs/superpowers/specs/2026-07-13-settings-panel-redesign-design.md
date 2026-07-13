# Settings-Panel-Umbau (WorkspaceSettingsModal)

**Datum:** 2026-07-13
**Status:** Design freigegeben, bereit zur Umsetzungsplanung
**Kontext:** Teil des laufenden UI-Overhauls (siehe Projektgedächtnis
`comfyui-workspace-manager-overhaul`). Folgt auf das fertige
Install-Models-Panel.

## Ziel

Das Settings-Panel (`WorkspaceSettingsModal`) von einer flachen, mit
Trennlinien gestapelten Default-Chakra-Liste zu einem übersichtlichen,
nach **Nutzen** gruppierten Panel im **Hausstil** umbauen — mit guter
Einstellungssteuerung (Toggle-Switches, Live-Übernahme) und dem
Civitai-API-Key, der aus dem ⋯-Menü des Install-Panels hierher zieht.

## Warum (Ist-Zustand / Probleme)

- Flache `VStack` mit `StackDivider` — langer Scroll, keine Hierarchie,
  kein Hausstil (Default-Chakra-Look, `WorkspaceSettingsModal.tsx`).
- Jede Änderung wirft einen aufdringlichen Toast **„Please refresh to see
  the changes."** (`CommonCheckboxSettings.tsx`) — obwohl es inzwischen
  Live-Update-Muster (Events) gibt.
- Nackte Checkboxen statt Toggle-Switches.
- Der **Civitai-API-Key** liegt im ⋯-Menü des Install-Panels
  (`AddApiKeyPopover`, localStorage via `setCivitApiKey`), nicht in den
  Einstellungen.
- **NSFW/Adult-Logik ist gekoppelt und dadurch teils sinnlos:** Der
  Toolbar-`NsfwToggleButton` schaltet aktuell `civitaiIncludeAdultContent`
  (Host) UND `showNsfwModelThumbnail` (Blur) gemeinsam. Folge: Adult aus →
  18+-Modelle verschwinden ganz (Host filtert) → nichts zu verblurren;
  Adult an → Blur gleich mit aus → auch nichts verblurrt. Der Blur hat so
  **keine Sinnhaftigkeit**.

## Getroffene Entscheidungen

- **Layout:** gruppierte Karten auf **einer** Seite (kein Zwei-Spalten-Nav,
  keine Tabs) — passend zur kleinen Settings-Menge.
- **NSFW-Logik entkoppeln:** zwei getrennte Schalter — „Adult-Inhalte (18+)"
  (Host) und „NSFW-Vorschau anzeigen" (Blur, **Standard: verblurrt**). Damit
  wird ein sinnvoller dritter Zustand möglich: Adult-Inhalte da, aber
  Vorschau verblurrt (per Klick/Setting aufdecken).
- **Toolbar-Button-Konsequenz:** `NsfwToggleButton` schaltet künftig **nur**
  den Host (`civitaiIncludeAdultContent`), nicht mehr den Blur.

## Architektur / Komponenten

### Chrome & Layout
`WorkspaceSettingsModal` neu aufgebaut: etwas breiteres Modal, Kopfzeile in
`galleryPanelBg`, **getönt-roter Schließen-Button** (identisch zu
Gallery/Models/Install: `size="md"`, `border red.400`, `bg
rgba(245,101,101,0.14)`), Body scrollt mit `hideScrollbarSx`. Inhalt =
gruppierte **Karten** (`galleryPanelBg`/`rowBorderColor`-Rahmen,
`borderRadius`), eine Spalte. Blau als einziger heller Leitakzent.

### Gemeinsame Bausteine (neu/angepasst)
- **`SettingsSection`** (vorhanden) → zu einer **Karte** mit Titel-Label im
  Hausstil umbauen (statt bloßer Überschrift + Divider).
- **`CommonToggleSetting`** (neu, ersetzt Checkbox-Nutzung): Chakra `Switch`
  (blau) + Label + optionaler Hilfetext + optionaler Warn-Hinweis; schreibt
  `userSettingsTable.upsert({ [key]: value })`, **kein** „please
  refresh"-Toast — stattdessen dezente „Gespeichert"-Rückmeldung. Optionales
  `isDisabled` (für abhängige Toggles) und `note` („wirkt nach Neuladen").
  `CommonCheckboxSettings` wird davon abgelöst (bzw. intern umgestellt).
- **`CommonNumberSetting`** (vorhanden): Rückmeldung analog entschärfen
  (kein „please refresh"-Toast).

### Gruppen (Reihenfolge = nach Nutzen)
1. **Civitai**
   - Toggle „Adult-Inhalte (18+)" → `civitaiIncludeAdultContent`. Erklärtext
     (civitai.red vs .com). Beim Umschalten Event `civitaiIncludeAdultContent`
     feuern (Install-Panel lädt neu — Verhalten existiert bereits).
   - Toggle „NSFW-Vorschau anzeigen" → `showNsfwModelThumbnail` (an =
     unverblurrt; Standard aus = verblurrt). **`isDisabled`, wenn Adult aus**
     (Blur ohne Adult sinnlos). Beim Umschalten `showNsfwModelThumbnail`-Event
     feuern (Karten re-lesen Blur — existiert bereits).
   - **Civitai-API-Key**: maskiertes Input + „Speichern" + „Löschen".
     Speicherung via bestehendem `setCivitApiKey`/`getCivitApiKey`
     (localStorage) — **keine** Migration. Zeigt maskiert an, ob ein Key
     gesetzt ist.
2. **Speicher & Sync**
   - „My Workflows"-Verzeichnis (`SelectMyWorkflowsDir`, im Hausstil).
3. **Anzeige**
   - Toggle „Ordner immer oben" (`foldersOnTop`).
   - Toggle „Thumbnails in Workflow-Liste ausblenden" (`hideCoverImage`).
4. **Speichern**
   - Zahl „Max. gespeicherte Änderungs-Historie" (`maximumChangelogNumber`).
   - Toggle „‚Speichern/Verwerfen'-Warnung deaktivieren"
     (`disableUnsavedWarning`) mit dezentem Warn-Hinweis.
5. **Tastenkürzel**
   - `ShortcutSettings` (3 Shortcuts, im Hausstil).
6. **Erweitert** *(de-emphasized, unten, eingeklappt/`Accordion` o. ä.)*
   - Zwei-Wege-Sync (`TwoWaySyncSettings`) inkl. seines Legacy-Warnhinweises —
     bewusst nach unten und zugeklappt (gefährlich/Legacy).

### Toolbar-NSFW-Button (`NsfwToggleButton.tsx`)
Zurückbauen auf **nur Host**: `upsert({ civitaiIncludeAdultContent: next })`,
Event `civitaiIncludeAdultContent` feuern. Die
`showNsfwModelThumbnail`-Kopplung und deren Event-Dispatch **entfernen**.
`checked` liest weiterhin `civitaiIncludeAdultContent`. Der Blur wird
ausschließlich im Settings-Panel gesteuert. (Der Button steckt auch in der
Models-Panel-Toolbar — dieselbe, nun korrekte Bedeutung.)

## Verhalten / Datenfluss

- Settings schreiben sofort über `userSettingsTable.upsert` (serverseitig via
  `/workspace/save_settings`). Kein blanket „please refresh"-Toast mehr;
  dezente „Gespeichert"-Rückmeldung.
- **Live-Wirkung:** Civitai-Toggles wirken sofort (Events + reagierende
  Panels). Einstellungen, die ihre Konsumenten nur beim Mount lesen und
  wirklich erst nach Neuladen greifen, bekommen einen **inline** Hinweis
  „wirkt nach Neuladen" (nur dort, wo zutreffend) — statt eines Toasts bei
  jeder Änderung.
- API-Key: `getCivitApiKey()` beim Öffnen lesen (maskiert anzeigen),
  „Speichern" ruft `setCivitApiKey(value)`, „Löschen" setzt leer.

## Bewusst nicht dabei (YAGNI)

- Keine neuen Settings erfinden.
- Keine Migration des API-Keys nach `userSettings` (bleibt localStorage).
- Keine Zwei-Spalten-/Tab-Navigation.
- Keine Umgestaltung nicht betroffener Settings-Konsumenten.

## Constraints (aus Projektgedächtnis)

- Produktion (Port 8188, `G:\ComfyUI`) nicht anfassen; Verifikation in
  Testumgebung Port 8189.
- Commit-Konvention: Source-Commit + separater `dist`-Rebuild-Commit
  (`npm run build` in `ui/`).
- Ablauf: bauen → Screenshots zeigen → erst auf explizites „OK" des Users
  committen/aufräumen; Testserver nicht sofort stoppen.
- **Kein Unit-Test-Framework**: Verifikations-Gate ist `npm run build`;
  visuelle Prüfung mit Chrome DevTools auf 8189.

## Offen / separat (nicht Teil dieser Spec)

- **Erster Absturz des Model-Installers** vom User gemeldet — Details folgen;
  separater Bug, via `systematic-debugging` anzugehen, sobald die
  Fehlerinfos vorliegen.

## Wiederverwendete Bausteine

Semantische Tokens (`galleryPanelBg`, `rowBorderColor`, …), `hideScrollbarSx`,
getönt-roter Schließen-Button-Stil, `userSettingsTable`,
`setCivitApiKey`/`getCivitApiKey`, `SelectMyWorkflowsDir`, `ShortcutSettings`,
`TwoWaySyncSettings`, `CommonNumberSetting`.
