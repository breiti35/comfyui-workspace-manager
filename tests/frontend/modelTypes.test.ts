/**
 * Funktionstests fuer folderToModelType in modelTypes.ts.
 *
 * folderToModelType kehrt MODEL_TYPE_TO_FOLDER_MAPPING um: aus einem
 * ComfyUI-Ordnernamen (Verzeichnis-Scan) wird der zugehoerige Civitai-Typ.
 * Der Vergleich ist ohne Beachtung von Gross-/Kleinschreibung und ignoriert
 * fuehrende/folgende Leerzeichen, weil die Namen aus dem Dateisystem kommen.
 *
 * Praktisch wichtigster Fall: die vier ComfyUI-Ordner ohne Civitai-Entsprechung
 * (clip, clip_vision, unet, diffusion_models) muessen `undefined` liefern -
 * genau deshalb bekommen die "Diffusion Models"- und "LoRA/Checkpoint"-Reiter
 * im UI getrennte Kategorie-Leisten.
 *
 * Aufruf (siehe tests/README.md):
 *   node --experimental-transform-types --experimental-test-module-mocks \
 *        --disable-warning=ExperimentalWarning \
 *        --import ./tests/frontend/setup.mjs \
 *        --test tests/frontend/modelTypes.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ALL_MODEL_TYPES,
  MODEL_TYPE_TO_FOLDER_MAPPING,
  SECONDARY_MODEL_TYPES,
  folderToModelType,
  getFileEssential,
  pickPrimaryFile,
} from "../../ui/src/model-manager/install-models/util/modelTypes.ts";

// --- Rundreise: Typ -> Ordner -> wieder derselbe Typ ------------------------
// Leitet die Faelle aus MODEL_TYPE_TO_FOLDER_MAPPING selbst ab, statt die
// Literale abzutippen - so deckt der Test auch einen kuenftig hinzugefuegten
// Typ automatisch mit ab. Mehrere Typen koennen sich einen Ordner teilen
// (LoCon/DoRA liegen wie LORA in "loras"): nur der Primaertyp muss die
// Rundreise schaffen, die Sekundaertypen muessen in ihren Ordner zeigen, der
// wiederum auf einen Primaertyp mit demselben Ordner zurueckfuehrt.

for (const [modelType, folder] of Object.entries(MODEL_TYPE_TO_FOLDER_MAPPING)) {
  if (SECONDARY_MODEL_TYPES.has(modelType as any)) {
    test(`Sekundaertyp ${modelType} landet im Ordner ${JSON.stringify(folder)}, der Rueckweg fuehrt zum Primaertyp`, () => {
      const primaer = folderToModelType(folder);
      assert.ok(primaer, `fuer ${folder} muss es einen Primaertyp geben`);
      assert.notEqual(primaer, modelType);
      assert.ok(!SECONDARY_MODEL_TYPES.has(primaer!));
      assert.equal(MODEL_TYPE_TO_FOLDER_MAPPING[primaer!], folder);
    });
  } else {
    test(`folderToModelType(${JSON.stringify(folder)}) fuehrt zurueck zu ${modelType} (Rundreise Typ -> Ordner -> Typ)`, () => {
      assert.equal(folderToModelType(folder), modelType);
    });
  }
}

test("LoCon und DoRA werden in 'loras' installiert, 'loras' bleibt aber LORA", () => {
  assert.equal(MODEL_TYPE_TO_FOLDER_MAPPING.LoCon, "loras");
  assert.equal(MODEL_TYPE_TO_FOLDER_MAPPING.DoRA, "loras");
  assert.equal(folderToModelType("loras"), "LORA");
  assert.ok(ALL_MODEL_TYPES.includes("LoCon"));
  assert.ok(ALL_MODEL_TYPES.includes("DoRA"));
});

test("jeder Typ aus ALL_MODEL_TYPES hat einen Zielordner", () => {
  for (const t of ALL_MODEL_TYPES) {
    assert.ok(MODEL_TYPE_TO_FOLDER_MAPPING[t], `${t} ohne Ordner`);
  }
});

// --- getFileEssential: Primaerdatei statt files[0] ---------------------------

test("getFileEssential nimmt die Primaerdatei (Name, SHA256, Groesse), nicht blind files[0]", () => {
  const version: any = {
    id: 42,
    files: [
      { id: 1, name: "training_data.zip", sizeKB: 10, hashes: { SHA256: "ZIP" } },
      { id: 2, name: "model.safetensors", sizeKB: 2000, primary: true, hashes: { SHA256: "ABC" } },
    ],
  };
  assert.deepEqual(getFileEssential(version), {
    id: 42,
    name: "model.safetensors",
    SHA256: "ABC",
    sizeKB: 2000,
  });
});

test("getFileEssential faellt ohne primary-Flag auf files[0] zurueck", () => {
  const version: any = {
    id: 7,
    files: [{ id: 1, name: "a.safetensors", sizeKB: 5, hashes: { SHA256: "A" } }],
  };
  assert.equal(getFileEssential(version)!.name, "a.safetensors");
  assert.equal(pickPrimaryFile([]), undefined);
  assert.equal(pickPrimaryFile(undefined), undefined);
});

// --- Ordner ohne Civitai-Entsprechung: undefined ----------------------------

for (const unbekannterOrdner of ["clip", "clip_vision", "unet", "diffusion_models"]) {
  test(`folderToModelType("${unbekannterOrdner}") liefert undefined - ComfyUI-Ordner ohne Civitai-Typ (eigene UI-Kategorie-Leiste)`, () => {
    assert.equal(folderToModelType(unbekannterOrdner), undefined);
  });
}

// --- Gross-/Kleinschreibung und Leerzeichen ---------------------------------

test("folderToModelType ignoriert Gross-/Kleinschreibung und umgebende Leerzeichen", () => {
  const erwartet = folderToModelType("loras");
  assert.equal(erwartet, "LORA");
  assert.equal(folderToModelType("LORAS"), erwartet);
  assert.equal(folderToModelType("Loras"), erwartet);
  assert.equal(folderToModelType("  loras  "), erwartet);
  assert.equal(folderToModelType("LoRAs"), erwartet);
});

// --- Randfaelle --------------------------------------------------------------

test("folderToModelType('') liefert undefined und wirft nicht", () => {
  assert.doesNotThrow(() => folderToModelType(""));
  assert.equal(folderToModelType(""), undefined);
});

test("folderToModelType('   ') (nur Leerzeichen) liefert undefined und wirft nicht", () => {
  assert.doesNotThrow(() => folderToModelType("   "));
  assert.equal(folderToModelType("   "), undefined);
});

test("folderToModelType('does_not_exist') (unbekannter Name) liefert undefined und wirft nicht", () => {
  assert.doesNotThrow(() => folderToModelType("does_not_exist"));
  assert.equal(folderToModelType("does_not_exist"), undefined);
});

// --- Keine Verwechslung durch Teilzeichenketten ------------------------------
// Die Zuordnung ist exakt, nicht unscharf: ein Name, der einen gueltigen
// Ordnernamen nur enthaelt, darf nicht treffen.

test("folderToModelType('my_loras') trifft NICHT (enthaelt nur 'loras' als Teilstring)", () => {
  assert.equal(folderToModelType("my_loras"), undefined);
});

test("folderToModelType('loras_backup') trifft NICHT (enthaelt nur 'loras' als Teilstring)", () => {
  assert.equal(folderToModelType("loras_backup"), undefined);
});

test("folderToModelType('checkpointsxyz') trifft NICHT (Praefix-Treffer reicht nicht, startsWith waere ein Bug)", () => {
  assert.equal(folderToModelType("checkpointsxyz"), undefined);
});
