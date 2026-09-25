/**
 * Funktionstests fuer den Civitai-Hash-Lookup-Cache in utils/civitUtils.ts.
 *
 * Frueher wurde JEDE nicht erfolgreiche Antwort (auch 429 Rate-Limit, 5xx
 * oder ein Netzwerkfehler) eine Stunde lang als "nicht auf Civitai"
 * gespeichert - ein einziger Proxy-Aussetzer liess so ganze Modellraster ohne
 * Namen und Vorschaubild zurueck. Jetzt gilt:
 *  - nur 404 ist ein echtes "nicht auf Civitai" und wird gecacht,
 *  - 429/5xx/Netzfehler werden NICHT gecacht, loesen aber einen globalen
 *    Backoff aus (Retry-After wird beachtet), damit wir Civitai nicht weiter
 *    bombardieren.
 *
 * Aufruf (siehe tests/README.md):
 *   node --experimental-transform-types --experimental-test-module-mocks \
 *        --disable-warning=ExperimentalWarning \
 *        --import ./tests/frontend/setup.mjs \
 *        --test tests/frontend/civitHashLookup.test.ts
 */

import { test, mock, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

// --- Fakes -------------------------------------------------------------------
const cache = new Map<string, { id: string; value: string }>();
const fakeIndexdb = {
  cache: {
    async get(id: string) {
      return cache.get(id);
    },
    async put(entry: { id: string; value: string }) {
      cache.set(entry.id, entry);
    },
  },
};

type FakeAntwort =
  | { status: number; body?: unknown; headers?: Record<string, string> }
  | "netzfehler";
let antworten: FakeAntwort[] = [];
const fetchAufrufe: string[] = [];
const originalFetch = globalThis.fetch;

async function fakeFetch(url: string) {
  fetchAufrufe.push(url);
  const a = antworten.shift() ?? { status: 404 };
  if (a === "netzfehler") throw new TypeError("Failed to fetch");
  return {
    ok: a.status >= 200 && a.status < 300,
    status: a.status,
    headers: { get: (k: string) => a.headers?.[k] ?? null },
    json: async () => a.body,
  } as any;
}

let zaehler = 0;
async function frischesModul() {
  // Frische Modulinstanz pro Test: der Backoff-Zustand ist modulintern.
  zaehler++;
  return (await import(
    `../../ui/src/utils/civitUtils.ts?instanz=${zaehler}`
  )) as typeof import("../../ui/src/utils/civitUtils.ts");
}

before(() => {
  mock.module("../../ui/src/db-tables/WorkspaceDB.ts", {
    namedExports: {
      userSettingsTable: { getSetting: async () => false, upsert: async () => {} },
    },
  });
  mock.module("../../ui/src/db-tables/indexdb.ts", {
    namedExports: { indexdb: fakeIndexdb },
  });
  mock.module("../../ui/src/Api.ts", {
    namedExports: { fetchApi: async () => ({ ok: false, status: 404 }) },
  });
  (globalThis as any).fetch = fakeFetch;
});

after(() => {
  (globalThis as any).fetch = originalFetch;
});

beforeEach(() => {
  cache.clear();
  antworten = [];
  fetchAufrufe.length = 0;
});

const TREFFER = {
  status: 200,
  body: {
    id: 11,
    modelId: 22,
    name: "v1",
    model: { name: "Testmodell", type: "LORA", nsfw: false },
    images: [{ url: "https://img/1.jpg", nsfwLevel: 1 }],
  },
};

// --- Reine Hilfsfunktionen -------------------------------------------------

test("parseRetryAfter versteht Sekunden und HTTP-Datum", async () => {
  const m = await frischesModul();
  assert.equal(m.parseRetryAfter("120"), 120_000);
  assert.equal(m.parseRetryAfter(null), null);
  assert.equal(m.parseRetryAfter("quatsch"), null);
  const jetzt = Date.parse("2026-01-01T00:00:00Z");
  assert.equal(
    m.parseRetryAfter("Thu, 01 Jan 2026 00:00:30 GMT", jetzt),
    30_000,
  );
});

test("computeCivitBackoffMs: Retry-After gewinnt, sonst exponentiell mit Deckel", async () => {
  const m = await frischesModul();
  assert.equal(m.computeCivitBackoffMs(1, 5_000), 5_000);
  assert.equal(m.computeCivitBackoffMs(1, null), 30_000);
  assert.equal(m.computeCivitBackoffMs(2, null), 60_000);
  assert.equal(m.computeCivitBackoffMs(20, null), 10 * 60_000);
  assert.equal(m.computeCivitBackoffMs(1, 60 * 60_000), 10 * 60_000);
});

// --- Cache-Verhalten --------------------------------------------------------

test("Treffer wird gecacht und beim zweiten Mal nicht erneut abgefragt", async () => {
  const m = await frischesModul();
  antworten = [TREFFER];
  const r1 = await m.fetchCivitModelFromHashKey("AAA");
  assert.equal(r1.civitModelID, "22");
  const r2 = await m.fetchCivitModelFromHashKey("AAA");
  assert.equal(r2.civitModelID, "22");
  assert.equal(fetchAufrufe.length, 1);
});

test("404 wird als 'nicht auf Civitai' gecacht", async () => {
  const m = await frischesModul();
  antworten = [{ status: 404 }];
  const r = await m.fetchCivitModelFromHashKey("BBB");
  assert.equal(r.civitModelID, undefined);
  assert.ok(!r.transient);
  await m.fetchCivitModelFromHashKey("BBB");
  assert.equal(fetchAufrufe.length, 1, "404 kommt aus dem Cache");
});

test("429 wird nicht gecacht und loest einen Backoff aus", async () => {
  const m = await frischesModul();
  antworten = [{ status: 429, headers: { "Retry-After": "60" } }];
  const r = await m.fetchCivitModelFromHashKey("CCC");
  assert.equal(r.transient, true);
  assert.equal(cache.size, 0, "nichts im Cache");

  // Waehrend des Backoffs geht keine weitere Anfrage raus - auch nicht fuer
  // einen anderen Hash (Rate-Limit gilt global).
  const r2 = await m.fetchCivitModelFromHashKey("DDD");
  assert.equal(r2.transient, true);
  assert.equal(fetchAufrufe.length, 1);
});

test("5xx und Netzwerkfehler werden nicht gecacht", async () => {
  const m1 = await frischesModul();
  antworten = [{ status: 503 }];
  assert.equal((await m1.fetchCivitModelFromHashKey("EEE")).transient, true);

  const m2 = await frischesModul();
  antworten = ["netzfehler"];
  assert.equal((await m2.fetchCivitModelFromHashKey("FFF")).transient, true);

  assert.equal(cache.size, 0);
});

test("nach einem voruebergehenden Fehler klappt ein spaeterer Versuch (kein Cache-Eintrag blockiert)", async () => {
  const m = await frischesModul();
  antworten = [{ status: 500 }];
  await m.fetchCivitModelFromHashKey("GGG");
  // Backoff simuliert abgelaufen: neue Modulinstanz, gleicher (leerer) Cache.
  const m2 = await frischesModul();
  antworten = [TREFFER];
  const r = await m2.fetchCivitModelFromHashKey("GGG");
  assert.equal(r.civitModelID, "22");
});
