/**
 * Funktionstests fuer den Abgleich Backend-Modellliste -> indexdb.models
 * (ui/src/model-manager/syncModelsToDb.ts).
 *
 * Abgesichert wird:
 *  - Vorhandene Felder (z.B. downloadUrl) ueberleben einen Sync (Merge statt
 *    Ersetzen), und verschwundene Dateien werden gezielt geloescht - statt
 *    wie frueher die ganze Tabelle zu leeren und neu zu fuellen.
 *  - Ein frueherer Civitai-Fehltreffer ist nicht endgueltig: der Datensatz
 *    wird erneut nachgeschlagen (fetchCivitModelFromHashKey liefert bis zum
 *    Ablauf der Negativ-Cache-TTL selbst aus dem Cache).
 *  - Voruebergehende Fehler (Rate-Limit, Netz) ueberschreiben nichts.
 *  - Ein neuerer Sync verdraengt einen noch laufenden aelteren.
 *  - Die Civitai-Abfragen laufen gedrosselt.
 *  - Die Cache-Migration laeuft vor dem ersten Schreiben.
 *
 * Aufruf (siehe tests/README.md):
 *   node --experimental-transform-types --experimental-test-module-mocks \
 *        --disable-warning=ExperimentalWarning \
 *        --import ./tests/frontend/setup.mjs \
 *        --test tests/frontend/syncModelsToDb.test.ts
 */

import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// --- Fake-indexdb (nur was der Sync braucht) -----------------------------
const tabelle = new Map<string, any>();
const fakeIndexdb = {
  models: {
    async bulkGet(ids: string[]) {
      return ids.map((id) => (tabelle.has(id) ? { ...tabelle.get(id) } : undefined));
    },
    toCollection() {
      return { primaryKeys: async () => [...tabelle.keys()] };
    },
    async bulkPut(records: any[]) {
      records.forEach((r) => tabelle.set(r.id, r));
    },
    async bulkDelete(ids: string[]) {
      ids.forEach((id) => tabelle.delete(id));
    },
  },
  async transaction(_mode: string, _table: unknown, fn: () => Promise<unknown>) {
    return fn();
  },
};

// --- Fake-Civitai-Lookup ---------------------------------------------------
let lookupAntworten: Record<string, any> = {};
let lookupVerzoegerung = 0;
const lookupAufrufe: string[] = [];
const protokoll: string[] = [];
let laufendeLookups = 0;
let maxParallel = 0;

async function fakeLookup(hash: string) {
  lookupAufrufe.push(hash);
  laufendeLookups++;
  maxParallel = Math.max(maxParallel, laufendeLookups);
  try {
    if (lookupVerzoegerung) {
      await new Promise((r) => setTimeout(r, lookupVerzoegerung));
    }
    return lookupAntworten[hash] ?? { imageIsNsfw: false };
  } finally {
    laufendeLookups--;
  }
}

let sync: typeof import("../../ui/src/model-manager/syncModelsToDb.ts");

before(async () => {
  mock.module("../../ui/src/db-tables/indexdb.ts", {
    namedExports: { indexdb: fakeIndexdb },
  });
  mock.module("../../ui/src/utils/civitUtils.ts", {
    namedExports: {
      fetchCivitModelFromHashKey: fakeLookup,
      isNsfwBlurEligibleCategory: (t: string) =>
        t === "checkpoints" || t === "loras",
      runCivitCacheMigrationOnce: async () => {
        protokoll.push("migration");
      },
    },
  });
  sync = await import("../../ui/src/model-manager/syncModelsToDb.ts");
});

beforeEach(() => {
  tabelle.clear();
  lookupAntworten = {};
  lookupVerzoegerung = 0;
  lookupAufrufe.length = 0;
  protokoll.length = 0;
  laufendeLookups = 0;
  maxParallel = 0;
  (globalThis as any).__dispatchedEvents = [];
});

const eintrag = (name: string, typ: string, hash?: string) => ({
  model_name: name,
  model_extension: ".safetensors",
  model_type: typ,
  file_hash: hash,
  date: 0,
});

// --- Reine Hilfsfunktionen -------------------------------------------------

test("needsCivitLookup: ohne Hash nie, mit Treffer nicht erneut, nach Fehltreffer schon", () => {
  const { needsCivitLookup } = sync;
  assert.equal(needsCivitLookup({ file_hash: undefined }, undefined), false);
  assert.equal(needsCivitLookup({ file_hash: "H" }, undefined), true);
  const treffer: any = { fileHash: "H", civitModelID: "1" };
  assert.equal(needsCivitLookup({ file_hash: "H" }, treffer), false);
  const fehltreffer: any = { fileHash: "H" };
  assert.equal(
    needsCivitLookup({ file_hash: "H" }, fehltreffer),
    true,
    "Fehltreffer duerfen nicht fuer immer als erledigt gelten",
  );
  assert.equal(needsCivitLookup({ file_hash: "NEU" }, treffer), true, "Datei ersetzt");
});

test("buildModelRecord: Merge behaelt downloadUrl, voruebergehende Fehler ueberschreiben nichts", () => {
  const vorhanden: any = {
    id: "a@loras",
    fileHash: "H",
    fileName: "a.safetensors",
    fileFolder: "loras",
    modelName: "Alt",
    civitModelID: "5",
    downloadUrl: "https://example/dl",
  };
  const r1 = sync.buildModelRecord(eintrag("a", "loras", "H"), vorhanden, {
    imageIsNsfw: false,
    transient: true,
  });
  assert.equal(r1.modelName, "Alt");
  assert.equal(r1.civitModelID, "5");
  assert.equal(r1.downloadUrl, "https://example/dl");

  const r2 = sync.buildModelRecord(eintrag("a", "loras", "H"), vorhanden, {
    modelName: "Neu",
    civitModelID: "6",
    imageIsNsfw: true,
  });
  assert.equal(r2.modelName, "Neu");
  assert.equal(r2.civitModelID, "6");
  assert.equal(r2.imageIsNsfw, true);
  assert.equal(r2.downloadUrl, "https://example/dl");
});

test("buildModelRecord: anderer Hash verwirft die alte Civitai-Zuordnung, fehlender Hash nicht", () => {
  const vorhanden: any = {
    id: "a@loras",
    fileHash: "ALT",
    modelName: "Alt",
    civitModelID: "5",
  };
  const ersetzt = sync.buildModelRecord(eintrag("a", "loras", "NEU"), vorhanden, undefined);
  assert.equal(ersetzt.fileHash, "NEU");
  assert.equal(ersetzt.civitModelID, undefined);
  assert.equal(ersetzt.modelName, null);

  const nochNichtGehasht = sync.buildModelRecord(eintrag("a", "loras"), vorhanden, undefined);
  assert.equal(nochNichtGehasht.fileHash, "ALT");
  assert.equal(nochNichtGehasht.civitModelID, "5");
});

test("buildModelRecord: NSFW nur fuer checkpoints/loras", () => {
  const vae = sync.buildModelRecord(eintrag("v", "vae", "H"), undefined, {
    civitModelID: "1",
    imageIsNsfw: true,
  });
  assert.equal(vae.imageIsNsfw, false);
});

test("vanishedIds liefert genau die verschwundenen Eintraege", () => {
  assert.deepEqual(
    sync.vanishedIds(["a", "b", "c"], new Set(["a", "c", "d"])),
    ["b"],
  );
});

// --- Kompletter Sync -------------------------------------------------------

test("Sync: fuegt hinzu, aktualisiert per Merge und loescht nur Verschwundenes", async () => {
  tabelle.set("alt@loras", { id: "alt@loras", fileHash: "X" });
  tabelle.set("bleibt@loras", {
    id: "bleibt@loras",
    fileHash: "B",
    civitModelID: "9",
    modelName: "Bleibt",
    downloadUrl: "https://example/b",
  });
  lookupAntworten = {
    N: { modelName: "Neu", civitModelID: "1", imageIsNsfw: false },
  };

  const ok = await sync.syncModelsToDb([
    eintrag("bleibt", "loras", "B"),
    eintrag("neu", "checkpoints", "N"),
    eintrag("ungehasht", "vae"),
  ] as any);

  assert.equal(ok, true);
  assert.deepEqual([...tabelle.keys()].sort(), [
    "bleibt@loras",
    "neu@checkpoints",
    "ungehasht@vae",
  ]);
  assert.equal(tabelle.get("bleibt@loras").downloadUrl, "https://example/b");
  assert.equal(tabelle.get("neu@checkpoints").modelName, "Neu");
  assert.deepEqual(
    lookupAufrufe,
    ["N"],
    "bekannte Treffer und ungehashte Dateien werden nicht abgefragt",
  );
  assert.deepEqual((globalThis as any).__dispatchedEvents, [
    sync.MODELS_DB_SYNCED_EVENT,
  ]);
  assert.equal(protokoll[0], "migration");
});

test("Sync: frueherer Fehltreffer wird erneut nachgeschlagen", async () => {
  tabelle.set("spaet@loras", { id: "spaet@loras", fileHash: "S", modelName: null });
  lookupAntworten = {
    S: { modelName: "Inzwischen auf Civitai", civitModelID: "77", imageIsNsfw: false },
  };
  await sync.syncModelsToDb([eintrag("spaet", "loras", "S")] as any);
  assert.deepEqual(lookupAufrufe, ["S"]);
  assert.equal(tabelle.get("spaet@loras").civitModelID, "77");
});

test("Sync: ein neuerer Lauf verdraengt einen noch laufenden aelteren", async () => {
  lookupVerzoegerung = 10;
  const alt = sync.syncModelsToDb([eintrag("a", "loras", "A")] as any);
  const neu = sync.syncModelsToDb([eintrag("b", "loras", "B")] as any);
  const [ergebnisAlt, ergebnisNeu] = await Promise.all([alt, neu]);
  assert.equal(ergebnisAlt, false, "der aeltere Lauf schreibt nichts");
  assert.equal(ergebnisNeu, true);
  assert.deepEqual([...tabelle.keys()], ["b@loras"]);
});

test("Sync: Civitai-Abfragen laufen gedrosselt", async () => {
  lookupVerzoegerung = 3;
  const liste = Array.from({ length: 12 }, (_, i) =>
    eintrag(`m${i}`, "loras", `H${i}`),
  );
  await sync.syncModelsToDb(liste as any);
  assert.equal(lookupAufrufe.length, 12);
  assert.equal(maxParallel, sync.CIVIT_LOOKUP_CONCURRENCY);
});
