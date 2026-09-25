/**
 * Funktionstests fuer createSequenceGuard (utils/requestSequence.ts).
 *
 * Ueber den langsamen RunPod-Proxy kommen Antworten oft in anderer
 * Reihenfolge an, als die Anfragen gestellt wurden. Der Guard sorgt dafuer,
 * dass nur die juengste Anfrage ihr Ergebnis anwenden darf - und dass eine
 * zwischenzeitlich per Websocket eingetroffene Liste nicht von einer aelteren
 * HTTP-Antwort ueberschrieben wird.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createSequenceGuard } from "../../ui/src/utils/requestSequence.ts";

test("nur die juengste Anfrage ist aktuell", () => {
  const guard = createSequenceGuard();
  const erste = guard.begin();
  const zweite = guard.begin();
  assert.equal(guard.isCurrent(erste), false, "aeltere Antwort wird verworfen");
  assert.equal(guard.isCurrent(zweite), true);
});

test("ein Websocket-Push macht laufende Anfragen veraltet", () => {
  const guard = createSequenceGuard();
  const http = guard.begin();
  guard.notePush();
  assert.equal(guard.isCurrent(http), false);
  // Eine nach dem Push gestartete Anfrage ist wieder aktuell.
  const neu = guard.begin();
  assert.equal(guard.isCurrent(neu), true);
});

test("invalidate verwirft alle offenen Anfragen (z.B. beim Unmount)", () => {
  const guard = createSequenceGuard();
  const offen = guard.begin();
  guard.invalidate();
  assert.equal(guard.isCurrent(offen), false);
});

test("Antworten in vertauschter Reihenfolge: die aeltere gewinnt nicht", async () => {
  const guard = createSequenceGuard();
  let angezeigt: string | null = null;
  const lade = async (name: string, ms: number) => {
    const ticket = guard.begin();
    await new Promise((r) => setTimeout(r, ms));
    if (guard.isCurrent(ticket)) angezeigt = name;
  };
  await Promise.all([lade("Seite 2 (alt, langsam)", 20), lade("Seite 1 (neu)", 1)]);
  assert.equal(angezeigt, "Seite 1 (neu)");
});
