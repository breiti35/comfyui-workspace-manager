/**
 * Regressionstests fuer die Persistenz des Civitai-API-Keys.
 *
 * Gemeldeter Fehler: der Key war nach jedem ComfyUI-Neustart wieder weg. Ursache
 * war, dass er ausschliesslich im localStorage des Browsers lag - der in der
 * Desktop-App beim Neustart verworfen wird. Seitdem liegt er serverseitig in
 * db/settings.json; localStorage ist nur noch Spiegel fuer dieselbe Sitzung.
 *
 * Diese Tests halten genau das fest: gespeichert wird serverseitig, und ein
 * leerer localStorage darf den Key nicht verlieren.
 */

import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// --- Fake der serverseitigen Einstellungen ------------------------------
let settings: Record<string, any> = {};
let settingsKaputt = false;
const upserts: Record<string, any>[] = [];

const fakeUserSettingsTable = {
  async getSetting(key: string) {
    if (settingsKaputt) throw new Error("settings nicht erreichbar");
    return settings[key];
  },
  async upsert(changes: Record<string, any>) {
    if (settingsKaputt) throw new Error("settings nicht erreichbar");
    upserts.push(changes);
    Object.assign(settings, changes);
  },
};

let civitUtils: typeof import("../../ui/src/utils/civitUtils.ts");

before(async () => {
  mock.module("../../ui/src/db-tables/WorkspaceDB.ts", {
    namedExports: { userSettingsTable: fakeUserSettingsTable },
  });
  mock.module("../../ui/src/db-tables/indexdb.ts", {
    namedExports: { indexdb: undefined },
  });
  mock.module("../../ui/src/Api.ts", {
    namedExports: { fetchApi: async () => ({ ok: false, json: async () => null }) },
  });
  civitUtils = await import("../../ui/src/utils/civitUtils.ts");
});

beforeEach(() => {
  settings = {};
  settingsKaputt = false;
  upserts.length = 0;
  localStorage.clear();
  // Internen Zwischenspeicher leeren (leerer Settings-Stand + leerer Storage).
  civitUtils.setCivitApiKey("");
  settings = {};
  upserts.length = 0;
  localStorage.clear();
});

const KEY = "abcdef1234567890abcdef1234567890";

// --- Der eigentliche Fehlerfall -----------------------------------------

test("Speichern legt den Key serverseitig ab, nicht nur im Browser", () => {
  civitUtils.setCivitApiKey(KEY);

  assert.deepEqual(
    upserts,
    [{ civitaiApiKey: KEY }],
    "Der Key muss in die serverseitigen Einstellungen geschrieben werden",
  );
  assert.equal(settings.civitaiApiKey, KEY);
});

test("nach einem Neustart mit leerem localStorage ist der Key noch da", async () => {
  // Zustand nach Neustart: Einstellungen halten den Key, der Browser nicht.
  settings = { civitaiApiKey: KEY };
  localStorage.clear();

  await civitUtils.loadCivitApiKey();

  assert.equal(
    civitUtils.getCivitApiKey(),
    KEY,
    "Genau das war der gemeldete Fehler: Key nach Neustart verschwunden",
  );
});

test("ein alter localStorage-Key wandert einmalig in die Einstellungen", async () => {
  // Zustand eines Bestandsnutzers: Key liegt nur im Browser.
  localStorage.setItem("WORKSPACE_CIVIT_API_KEY_STORAGE_KEY", KEY);
  settings = {};

  await civitUtils.loadCivitApiKey();

  assert.equal(civitUtils.getCivitApiKey(), KEY);
  assert.deepEqual(
    upserts,
    [{ civitaiApiKey: KEY }],
    "Der Altbestand muss serverseitig nachgetragen werden",
  );
});

test("die serverseitige Einstellung hat Vorrang vor dem Browser", async () => {
  settings = { civitaiApiKey: "server-key" };
  localStorage.setItem("WORKSPACE_CIVIT_API_KEY_STORAGE_KEY", "alter-browser-key");

  await civitUtils.loadCivitApiKey();

  assert.equal(civitUtils.getCivitApiKey(), "server-key");
  assert.deepEqual(upserts, [], "kein unnoetiges Zurueckschreiben");
});

// --- Randfaelle ----------------------------------------------------------

test("Loeschen entfernt den Key aus beiden Ablagen", () => {
  civitUtils.setCivitApiKey(KEY);
  upserts.length = 0;

  civitUtils.setCivitApiKey("");

  assert.equal(civitUtils.getCivitApiKey(), null);
  assert.deepEqual(upserts, [{ civitaiApiKey: "" }]);
  assert.equal(settings.civitaiApiKey, "");
});

test("ohne gespeicherten Key ist das Ergebnis null", async () => {
  await civitUtils.loadCivitApiKey();
  assert.equal(civitUtils.getCivitApiKey(), null);
});

test("nicht erreichbare Einstellungen stuerzen nicht ab", async () => {
  localStorage.setItem("WORKSPACE_CIVIT_API_KEY_STORAGE_KEY", KEY);
  settingsKaputt = true;

  await civitUtils.loadCivitApiKey();

  assert.equal(
    civitUtils.getCivitApiKey(),
    KEY,
    "Bei Serverproblemen muss der Browserwert einspringen",
  );
});

test("der Key ist sofort nach dem Setzen lesbar, ohne erneutes Laden", () => {
  civitUtils.setCivitApiKey(KEY);
  assert.equal(civitUtils.getCivitApiKey(), KEY);
});
