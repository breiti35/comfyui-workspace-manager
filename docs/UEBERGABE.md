# Übergabe – Workspace-Manager

## Hier weitermachen (Stand 2026-10-24, alles gepusht)

**UI-Redesign Schritte 1–7 fertig** (Brief `docs/superpowers/specs/2026-10-18-navigation-redesign-brief.md`,
Richtung `.impeccable/surfaces/ui-src.md`, `DESIGN.md`): Bibliotheksfenster mit Schrank-Seitenleiste, alle Bereiche im
Karteistil, Kompaktleiste im Dock (`ui/src/library/compact/`), Dock-Bereiche in den Einstellungen wählbar (`dockSections`).
README neu (DE + kurzer EN-Teil, Screenshots `docs/images/`).

**Topbar-Einhängen (v2.1.1):** `ui/src/topbar/Topbar.tsx` hängt sich über `app.menu.settingsGroup.element.before(...)`
ein – wie Crystools/ComfyUI-Manager, stabil über Frontend-Updates. Fallback: alter Selektor `.actionbar …`, dann
schwebende Leiste. Geprüft mit Frontend 1.45.20 und 1.55.18.

**Offene Review-Punkte:** Hell-Theme-Werte (nur gerechnet), Kürzel für die Bibliothek, farbiger border-left >1px im
alten Inhalt (WorkflowListItem, ModelDetailView, InstallDetailView, GallerySidebar), Fokus-Trap im Fenster, Kartentitel
einzeilig abgeschnitten, Workflows-Screenshot fehlt in der README.

**Test:** `G:\Weiterentwicklung\ComfyUI` → `venv/Scripts/python.exe main.py --port 8189 --cpu` (Frontend 1.45); mit
`--front-end-root "G:/ComfyUI/venv_windows/Lib/site-packages/comfyui_frontend_package/static"` gegen 1.55. Chrome-
Erweiterung war zuletzt nicht verbunden → puppeteer-core im Scratchpad. Keine Frontend-Tests per `npm test`;
`pwsh scripts/run_tests.ps1` für alles.

**Produktiv-Installation des Users:** `G:\ComfyUI\custom_nodes\comfyui-workspace-manager` (Git-Klon des Forks, Frontend 1.55).
Update dort: `git pull origin main`, ComfyUI neu starten, Strg+F5. Dort liegt ein Stash „vor Redesign-Update 2026-10-21“
(alte untracked Dateien) und ein Altordner `comfyui-workspace-manager-main` (vermutlich ZIP-Rest, nicht angefasst).

## Release-Stand

**Release:** `v2.1.1` auf GitHub (`main` = `d07a2ff`). `v2.1.0` = Redesign, `v2.1.1` = Topbar über `app.menu`.
`upstream` (11cafe) nie pushen, nur `origin` (breiti35).

**Runpod-Images** (Repos, Dockerfiles und **Docker-Builds** macht ausschließlich die Runpod-Instanz – hier nicht bauen,
pushen oder abbrechen; GitHub-Actions-Minuten sind aufgebraucht, daher baut sie lokal):
| Image | Repo | Manager |
|---|---|---|
| `breiti185261/comfyui-minimax-h3` (Git-Tag `v13`) | `G:\Entwicklungsordnung
unpod` | `ARG WORKSPACE_MANAGER_REF=v2.1.0`, Auftrag für `v2.1.1` übergeben |
| `ghcr.io/breiti35/comfyui-krea2` (Git-Tag `v6`) | `G:\Entwicklungsordnung
unpod-krea2` | dto. |

Beide `start.sh`: `is_default: true` in extra_model_paths, `WORKSPACE_MANAGER_HASH_DIR` und
`WORKSPACE_MANAGER_MODEL_ROOT` aufs Volume. `WORKSPACE_MANAGER_BROWSE_ROOTS` bewusst NICHT gesetzt.

**Offen**
1. Pod-Test durch den User: `git describe --tags` = v2.1.1, Topbar in der Aktionsleiste, Modell-Panel vollständig, LoRA landet
   unter `/workspace/ComfyUI/models/loras`, nach Neustart kein Re-Hash. Bei Fehler: Log
   `/workspace/comfyui_<pod-id>_nohup.log` → Fix als `v2.1.2`.
2. Bekannte Restpunkte: `.zip` als Download-Endung abgelehnt (bei Bedarf freigeben);
   `/workspace/get_settings` liefert den Civitai-Key an jeden mit Pod-URL (ComfyUI hat keine Auth);
   `ui/src/components/Overlay.tsx` unbenutzt.
3. Fahrplan offen (`docs/superpowers/2026-07-14-modernization-roadmap.md`): Nr. 4 Galerie-Suche/
   Favoriten, 6 Modell-Notizen, 7 Galerie-Mehrfachauswahl, 13 Recipe-System.

**Manager-Update ausrollen:** neues Tag (v2.1.x) pushen → in beiden Dockerfiles
`WORKSPACE_MANAGER_REF` anheben → Image bauen/pushen (macht die Runpod-Instanz lokal). Ohne ARG-Änderung nimmt der
Registry-Cache den alten Klon!
