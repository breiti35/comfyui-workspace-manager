/**
 * Funktionstests fuer den Navigations-Stack der Workspace-Ansichten.
 *
 * routeStack.ts haelt keinen Modul-State - jede Funktion bekommt den
 * aktuellen Stack als Parameter und gibt den naechsten zurueck (reine
 * Funktionen, keine Mocks noetig).
 *
 * Zentraler Regressionsfall fuer diese Datei: popRoute auf einer tieferen
 * Ebene (z.B. drei Ebenen tief) muss genau eine Ebene zurueckgehen, nicht
 * bis auf "root" durchfallen - der erste Test unten haelt genau das fest.
 *
 * modelList und installModels sind seit dem Panel-Zusammenbau ein
 * Geschwisterpaar (zwei Reiter desselben Panels, siehe die Tests im
 * Abschnitt "Geschwister-Routen" weiter unten) und ersetzen einander statt
 * sich zu stapeln. Die uebrigen Tests in dieser Datei verwenden deshalb
 * bewusst andere Routenpaare (z.B. gallery/settings), um allgemeine
 * Stack-Mechanik zu pruefen, ohne versehentlich die Geschwister-Sonderregel
 * mitzutesten.
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

test("popRoute auf einer tieferen Ebene kehrt genau eine Ebene zurueck, nicht bis root (Canvas -> Galerie -> Einstellungen -> Einstellungen schliessen)", () => {
  let stack = initialRouteStack();
  stack = pushRoute(stack, "gallery");
  stack = pushRoute(stack, "settings");
  assert.deepEqual(stack, ["root", "gallery", "settings"]);

  // Nutzer schliesst die oberste Ebene (z.B. per Zurueck-Button).
  const nachSchliessen = popRoute(stack);

  assert.equal(
    currentRoute(nachSchliessen),
    "gallery",
    "nach dem Schliessen von 'settings' muss 'gallery' wieder obenauf liegen, nicht 'root'",
  );
  assert.deepEqual(nachSchliessen, ["root", "gallery"]);
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
  const stack: WorkspaceRoute[] = ["root", "recentFlows"];
  const result = pushRoute(stack, "gallery");

  assert.deepEqual(result, ["root", "recentFlows", "gallery"]);
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
  stack = pushRoute(stack, "gallery");
  stack = pushRoute(stack, "recentFlows");
  stack = popRoute(stack); // recentFlows schliessen
  stack = pushRoute(stack, "settings");
  stack = pushRoute(stack, "promptLibrary");
  assert.deepEqual(stack, ["root", "gallery", "settings", "promptLibrary"]);

  stack = popRoute(stack);
  stack = popRoute(stack);
  stack = popRoute(stack);
  stack = popRoute(stack);

  assert.deepEqual(stack, ["root"]);
  assert.equal(currentRoute(stack), "root");
});

// --- Geschwister-Routen: modelList <-> installModels ersetzen sich statt
// sich zu stapeln -------------------------------------------------------
//
// "Meine Modelle" und "Modell hinzufuegen" sind seit dem Panel-Merge zwei
// Reiter desselben Panels, keine getrennten Ansichten mehr. modelList und
// installModels muessen sich deshalb auf derselben Stack-Ebene ersetzen -
// sonst oeffnet z.B. ein openRoute("installModels") von ausserhalb des
// Panels (frueher der inzwischen entfernte MissingModelsListDrawer) den
// Reiter, waehrend "modelList" schon offen ist und der Stack waechst auf drei Eintraege
// (["root","modelList","installModels"]). Das X im Panel poppt dann nur
// eine Ebene und das Panel bleibt sichtbar - fuer den Nutzer sieht es aus,
// als wuerde "Schliessen" nicht funktionieren.

test("installModels ueber bereits offenem modelList (z.B. per openRoute von ausserhalb des Panels) ersetzt den Reiter statt ihn zu stapeln - sonst schliesst das X das Panel nicht mehr vollstaendig", () => {
  const stack: WorkspaceRoute[] = ["root", "modelList"];
  const result = pushRoute(stack, "installModels");

  assert.deepEqual(
    result,
    ["root", "installModels"],
    "installModels muss modelList auf derselben Ebene ersetzen, nicht obendrauf gestapelt werden",
  );
});

test("modelList ueber bereits offenem installModels ersetzt ebenso den Reiter statt zu stapeln (Gegenrichtung)", () => {
  const stack: WorkspaceRoute[] = ["root", "installModels"];
  const result = pushRoute(stack, "modelList");

  assert.deepEqual(result, ["root", "modelList"]);
});

test("nach einem Geschwister-Wechsel fuehrt ein einziges popRoute zurueck auf [root] - das ist es, was der Nutzer beim Schliessen tatsaechlich sieht", () => {
  let stack = initialRouteStack();
  stack = pushRoute(stack, "modelList");
  stack = pushRoute(stack, "installModels"); // Geschwister-Wechsel, kein Stapeln

  const nachEinmaligemSchliessen = popRoute(stack);

  assert.deepEqual(nachEinmaligemSchliessen, ["root"]);
});

test("liegt das Geschwister tiefer im Stack (z.B. unter gallery), wird auf dessen Position ersetzt und alles darueber verworfen", () => {
  const stack: WorkspaceRoute[] = ["root", "modelList", "gallery"];
  const result = pushRoute(stack, "installModels");

  assert.deepEqual(result, ["root", "installModels"]);
});

test("die Geschwister-Regel greift nicht bei fremden Routen - diese stapeln weiterhin normal", () => {
  const stack: WorkspaceRoute[] = ["root", "gallery"];
  const result = pushRoute(stack, "settings");

  assert.deepEqual(result, ["root", "gallery", "settings"]);
  assert.equal(result.length, 3, "settings ist kein Geschwister von gallery und muss sich stapeln");
});

test("pushRoute derselben Route wie oben liefert weiterhin die unveraenderte Eingabe-Referenz, auch fuer Geschwister-Routen (eine Route ist ihr eigenes Geschwister)", () => {
  const stackModelList: WorkspaceRoute[] = ["root", "modelList"];
  assert.strictEqual(pushRoute(stackModelList, "modelList"), stackModelList);

  const stackInstallModels: WorkspaceRoute[] = ["root", "installModels"];
  assert.strictEqual(pushRoute(stackInstallModels, "installModels"), stackInstallModels);
});

test("der Geschwister-Wechsel per pushRoute veraendert das uebergebene Array nicht", () => {
  const stack: WorkspaceRoute[] = ["root", "modelList", "gallery"];
  const vorher = [...stack];

  pushRoute(stack, "installModels");

  assert.deepEqual(stack, vorher, "Inhalt darf sich nicht aendern");
  assert.equal(stack.length, vorher.length, "Laenge darf sich nicht aendern");
});

test('pushRoute(stack, "root") bleibt ein voller Reset, auch wenn ein Geschwister (modelList/installModels) im Stack liegt', () => {
  const stack: WorkspaceRoute[] = ["root", "modelList", "installModels"];
  const result = pushRoute(stack, "root");

  assert.deepEqual(result, ["root"]);
  assert.equal(result.length, 1);
});
