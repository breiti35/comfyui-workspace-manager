# Modernisierungs-Fahrplan (comfyui-workspace-manager)

**Stand:** 2026-07-14. Reihenfolge: erst schnelle Grundlagen, dann Flagship-Features,
dann Mittelgroßes, zuletzt der große Brocken. Nummerierung = geplante Reihenfolge.

## Reihenfolge

1. **`.gitattributes` anlegen** *(Hygiene, ~1 Min)*
   - `* text=auto eol=lf` → beendet die CRLF-Warnungen bei jedem Commit. Zuerst,
     damit alle folgenden Commits sauber sind.

2. **Sprach-Wechselschalter DE/EN (i18n)** — *statt reinem Eindeutschen; Default EN.*
   - ✅ Fundament (`ui/src/i18n/`), Schalter im Settings-Panel, live per Event.
   - ✅ Abgedeckt: Settings, Gallery, Install, Models (~150 Keys, DE+EN).
   - 🔜 Offen: Plugin-Topbar (`ui/src/topbar/`), RecentFilesDrawer, tiefe Dialoge
     (Ordner-Picker-Modal, TwoWaySyncSettings, `App.tsx` Save/Discard) → dabei
     auch den letzten `confirm()` (`App.tsx`) auf den Hausstil-Dialog heben.
   - Nebenbei: kosmetischer Ein-Frame-Flash im Settings-Panel (`adultOn` async).

3. **Trigger-Words auf der Modell-Detailseite** *(Flagship, hoher Nutzen)*
   - Civitai `trainedWords` am Modell (Models/Install-Detail) anzeigen +
     Ein-Klick-Kopieren/Einfügen. Killer-Feature des LoRA Managers.

4. **Galerie-Suche über echte Metadaten + Favoriten/Bewertung**
   - Suche nach Prompt / Modell / LoRA (statt nur Dateiname + rohes JSON).
   - Favorit/Stern bzw. Bewertung je Bild, plus Filter darauf.

5. **Video/GIF im Galerie-Grid**
   - Aktuell nur Bilder; Video/GIF mit abspielbarer/vorschaubarer Kachel.

6. **Editierbare Modell-Notizen**
   - Freitext-Notiz je Modell (persistiert), im Detail sichtbar/bearbeitbar.

7. **Galerie: Mehrfachauswahl + Bulk-Aktionen**
   - Mehrere Bilder wählen → gemeinsam herunterladen/entfernen; evtl. Drag auf Canvas.

8. **Virtualisiertes Galerie-Grid** *(Performance)*
   - Windowing-Muster aus dem Models-Panel (`useInView`/IntersectionObserver)
     wiederverwenden; wichtig, sobald viele Outputs vorliegen.

9. **Workflow-Liste (RecentFilesDrawer) aufs reiche Karten-Muster heben**
   - Reichere Vorschau-Karten, bessere Ordner/Interaktion.

10. **CivArchive-Fallback für gelöschte Modelle** *(vom User gewünscht, klein)*
    - Wo Civitai nichts (mehr) findet (404 bei Hash-Lookup/Detail): Button
      „Auf CivArchive suchen" → öffnet `civitaiarchive.com/sha256/<SHA256>`
      im Browser. Kein API nötig. (Weitergehend später: HuggingFace-Direktlinks
      in „Eigene URL" einspeisen; Metadaten-Import via Backend.)

11. **Recipe-System** *(groß, zuletzt)*
    - Aus einem Civitai-Bild alle LoRAs + Gewichte ziehen und als wiederverwendbares
      Rezept speichern/anwenden.

## Hinweise
- Vorbilder der Feature-Ideen: LoRA Manager (`willmiao/ComfyUI-Lora-Manager`),
  `PanicTitan/ComfyUI-Gallery`, `biagiomaf/smart-comfyui-gallery`.
- Arbeitsweise: leichtgewichtig/direkt; pro Punkt bauen → auf 8189 zeigen →
  erst auf OK committen (Source-Commit + separater `dist`-Rebuild).
