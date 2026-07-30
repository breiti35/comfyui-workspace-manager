/**
 * Funktionstests fuer die Prompt-Bibliothek.
 *
 * Besonderes Augenmerk auf die Persistenz: die generische Server-Route
 * `save_db` legt den uebergebenen JSON-*String* ab, `get_db` gibt ihn deshalb
 * als String zurueck (nicht als Objekt). Wer das beim Lesen vergisst, bekommt
 * eine leere Bibliothek. Der Fake-Server hier bildet genau dieses Verhalten
 * nach, damit der Stolperstein im Test abgesichert ist.
 *
 * Aufruf (siehe tests/README.md):
 *   node --experimental-test-module-mocks --import ./tests/frontend/setup.mjs \
 *        --test tests/frontend/promptsStore.test.ts
 */

import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// --- Fake-Server, der db/prompts.json nachbildet -------------------------
let dateiInhalt: string | null = null; // exakt das, was db/prompts.json haelt
const aufrufe: string[] = [];

async function fakeFetchApi(route: string, options?: any) {
  aufrufe.push(route);
  if (route.startsWith("/workspace/get_db")) {
    return {
      ok: true,
      // Der Server antwortet mit dem gespeicherten String (bzw. null).
      json: async () => dateiInhalt,
    } as any;
  }
  if (route === "/workspace/save_db") {
    const body = JSON.parse(options.body);
    dateiInhalt = body.json; // <- String, nicht Objekt
    return { ok: true, text: async () => "ok" } as any;
  }
  throw new Error(`unerwartete Route: ${route}`);
}

let store: typeof import("../../ui/src/prompt-library/promptsStore.ts");

before(async () => {
  mock.module("../../ui/src/Api.ts", {
    namedExports: { fetchApi: fakeFetchApi },
  });
  store = await import("../../ui/src/prompt-library/promptsStore.ts");
});

beforeEach(async () => {
  dateiInhalt = null;
  // Der Store haelt die Liste modulintern vor. Einmal erzwungen nachladen,
  // damit dieser Zwischenspeicher nicht aus dem vorigen Test durchschlaegt.
  await store.listPrompts(true);
  aufrufe.length = 0;
  (globalThis as any).__dispatchedEvents = [];
});

// --- Reine Hilfsfunktionen ----------------------------------------------

test("autoName kuerzt lange Prompts und faellt sauber zurueck", () => {
  assert.equal(store.autoName(""), "Prompt");
  assert.equal(store.autoName("   "), "Prompt");
  assert.equal(store.autoName("ein  kurzer\n prompt"), "ein kurzer prompt");

  const lang = "a".repeat(80);
  const gekuerzt = store.autoName(lang);
  assert.equal(gekuerzt.length, 49, "48 Zeichen + Auslassungszeichen");
  assert.ok(gekuerzt.endsWith("…"));
});

test("collectTags entdoppelt, sortiert und ignoriert Leereintraege", () => {
  const tags = store.collectTags([
    { tags: ["portrait", "sdxl"] },
    { tags: ["sdxl", "", "anime"] },
    { tags: undefined },
  ] as any);
  assert.deepEqual(tags, ["anime", "portrait", "sdxl"]);
});

// --- Persistenz ---------------------------------------------------------

test("leere Bibliothek liefert eine leere Liste", async () => {
  const liste = await store.listPrompts(true);
  assert.deepEqual(liste, []);
});

test("gespeichertes Rezept ueberlebt den Server-Roundtrip", async () => {
  await store.addPrompt({
    name: "Testrezept",
    positive: "a cat, masterpiece",
    negative: "blurry",
    model: "sdxl_base.safetensors",
    loras: ["detail_slider:0.8"],
    sampler: "dpmpp_2m",
    steps: "30",
    cfg: "7",
    tags: ["katze"],
  } as any);

  // Der Server haelt einen String - genau das ist der Stolperstein.
  assert.equal(typeof dateiInhalt, "string");

  const gelesen = await store.listPrompts(true);
  assert.equal(gelesen.length, 1);
  assert.equal(gelesen[0].name, "Testrezept");
  assert.equal(gelesen[0].positive, "a cat, masterpiece");
  assert.deepEqual(gelesen[0].loras, ["detail_slider:0.8"]);
  assert.equal(gelesen[0].sampler, "dpmpp_2m");
  assert.ok(gelesen[0].id, "es muss eine ID vergeben werden");
  assert.ok(gelesen[0].createTime > 0);
});

test("neue Rezepte landen oben", async () => {
  await store.addPrompt({ name: "erstes", positive: "a", tags: [] } as any);
  await store.addPrompt({ name: "zweites", positive: "b", tags: [] } as any);

  const liste = await store.listPrompts(true);
  assert.deepEqual(
    liste.map((p) => p.name),
    ["zweites", "erstes"],
  );
});

test("Bearbeiten aendert nur das gemeinte Rezept", async () => {
  const a = await store.addPrompt({ name: "A", positive: "a", tags: [] } as any);
  await store.addPrompt({ name: "B", positive: "b", tags: [] } as any);

  await store.updatePrompt(a.id, { name: "A neu", tags: ["x"] });

  const liste = await store.listPrompts(true);
  const neu = liste.find((p) => p.id === a.id)!;
  const andere = liste.find((p) => p.name === "B")!;
  assert.equal(neu.name, "A neu");
  assert.deepEqual(neu.tags, ["x"]);
  assert.equal(neu.positive, "a", "unveraenderte Felder bleiben erhalten");
  assert.ok(neu.updateTime && neu.updateTime > 0);
  assert.equal(andere.name, "B");
  assert.equal(andere.updateTime, undefined);
});

test("Loeschen entfernt genau einen Eintrag", async () => {
  const a = await store.addPrompt({ name: "A", positive: "a", tags: [] } as any);
  await store.addPrompt({ name: "B", positive: "b", tags: [] } as any);

  await store.deletePrompt(a.id);

  const liste = await store.listPrompts(true);
  assert.deepEqual(
    liste.map((p) => p.name),
    ["B"],
  );
});

test("jede Aenderung meldet sich per Event an die Oberflaeche", async () => {
  await store.addPrompt({ name: "A", positive: "a", tags: [] } as any);
  assert.deepEqual((globalThis as any).__dispatchedEvents, [
    store.PROMPTS_CHANGED_EVENT,
  ]);
});

test("wiederholtes Lesen nutzt den Zwischenspeicher", async () => {
  await store.listPrompts(true);
  const vorher = aufrufe.filter((r) => r.startsWith("/workspace/get_db")).length;
  await store.listPrompts();
  await store.listPrompts();
  const nachher = aufrufe.filter((r) => r.startsWith("/workspace/get_db")).length;
  assert.equal(nachher, vorher, "ohne force darf nicht neu geladen werden");
});

// --- Robustheit ---------------------------------------------------------

test("unbrauchbarer Dateiinhalt fuehrt nicht zum Absturz", async () => {
  dateiInhalt = "{kein json";
  assert.deepEqual(await store.listPrompts(true), []);

  dateiInhalt = JSON.stringify({ nicht: "ein array" });
  assert.deepEqual(await store.listPrompts(true), []);
});
