# Modernisierungs-Fahrplan (comfyui-workspace-manager)

**Stand:** 2026-07-14. Reihenfolge: erst schnelle Grundlagen, dann Flagship-Features,
dann Mittelgroßes, zuletzt der große Brocken. Nummerierung = geplante Reihenfolge.

## Reihenfolge

1. **`.gitattributes` anlegen** *(Hygiene, ~1 Min)*
   - `* text=auto eol=lf` → beendet die CRLF-Warnungen bei jedem Commit. Zuerst,
     damit alle folgenden Commits sauber sind.

2. **Sprach-Wechselschalter DE/EN (i18n)** — *statt reinem Eindeutschen; Default EN.* ✅ **fertig**
   - ✅ Fundament (`ui/src/i18n/`), Schalter im Settings-Panel, live per Event.
   - ✅ Abgedeckt: Settings, Gallery, Install, Models (~150 Keys, DE+EN).
   - ✅ Plugin-Topbar, RecentFilesDrawer (Liste/Menüs/Tags/Mehrfachauswahl),
     tiefe Dialoge (Ordner-Picker, TwoWaySync, `App.tsx` Discard) — +72 Keys.
   - ✅ Letzten `confirm()` (`App.tsx` Discard) auf Hausstil-Dialog gehoben.
   - ✅ Architektur-Fix: `LanguageProvider` in `main.tsx` hochgezogen (über
     `AlertDialogProvider`), damit App-Ebene + Portal-Dialoge die Sprache lesen.
   - Rest-Notiz (offen, klein): kosmetischer Ein-Frame-Flash im Settings-Panel
     (`adultOn` async); reine `.ts`-Dateien ohne Hook-Zugriff bleiben englisch.

3. **Trigger-Words auf der Modell-Detailseite** *(Flagship, hoher Nutzen)* ✅ **fertig**
   - Civitai `trainedWords` am Modell werden in BEIDEN Detailansichten
     (`ModelDetailView.tsx` + `InstallDetailView.tsx`) als anklickbare Tags
     mit Ein-Klick-Kopieren (`IconCopy` + Toast) angezeigt. War bereits beim
     Bau der Panels miterledigt. Killer-Feature des LoRA Managers ✓.

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

10. **CivArchive-Fallback für gelöschte Modelle** ✅ **fertig**
    - Button „Auf CivArchive suchen" im „Nicht-auf-Civitai"-Fallback (öffnet
      `civitaiarchive.com/sha256/<SHA256>`). **Plus:** leere Karten gelöschter
      Modelle werden mit dem Archiv-Vorschaubild gefüllt — Backend-Route
      `/model_manager/civarchive_by_hash` (`service/model_manager/civarchive.py`)
      liest `meta.image` + Modellinfos aus CivArchives `__NEXT_DATA__`,
      plattformübergreifend (CivitAI/HuggingFace/…), gecacht. Frontend:
      `fetchCivArchiveByHash` in `civitUtils.ts`, genutzt in `ModelItem` +
      `ModelDetailView`.

11. **Download beschleunigen** ✅ **fertig** *(vom User gewünscht)*
    - Segmentierter Multi-Connection-Download (6 Range-Segmente parallel, mit
      Range-Erkennung + Einzel-Stream-Fallback), Chunk-Größe 1 KB → 1 MB.
      Wichtig: finale URL OHNE Range auflösen (HF-CDN signiert sonst auf den
      Range). Fortschritt zeigt jetzt Tempo (MB/s) + ETA, auch in der
      Detailansicht. Alles in `service/model_manager/model_installer.py` +
      Install-Frontend.

12. **Prompt-Bibliothek** ✅ **fertig** *(vom User gewünscht)*
    - Eigenes Topbar-Panel (`ui/src/prompt-library/`): Prompts als „Rezept"
      speichern (Positiv/Negativ + Modell, LoRAs, Sampler/Steps/CFG/Seed/Größe),
      mit Suche, Tags, Bearbeiten/Löschen. Gespeichert wird aus den
      Erstellungsdaten eines Bildes/Previews (Button in `GalleryParams`) oder
      manuell. Persistenz serverseitig als `db/prompts.json` über die
      bestehenden `save_db`/`get_db`-Routen — **kein neuer Backend-Code**;
      `db/` ist gitignoriert (reine Nutzerdaten).

13. **Recipe-System** *(groß, zuletzt)*
    - Aus einem Civitai-Bild alle LoRAs + Gewichte ziehen und als wiederverwendbares
      Rezept speichern/anwenden. Baut auf der Prompt-Bibliothek (12) auf, die das
      Rezept-Datenmodell und die Panel-Fläche schon mitbringt.

## Hinweise
- Vorbilder der Feature-Ideen: LoRA Manager (`willmiao/ComfyUI-Lora-Manager`),
  `PanicTitan/ComfyUI-Gallery`, `biagiomaf/smart-comfyui-gallery`.
- Arbeitsweise: leichtgewichtig/direkt; pro Punkt bauen → auf 8189 zeigen →
  erst auf OK committen (Source-Commit + separater `dist`-Rebuild).
