/**
 * Tests fuer die Galerie-Mehrfachauswahl (gallery/gallerySelection.ts)
 * und das Prompt-Mitschreiben (gallery/promptCapture.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  allSelected,
  selectedVisibleIds,
  toggleSelection,
} from "../../ui/src/gallery/gallerySelection.ts";
import {
  cachePrompt,
  findPromptInQueue,
  getCachedPrompt,
} from "../../ui/src/gallery/promptCapture.ts";

test("toggleSelection schaltet um und mutiert nicht", () => {
  const a = new Set(["x"]);
  const b = toggleSelection(a, "y");
  assert.deepEqual([...b].sort(), ["x", "y"]);
  assert.equal(a.size, 1);
  assert.deepEqual([...toggleSelection(b, "x")], ["y"]);
});

test("selectedVisibleIds ignoriert ausgeblendete", () => {
  assert.deepEqual(selectedVisibleIds(new Set(["a", "z"]), ["a", "b"]), ["a"]);
});

test("allSelected", () => {
  assert.equal(allSelected(new Set(["a", "b"]), ["a", "b"]), true);
  assert.equal(allSelected(new Set(["a"]), ["a", "b"]), false);
  assert.equal(allSelected(new Set(["a"]), []), false);
});

test("findPromptInQueue findet Prompt (Index 2) in running und pending", () => {
  const p = { "1": { class_type: "KSampler", inputs: {} } };
  const q = {
    queue_running: [[1, "p1", p, {}, []]],
    queue_pending: [[2, "p2", { "9": {} }, {}, []]],
  };
  assert.equal(findPromptInQueue(q, "p1"), p);
  assert.deepEqual(findPromptInQueue(q, "p2"), { "9": {} });
  assert.equal(findPromptInQueue(q, "nope"), null);
  assert.equal(findPromptInQueue(null, "p1"), null);
});

test("Prompt-Cache bleibt klein", () => {
  for (let i = 0; i < 50; i++) cachePrompt("id" + i, "{}");
  assert.equal(getCachedPrompt("id0"), undefined);
  assert.equal(getCachedPrompt("id49"), "{}");
});
