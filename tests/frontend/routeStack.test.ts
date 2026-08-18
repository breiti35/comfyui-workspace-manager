/**
 * Funktionstests fuer den Navigations-Stack der Workspace-Ansichten.
 *
 * routeStack.ts haelt keinen Modul-State - jede Funktion bekommt den
 * aktuellen Stack als Parameter und gibt den naechsten zurueck (reine
 * Funktionen, keine Mocks noetig).
 *
 * Zentraler Anlassfall fuer diese Datei: Canvas -> Modellliste -> "Modell
 * installieren" oeffnen -> Installationsansicht wieder schliessen. Vorher
 * fiel das Ergebnis dabei auf "root" zurueck statt zur Modellliste - der
 * erste Test unten haelt genau das fest.
 *
 * Ausserdem geben mehrere Funktionen bei "keine Aenderung" bewusst die
 * unveraenderte Eingabe-Referenz zurueck (nicht nur inhaltlich gleiche neue
 * Arrays). React nutzt Referenzgleichheit, um Re-Renders abzubrechen - ein
 * Regress dort faellt im UI nicht sofort auf, kostet aber die Optimierung.
 * Deshalb pruefen die entsprechenden Tests per assert.strictEqual auf
 * Array-Identitaet, nicht nur per deepEqual auf Inhalt.
 *
 * Aufruf (siehe tests/README.md):
 *   node --experimental-test-module-mocks --import ./tests/frontend/setup.mjs \
 *        --test tests/frontend/routeStack.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ROOT_ROUTE,
  initialRouteStack,
  currentRoute,
  pushRoute,
  popRoute,
  resetRouteStack,
  routeStackSignature,
} from "../../ui/src/routeStack.ts";
import type { WorkspaceRoute } from "../../ui/src/types/types.ts";

// --- initialRouteStack / currentRoute -------------------------------------

test("initialRouteStack liefert genau [root]", () => {
  assert.deepEqual(initialRouteStack(), ["root"]);
  assert.equal(ROOT_ROUTE, "root");
});

test("currentRoute liefert die oberste Route des Stacks", () => {
  const stack: WorkspaceRoute[] = ["root", "modelList", "installModels"];
  assert.equal(currentRoute(stack), "installModels");
});

test("currentRoute bei leerem Stack faellt defensiv auf root zurueck statt zu werfen", () => {
  assert.doesNotThrow(() => currentRoute([]));
  assert.equal(currentRoute([]), "root");
});

// --- Der eigentliche Regressionsfall ---------------------------------------

test("Canvas -> Modellliste -> Modell installieren -> Installationsansicht schliessen: obenauf liegt wieder die Modellliste, nicht root", () => {
  let stack = initialRouteStack();
  stack = pushRoute(stack, "modelList");
  stack = pushRoute(stack, "installModels");
  assert.deepEqual(stack, ["root", "modelList", "installModels"]);

  // Nutzer schliesst die Installationsansicht (z.B. per Zurueck-Button).
  const nachSchliessen = popRoute(stack);

  assert.equal(
    currentRoute(nachSchliessen),
    "modelList",
    "nach dem Schliessen von 'installModels' muss 'modelList' wieder obenauf liegen, nicht 'root'",
  );
  assert.deepEqual(nachSchliessen, ["root", "modelList"]);
});

// --- Referenzgleichheit bei Nicht-Aenderungen ------------------------------

test("pushRoute derselben Route wie oben liefert die unveraenderte Eingabe-Referenz", () => {
  const stack: WorkspaceRoute[] = ["root", "modelList"];
  const result = pushRoute(stack, "modelList");
  assert.strictEqual(result, stack, "React soll hier keinen Re-Render fuer eine No-Op-Navigation ausloesen");
});

test("popRoute auf [root] liefert die unveraenderte Eingabe-Referenz", () => {
  const stack: WorkspaceRoute[] = ["root"];
  const result = popRoute(stack);
  assert.strictEqual(result, stack);
});

test("resetRouteStack auf [root] liefert die unveraenderte Eingabe-Referenz", () => {
  const stack: WorkspaceRoute[] = ["root"];
  const result = resetRouteStack(stack);
  assert.strictEqual(result, stack);
});

// --- Keine Mutation der Eingabe --------------------------------------------

test("pushRoute veraendert das uebergebene Array nicht", () => {
  const stack: WorkspaceRoute[] = ["root", "modelList"];
  const vorher = [...stack];

  pushRoute(stack, "installModels");

  assert.deepEqual(stack, vorher, "Inhalt darf sich nicht aendern");
  assert.equal(stack.length, vorher.length, "Laenge darf sich nicht aendern");
});

test("popRoute veraendert das uebergebene Array nicht", () => {
  const stack: WorkspaceRoute[] = ["root", "modelList", "installModels"];
  const vorher = [...stack];

  popRoute(stack);

  assert.deepEqual(stack, vorher);
  assert.equal(stack.length, vorher.length);
});

test("resetRouteStack veraendert das uebergebene Array nicht", () => {
  const stack: WorkspaceRoute[] = ["root", "modelList", "installModels"];
  const vorher = [...stack];

  resetRouteStack(stack);

  assert.deepEqual(stack, vorher);
  assert.equal(stack.length, vorher.length);
});

// --- Zurueckschneiden statt Duplizieren ------------------------------------

test("pushRoute auf eine bereits tiefer im Stack liegende Route schneidet zurueck statt anzuhaengen", () => {
  const stack: WorkspaceRoute[] = ["root", "modelList", "installModels"];
  const result = pushRoute(stack, "modelList");

  assert.deepEqual(result, ["root", "modelList"]);
  assert.notStrictEqual(result, stack, "Zurueckschneiden erzeugt ein neues Array");
  // Eingabe bleibt unangetastet.
  assert.deepEqual(stack, ["root", "modelList", "installModels"]);
});

test("zweimal dieselbe Route oeffnen laesst den Stack nicht wachsen (z.B. versionHistory ueber zwei UI-Einstiege)", () => {
  let stack: WorkspaceRoute[] = ["root", "gallery"];
  stack = pushRoute(stack, "versionHistory");
  assert.deepEqual(stack, ["root", "gallery", "versionHistory"]);

  // Zweiter Einstiegspunkt im UI oeffnet dieselbe Route erneut - sie ist
  // bereits oberstes Element, der Stack darf nicht auf vier Eintraege wachsen.
  const nachZweitemOeffnen = pushRoute(stack, "versionHistory");
  assert.strictEqual(nachZweitemOeffnen, stack);
  assert.equal(nachZweitemOeffnen.length, 3);
});

test("pushRoute haengt eine neue, noch nicht enthaltene Route an", () => {
  const stack: WorkspaceRoute[] = ["root", "modelList"];
  const result = pushRoute(stack, "installModels");

  assert.deepEqual(result, ["root", "modelList", "installModels"]);
  assert.notStrictEqual(result, stack);
});

// --- pushRoute(stack, "root") schliesst alles ------------------------------

test('pushRoute(stack, "root") schliesst alles, statt root obendrauf zu legen', () => {
  const stack: WorkspaceRoute[] = ["root", "modelList", "installModels"];
  const result = pushRoute(stack, "root");

  assert.deepEqual(result, ["root"]);
  assert.equal(result.length, 1, "root darf nicht als zweiter Eintrag obendrauf landen");
});

test('pushRoute(stack, "root") verhaelt sich wie resetRouteStack - liefert bei bereits [root] die unveraenderte Referenz', () => {
  const stack: WorkspaceRoute[] = ["root"];
  const result = pushRoute(stack, "root");

  assert.strictEqual(result, stack);
});

// --- Randfaelle -------------------------------------------------------------

test("popRoute auf leerem Array liefert die unveraenderte Referenz (Untergrenze greift auch bei Laenge 0)", () => {
  const leer: WorkspaceRoute[] = [];
  const result = popRoute(leer);

  assert.strictEqual(result, leer);
  assert.deepEqual(result, []);
});

test("mehrfaches popRoute bis zum Grund bleibt bei [root] stehen und unterschreitet sie nicht", () => {
  let stack: WorkspaceRoute[] = ["root", "modelList", "installModels"];
  stack = popRoute(stack);
  assert.deepEqual(stack, ["root", "modelList"]);
  stack = popRoute(stack);
  assert.deepEqual(stack, ["root"]);

  const amGrund = stack;
  stack = popRoute(stack);
  assert.deepEqual(stack, ["root"], "darf nicht unter [root] fallen");
  assert.strictEqual(stack, amGrund, "am Grund angekommen soll keine neue Referenz mehr entstehen");

  // Noch ein Aufruf zur Sicherheit - bleibt stabil.
  stack = popRoute(stack);
  assert.deepEqual(stack, ["root"]);
});

test("routeStackSignature verbindet einen tiefen Stack mit '>'", () => {
  const stack: WorkspaceRoute[] = ["root", "modelList", "installModels"];
  assert.equal(routeStackSignature(stack), "root>modelList>installModels");
});

test("routeStackSignature fuer [root] liefert schlicht 'root'", () => {
  assert.equal(routeStackSignature(["root"]), "root");
});

// --- Tiefe Kette vorwaerts und wieder vollstaendig zurueck -----------------

test("eine tiefe Kette vorwaerts und wieder vollstaendig zurueck endet exakt bei [root]", () => {
  let stack = initialRouteStack();
  stack = pushRoute(stack, "modelList");
  stack = pushRoute(stack, "installModels");
  stack = popRoute(stack); // installModels schliessen
  stack = pushRoute(stack, "settings");
  stack = pushRoute(stack, "promptLibrary");
  assert.deepEqual(stack, ["root", "modelList", "settings", "promptLibrary"]);

  stack = popRoute(stack);
  stack = popRoute(stack);
  stack = popRoute(stack);
  stack = popRoute(stack);

  assert.deepEqual(stack, ["root"]);
  assert.equal(currentRoute(stack), "root");
});
