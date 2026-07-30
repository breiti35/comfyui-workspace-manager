# Tests

Funktionstests für die selbst gebauten Erweiterungen dieses Forks
(Modell-Download, CivArchive-Fallback, Prompt-Bibliothek, Sprachumschalter,
API-Key-Persistenz).

**Es werden keine zusätzlichen Pakete benötigt.** `pytest` kommt aus der
ComfyUI-Python-Umgebung, der Frontend-Runner ist in Node ab Version 22
eingebaut (`node --test` inklusive TypeScript-Type-Stripping).

## Ausführen

```powershell
pwsh scripts/run_tests.ps1          # alles
pwsh scripts/run_tests.ps1 -Only be # nur Backend
pwsh scripts/run_tests.ps1 -Only fe # nur Frontend
```

Einzeln:

```powershell
# Backend – muss aus tests/ heraus laufen, siehe „Stolpersteine"
cd tests; python -m pytest -q

# Frontend
node --experimental-test-module-mocks --import ./tests/frontend/setup.mjs `
     --test tests/frontend/i18n.test.ts
```

## Was abgedeckt ist

### Backend (`pytest`, 26 Tests)

| Datei | Inhalt |
|---|---|
| `test_model_installer.py` | Der beschleunigte Download – **gegen einen echten lokalen HTTP-Server**, nicht gegen Mocks. Jeder Integritätstest vergleicht den SHA256 der geschriebenen Datei mit dem Original: 6 parallele Segmente, krumme Dateigrößen, Fallback auf Einzelstream ohne Range-Support, Redirect-Auflösung **ohne** Range-Header (die HuggingFace-Falle), unvollständige Segmente, HTML-Loginseite statt Datei, Abbruch, Tempo-/ETA-Felder im Fortschritt. |
| `test_civarchive.py` | Der CivArchive-Fallback: Parsen des `__NEXT_DATA__`-Payloads, Unterscheidung „nicht im Archiv" (`{}`) von „Fehler" (`None`), plattformübergreifende Quellen (CivitAI/HuggingFace), Route inkl. Hash-Normalisierung und Cache. |

### Frontend (`node --test`, 25 Tests)

| Datei | Inhalt |
|---|---|
| `i18n.test.ts` | Vollständigkeit des DE/EN-Wörterbuchs: kein Schlüssel ohne Gegenstück, keine leeren Werte, gleiche Platzhalter in beiden Sprachen, echte Umlaute statt ASCII-Ersatz („für" statt „fuer"), und die zuletzt gebauten Oberflächen sind wirklich übersetzt. |
| `promptsStore.test.ts` | Die Prompt-Bibliothek gegen einen Fake-Server, der `db/prompts.json` nachbildet – **inklusive** des Stolpersteins, dass `save_db` den JSON-*String* ablegt und `get_db` ihn als String zurückgibt. Dazu Anlegen/Bearbeiten/Löschen, Reihenfolge, Änderungs-Event, Zwischenspeicher, unbrauchbarer Dateiinhalt. |
| `civitApiKey.test.ts` | Regressionsschutz für den gemeldeten Fehler „API-Key ist nach dem Neustart weg": gespeichert wird serverseitig, ein leerer localStorage darf den Key nicht verlieren, Altbestände wandern einmalig in die Einstellungen, Serverausfall fällt sauber zurück. |

## Sind die Tests überhaupt wirksam?

Nachgewiesen per Mutationstest – jede dieser absichtlich eingebauten
Verschlechterungen wird von der Suite gefangen:

| Eingebauter Fehler | Reaktion |
|---|---|
| Letztes Download-Segment verliert den Rest-Bytes | 1 Test rot |
| Range-Header schon beim Auflösen der finalen URL (HF-Falle) | 1 Test rot |
| Vollständigkeitsprüfung nach dem Parallel-Download entfernt | 1 Test rot |
| API-Key nur im localStorage speichern (der Ur-Bug) | 2 Tests rot |
| `JSON.parse` beim Lesen von `get_db` weggelassen | 4 Tests rot |

## Stolpersteine

- **pytest muss aus `tests/` heraus laufen.** Das Repo-Root enthält ein
  `__init__.py` (der ComfyUI-Custom-Node-Entrypoint, der beim Import die
  ComfyUI-Module zieht). Liegt die pytest-Konfiguration im Root, macht pytest
  daraus die Sammel-Wurzel, importiert dieses `__init__.py` und bricht ab.
  Deshalb liegt `pytest.ini` in `tests/` – dann ist `tests/` die Wurzel.
- **ComfyUI-Globals werden gestubbt.** `conftest.py` legt minimale Ersatzmodule
  für `server`, `folder_paths` und `nodes` an und stellt einen Event-Loop
  bereit, den die Service-Module beim Import erwarten. Die Tests laufen damit
  ohne ComfyUI.
- **Endungslose Importe.** Der ui-Code importiert wie in Vite üblich ohne
  Dateiendung (`from "../Api"`). `tests/frontend/ts-resolver.mjs` ergänzt die
  `.ts`-Endung beim Laden, `setup.mjs` registriert ihn und stellt `window` und
  `localStorage` bereit.
- **Kein Netzzugriff.** Alle Tests laufen offline; CivArchive wird über
  Fixture-HTML geprüft, der Download gegen `127.0.0.1`.
