/**
 * Funktionstests fuer die Basismodell-Auswahl im Install-Panel
 * (ui/src/model-manager/install-models/util/baseModels.ts).
 *
 * Aufruf: siehe tests/README.md bzw. scripts/run_tests.ps1.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FALLBACK_BASE_MODELS,
  baseModelLabel,
  filterBaseModels,
  toBaseModelOptions,
} from "../../ui/src/model-manager/install-models/util/baseModels.ts";

const opts = toBaseModelOptions(FALLBACK_BASE_MODELS);
const keys = (q: string) => filterBaseModels(opts, q).map((o) => o.key);

test("Fallback enthaelt die neuen Familien (MiniMax H3, Krea 2, Z-Image, Wan 2.2)", () => {
  for (const k of ["MiniMax H3", "Krea 2", "ZImageTurbo", "Wan Video 2.2 T2V-A14B"]) {
    assert.ok(FALLBACK_BASE_MODELS.includes(k), k);
  }
});

test("toBaseModelOptions entfernt Duplikate, Leeres und Nicht-Strings", () => {
  const res = toBaseModelOptions(["Pony", "Pony", " ", "", 42, null, " Krea 2 "]);
  assert.deepEqual(
    res.map((o) => o.key),
    ["Krea 2", "Pony"],
  );
});

test("Sortierung ist natuerlich: SD 1.5 vor SD 2.0, Qwen 2 vor Qwen 3", () => {
  const k = opts.map((o) => o.key);
  assert.ok(k.indexOf("SD 1.5") < k.indexOf("SD 2.0"));
  assert.ok(k.indexOf("Qwen 2") < k.indexOf("Qwen 3"));
});

test("Label-Overrides fuer interne Civitai-Schreibweisen, sonst Key unveraendert", () => {
  assert.equal(baseModelLabel("PixArt a"), "PixArt α");
  assert.equal(baseModelLabel("ZImageTurbo"), "Z-Image Turbo");
  assert.equal(baseModelLabel("MiniMax H3"), "MiniMax H3");
});

test("Suche: leere Anfrage liefert alles", () => {
  assert.equal(filterBaseModels(opts, "   ").length, opts.length);
});

test("Suche ignoriert Gross-/Kleinschreibung und Satzzeichen", () => {
  assert.deepEqual(keys("minimax"), ["MiniMax H3"]);
  assert.deepEqual(keys("KREA 2"), ["Krea 2"]);
  assert.ok(keys("flux.1 krea").includes("Flux.1 Krea"));
});

test("Suche findet ueber das Label: 'z-image' trifft ZImageTurbo/ZImageBase", () => {
  assert.deepEqual(keys("z-image").sort(), ["ZImageBase", "ZImageTurbo"]);
});

test("Suche: alle Woerter muessen passen ('wan 2.2 i2v')", () => {
  // "TI2V" enthaelt "i2v" - beide 2.2-Varianten passen, die 2.5er nicht.
  assert.deepEqual(keys("wan 2.2 i2v").sort(), [
    "Wan Video 2.2 I2V-A14B",
    "Wan Video 2.2 TI2V-5B",
  ]);
});

test("Suche ohne Treffer liefert leere Liste", () => {
  assert.deepEqual(keys("gibtsnicht"), []);
});
