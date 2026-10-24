/**
 * Tests fuer die Galerie-Suche ueber echte Metadaten (gallery/gallerySearch.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSearchText } from "../../ui/src/gallery/gallerySearch.ts";

const prompt = {
  "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "Juggernaut.safetensors" } },
  "2": { class_type: "LoraLoader", inputs: { lora_name: "DetailTweaker.safetensors", model: ["1", 0] } },
  "3": { class_type: "CLIPTextEncode", inputs: { text: "a red Fox", clip: ["1", 1] } },
  "4": { class_type: "CLIPTextEncode", inputs: { text: "blurry", clip: ["1", 1] } },
  "5": { class_type: "KSampler", inputs: { seed: 98765, positive: ["3", 0], negative: ["4", 0], model: ["2", 0] } },
};

test("findet Prompt, Negativ-Prompt, Checkpoint, LoRA und Dateinamen", () => {
  const t = buildSearchText({ localPath: "Out/Bild_01.png", workflowJSON: JSON.stringify(prompt) });
  for (const w of ["red fox", "blurry", "juggernaut", "detailtweaker", "bild_01"]) {
    assert.ok(t.includes(w), w);
  }
});

test("durchsucht nicht das rohe JSON (Seed, Klassennamen)", () => {
  const t = buildSearchText({ localPath: "a.png", workflowJSON: JSON.stringify(prompt) });
  assert.ok(!t.includes("98765"));
  assert.ok(!t.includes("ksampler"));
});

test("kaputtes oder fehlendes JSON liefert nur den Dateinamen", () => {
  assert.equal(buildSearchText({ localPath: "X.png", workflowJSON: "{nope" }), "x.png");
  assert.equal(buildSearchText({ localPath: "X.png" }), "x.png");
  assert.equal(buildSearchText({ localPath: "X.png", workflowJSON: "[1]" }), "x.png");
});
