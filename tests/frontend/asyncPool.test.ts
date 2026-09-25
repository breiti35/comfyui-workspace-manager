/**
 * Funktionstests fuer mapWithConcurrency (utils/asyncPool.ts).
 *
 * Der Pool drosselt die Civitai-Hash-Abfragen beim Modell-Sync: statt
 * hunderter gleichzeitiger Requests (Rate-Limit, langsamer RunPod-Proxy)
 * laufen hoechstens N parallel.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { mapWithConcurrency } from "../../ui/src/utils/asyncPool.ts";

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("nie mehr als `limit` Aufgaben gleichzeitig", async () => {
  let laufend = 0;
  let maximum = 0;
  const ergebnis = await mapWithConcurrency(
    Array.from({ length: 20 }, (_, i) => i),
    4,
    async (n) => {
      laufend++;
      maximum = Math.max(maximum, laufend);
      await warte(2);
      laufend--;
      return n * 2;
    },
  );
  assert.equal(maximum, 4);
  assert.deepEqual(
    ergebnis,
    Array.from({ length: 20 }, (_, i) => i * 2),
    "Reihenfolge der Ergebnisse entspricht der Eingabe",
  );
});

test("Reihenfolge bleibt erhalten, auch wenn spaetere Aufgaben frueher fertig sind", async () => {
  const ergebnis = await mapWithConcurrency([30, 1, 10, 2], 4, async (ms) => {
    await warte(ms);
    return ms;
  });
  assert.deepEqual(ergebnis, [30, 1, 10, 2]);
});

test("leere Eingabe und unsinnige Limits", async () => {
  assert.deepEqual(await mapWithConcurrency([], 4, async (x) => x), []);
  assert.deepEqual(await mapWithConcurrency([1, 2], 0, async (x) => x), [1, 2]);
});

test("shouldStop verhindert den Start weiterer Aufgaben", async () => {
  const gestartet: number[] = [];
  let stopp = false;
  await mapWithConcurrency(
    [0, 1, 2, 3, 4, 5],
    2,
    async (n) => {
      gestartet.push(n);
      if (n === 1) stopp = true;
      await warte(1);
    },
    () => stopp,
  );
  assert.deepEqual(gestartet, [0, 1], "nach dem Stopp-Signal startet nichts mehr");
});

test("ein Fehler weist den ganzen Pool zurueck (wie Promise.all)", async () => {
  await assert.rejects(
    mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("kaputt");
      return n;
    }),
    /kaputt/,
  );
});
