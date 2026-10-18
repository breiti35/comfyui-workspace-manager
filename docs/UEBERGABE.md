# Übergabe – Workspace-Manager

## Hier weitermachen (Stand 2026-10-18)

**Release:** `v2.0.0` auf GitHub (`main` = `f618984`). Enthält Models-Panel, Basismodell-Suche
(live aus Civitai `/api/v1/enums`), Pfadschutz aller Datei-Routen, robuste Downloads, Modellliste
per HTTP statt nur WebSocket. Tests: 137 Backend + 142 Frontend grün (`pwsh scripts/run_tests.ps1`).

**Runpod-Images** (Repos bearbeitet eine eigene Claude-Instanz):
| Image | Repo | Manager |
|---|---|---|
| `breiti185261/comfyui-minimax-h3:v11` | `G:\Entwicklungsordnung\runpod` | `ARG WORKSPACE_MANAGER_REF=v2.0.0` |
| `ghcr.io/breiti35/comfyui-krea2:v5` | `G:\Entwicklungsordnung\runpod-krea2` | dto., eigene Schicht |

Beide `start.sh`: `is_default: true` in extra_model_paths, `WORKSPACE_MANAGER_HASH_DIR` und
`WORKSPACE_MANAGER_MODEL_ROOT` aufs Volume. `WORKSPACE_MANAGER_BROWSE_ROOTS` bewusst NICHT gesetzt.

**Offen**
1. Pod-Test durch den User: `git describe --tags` = v2.0.0, Modell-Panel vollständig, LoRA landet
   unter `/workspace/ComfyUI/models/loras`, nach Neustart kein Re-Hash. Bei Fehler: Log
   `/workspace/comfyui_<pod-id>_nohup.log` → Fix als `v2.0.1`.
2. Lokal in ComfyUI (Port 8189) noch nicht angesehen – UI-Review steht aus.
3. Bekannte Restpunkte: `.zip` als Download-Endung abgelehnt (bei Bedarf freigeben);
   `/workspace/get_settings` liefert den Civitai-Key an jeden mit Pod-URL (ComfyUI hat keine Auth);
   `ui/src/components/Overlay.tsx` unbenutzt.
4. Fahrplan offen (`docs/superpowers/2026-07-14-modernization-roadmap.md`): Nr. 4 Galerie-Suche/
   Favoriten, 6 Modell-Notizen, 7 Galerie-Mehrfachauswahl, 9 Workflow-Karten, 13 Recipe-System.

**Manager-Update ausrollen:** neues Tag (v2.0.x) pushen → in beiden Dockerfiles
`WORKSPACE_MANAGER_REF` anheben → Image-Tags pushen (Actions bauen). Ohne ARG-Änderung nimmt der
Registry-Cache den alten Klon!
