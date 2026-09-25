/**
 * Funktionstests fuer den Einstellungs-Zwischenspeicher in
 * db-tables/UserSettingsTable.ts.
 *
 * Frueher kostete JEDES getSetting() einen get_settings-Roundtrip (ueber den
 * RunPod-Proxy ~300ms, und getSetting wird z.B. bei jedem Workflow-Speichern
 * mehrfach gerufen), und zwei schnelle upserts lasen denselben alten Stand -
 * die zweite Aenderung warf die erste weg. Abgesichert wird:
 *  - getSetting liest aus dem Speicher, nicht vom Server,
 *  - parallele upserts gehen nicht verloren,
 *  - eine Aenderung wirkt sofort (auch waehrend der Schreibvorgang laeuft),
 *  - ein fehlgeschlagenes Schreiben aendert den Cache nicht.
 *
 * Aufruf (siehe tests/README.md):
 *   node --experimental-transform-types --experimental-test-module-mocks \
 *        --disable-warning=ExperimentalWarning \
 *        --import ./tests/frontend/setup.mjs \
 *        --test tests/frontend/userSettingsTable.test.ts
 */

import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// --- Fake-Server fuer db/settings.json -------------------------------------
let serverStand: Record<string, any> | null = null;
let speicherFehler = false;
let verzoegerung = 0;
const aufrufe: string[] = [];

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fakeFetchApi(route: string, options?: any) {
  aufrufe.push(route);
  if (verzoegerung) await warte(verzoegerung);
  if (route === "/workspace/get_settings") {
    const kopie = serverStand ? JSON.parse(JSON.stringify(serverStand)) : null;
    return { ok: true, status: 200, json: async () => kopie } as any;
  }
  if (route === "/workspace/save_settings") {
    if (speicherFehler) return { ok: false, status: 500 } as any;
    serverStand = JSON.parse(options.body);
    return { ok: true, status: 200 } as any;
  }
  throw new Error(`unerwartete Route: ${route}`);
}

let UserSettingsTable: typeof import("../../ui/src/db-tables/UserSettingsTable.ts").UserSettingsTable;

before(async () => {
  mock.module("../../ui/src/Api.ts", {
    namedExports: {
      fetchApi: fakeFetchApi,
      fetchMyWorkflowsDir: async () => ({ path: "/wf", os: "linux" }),
      getDB: async () => null,
      saveDB: async () => {},
    },
  });
  mock.module("../../ui/src/db-tables/WorkspaceDB.ts", {
    namedExports: { userSettingsTable: null },
  });
  mock.module("../../ui/src/db-tables/indexdb.ts", {
    namedExports: { indexdb: undefined },
  });
  ({ UserSettingsTable } = await import(
    "../../ui/src/db-tables/UserSettingsTable.ts"
  ));
});

beforeEach(() => {
  serverStand = { id: "guest", civitaiApiKey: "KEY", autoSave: true };
  speicherFehler = false;
  verzoegerung = 0;
  aufrufe.length = 0;
});

test("getSetting liest aus dem Speicher statt jedes Mal vom Server", async () => {
  const tabelle = await UserSettingsTable.load();
  aufrufe.length = 0;
  assert.equal(await tabelle.getSetting("civitaiApiKey"), "KEY");
  assert.equal(await tabelle.getSetting("autoSave"), true);
  assert.equal(await tabelle.getSetting("maximumChangelogNumber"), 80, "Default");
  assert.deepEqual(aufrufe, [], "kein einziger Roundtrip");
});

test("parallele upserts gehen nicht verloren", async () => {
  const tabelle = await UserSettingsTable.load();
  verzoegerung = 3;
  await Promise.all([
    tabelle.upsert({ civitaiIncludeAdultContent: true }),
    tabelle.upsert({ showNsfwModelThumbnail: true }),
    tabelle.upsert({ language: "de" }),
  ]);
  assert.equal(serverStand!.civitaiIncludeAdultContent, true);
  assert.equal(serverStand!.showNsfwModelThumbnail, true);
  assert.equal(serverStand!.language, "de");
  assert.equal(serverStand!.civitaiApiKey, "KEY", "unbeteiligte Werte bleiben");
});

test("eine Aenderung wirkt sofort, schon waehrend sie gespeichert wird", async () => {
  const tabelle = await UserSettingsTable.load();
  verzoegerung = 20;
  const laeuft = tabelle.upsert({ civitaiIncludeAdultContent: true });
  // Noch nicht auf dem Server - der Schalter muss trotzdem sofort greifen.
  assert.equal(await tabelle.getSetting("civitaiIncludeAdultContent"), true);
  await laeuft;
  assert.equal(await tabelle.getSetting("civitaiIncludeAdultContent"), true);
});

test("fehlgeschlagenes Speichern wirft und laesst den Cache unveraendert", async () => {
  const tabelle = await UserSettingsTable.load();
  speicherFehler = true;
  await assert.rejects(tabelle.upsert({ autoSave: false }));
  assert.equal(await tabelle.getSetting("autoSave"), true);
  speicherFehler = false;
  // Die Warteschlange ist nach dem Fehler nicht blockiert.
  await tabelle.upsert({ autoSave: false });
  assert.equal(await tabelle.getSetting("autoSave"), false);
});

test("refresh uebernimmt Aenderungen, die ausserhalb (anderer Tab) gemacht wurden", async () => {
  const tabelle = await UserSettingsTable.load();
  serverStand = { ...serverStand, civitaiApiKey: "NEU" };
  assert.equal(await tabelle.getSetting("civitaiApiKey"), "KEY", "noch der Cache");
  await tabelle.refresh();
  assert.equal(await tabelle.getSetting("civitaiApiKey"), "NEU");
});
