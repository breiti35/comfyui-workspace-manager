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
 *   node --experimental-transform-types --experimental-test-module-mocks \
 *        --disable-warning=ExperimentalWarning \
 *        --import ./tests/frontend/setup.mjs \
 *        --test tests/frontend/promptsStore.test.ts
 */

import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// --- Fake-Server, der db/prompts.json nachbildet -------------------------
let dateiInhalt: string | null = null; // exakt das, was db/prompts.json haelt
const aufrufe: string[] = [];
// Stoerungen simulieren: "http" = Server antwortet mit 500, "netz" = fetch
// wirft (z.B. abgerissene Proxy-Verbindung).
let ladeFehler: null | "http" | "netz" = null;
let speicherFehler: null | "http" | "netz" = null;
// Optionale kuenstliche Verzoegerung beim Speichern, um Ueberholvorgaenge
// paralleler Aenderungen sichtbar zu machen.
let speicherVerzoegerung = 0;

async function fakeFetchApi(route: string, options?: any) {
  aufrufe.push(route);
  if (route.startsWith("/workspace/get_db")) {
    if (ladeFehler === "netz") throw new Error("network down");
    if (ladeFehler === "http") {
      return { ok: false, status: 500, json: async () => null } as any;
    }
    return {
      ok: true,
      // Der Server antwortet mit dem gespeicherten String (bzw. null).
      json: async () => dateiInhalt,
    } as any;
  }
  if (route === "/workspace/save_db") {
    if (speicherFehler === "netz") throw new Error("network down");
    if (speicherFehler === "http") {
      return { ok: false, status: 500, text: async () => "boom" } as any;
    }
    const body = JSON.parse(options.body);
    if (speicherVerzoegerung) {
      await new Promise((r) => setTimeout(r, speicherVerzoegerung));
    }
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
  ladeFehler = null;
  speicherFehler = null;
  speicherVerzoegerung = 0;
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

test("unbrauchbarer Dateiinhalt gilt als Ladefehler statt als leere Bibliothek", async () => {
  // Eine kaputte Datei darf nicht als [] durchgehen - sonst wuerde das
  // naechste Speichern die (evtl. noch rettbare) Datei ueberschreiben.
  dateiInhalt = "{kein json";
  await assert.rejects(store.listPrompts(true), (e: any) => e.kind === "load");

  dateiInhalt = JSON.stringify({ nicht: "ein array" });
  await assert.rejects(store.listPrompts(true), (e: any) => e.kind === "load");
});

test("Ladefehler (HTTP und Netz) werden gemeldet, nicht als [] zwischengespeichert", async () => {
  for (const art of ["http", "netz"] as const) {
    ladeFehler = art;
    await assert.rejects(store.listPrompts(true), (e: any) => e.kind === "load");
  }
});

test("ohne erfolgreiches Laden wird nicht geschrieben (kein Ueberschreiben der Bibliothek)", async () => {
  // Frisches Modul, damit kein Zwischenspeicher aus frueheren Tests greift.
  const frisch = await import(
    "../../ui/src/prompt-library/promptsStore.ts?frisch=" + Date.now()
  );
  dateiInhalt = JSON.stringify([
    { id: "alt", name: "Bestand", positive: "x", tags: [], createTime: 1 },
  ]);
  ladeFehler = "http";
  await assert.rejects(frisch.listPrompts(), (e: any) => e.kind === "load");
  aufrufe.length = 0;
  await assert.rejects(
    frisch.addPrompt({ name: "neu", positive: "y", tags: [] } as any),
    (e: any) => e.kind === "load",
  );
  assert.ok(
    !aufrufe.includes("/workspace/save_db"),
    "es darf kein save_db abgesetzt werden",
  );
  assert.match(dateiInhalt!, /Bestand/, "Bestand auf dem Server bleibt erhalten");

  // Sobald das Laden wieder klappt, funktioniert auch das Speichern.
  ladeFehler = null;
  await frisch.addPrompt({ name: "neu", positive: "y", tags: [] } as any);
  const namen = JSON.parse(dateiInhalt!).map((p: any) => p.name);
  assert.deepEqual(namen, ["neu", "Bestand"]);
});

test("fehlgeschlagenes Speichern aendert weder Cache noch meldet es ein Event", async () => {
  await store.addPrompt({ name: "A", positive: "a", tags: [] } as any);
  (globalThis as any).__dispatchedEvents = [];

  for (const art of ["http", "netz"] as const) {
    speicherFehler = art;
    await assert.rejects(
      store.addPrompt({ name: "B", positive: "b", tags: [] } as any),
      (e: any) => e.kind === "save",
    );
  }
  assert.deepEqual((globalThis as any).__dispatchedEvents, []);
  const liste = await store.listPrompts(); // aus dem Cache
  assert.deepEqual(
    liste.map((p) => p.name),
    ["A"],
  );
});

test("parallele Aenderungen werden nacheinander ausgefuehrt und gehen nicht verloren", async () => {
  speicherVerzoegerung = 5;
  await Promise.all([
    store.addPrompt({ name: "eins", positive: "1", tags: [] } as any),
    store.addPrompt({ name: "zwei", positive: "2", tags: [] } as any),
    store.addPrompt({ name: "drei", positive: "3", tags: [] } as any),
  ]);
  const namen = JSON.parse(dateiInhalt!).map((p: any) => p.name);
  assert.deepEqual(namen, ["drei", "zwei", "eins"]);
});
