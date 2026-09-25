/**
 * Funktionstests fuer den app-weiten Download-Store.
 *
 * Der Store haelt den Fortschritt von Modell-Downloads jetzt ausserhalb des
 * Install-Panels (App.tsx statt InstallModelsModal), weil das Panel-Schliessen
 * bisher die Fortschritts-Listener und den Zustand mit sich riss, obwohl der
 * Download im Backend weiterlief. Dieser Test faengt genau die Faelle, in
 * denen ein Regress dahin unbemerkt bliebe.
 *
 * Der Store bindet sich an zwei Module, die hier durch Fakes ersetzt werden:
 *  - "../../utils/comfyapp" (api.addEventListener/removeEventListener) -> ein
 *    Fake, der die registrierten Listener einsammelt, damit der Test
 *    Backend-Ereignisse ("download_progress", "download_error") selbst
 *    ausloesen kann.
 *  - "../../Api" (cancelDownload) -> zeichnet nur die Aufrufe auf.
 *
 * Aufruf (siehe tests/README.md):
 *   node --experimental-transform-types --experimental-test-module-mocks \
 *        --disable-warning=ExperimentalWarning \
 *        --import ./tests/frontend/setup.mjs \
 *        --test tests/frontend/downloadStore.test.ts
 */

import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// --- Fake-api, dessen Listener der Test selbst ausloesen kann -------------
let registered: Record<string, ((e: { detail: unknown }) => void)[]> = {};

const fakeApi = {
  addEventListener(type: string, cb: (e: { detail: unknown }) => void) {
    (registered[type] ??= []).push(cb);
  },
  removeEventListener(type: string, cb: (e: { detail: unknown }) => void) {
    registered[type] = (registered[type] ?? []).filter((f) => f !== cb);
  },
};

/** Simuliert ein Backend-Ereignis, indem alle registrierten Handler feuern. */
function fire(type: string, detail: unknown) {
  (registered[type] ?? []).forEach((cb) => cb({ detail }));
}

// --- Fake fuer cancelDownload ----------------------------------------------
const cancelCalls: string[] = [];
async function fakeCancelDownload(savePath: string) {
  cancelCalls.push(savePath);
}

let store: typeof import("../../ui/src/model-manager/install-models/downloadStore.ts");

before(async () => {
  mock.module("../../ui/src/utils/comfyapp.ts", {
    namedExports: { api: fakeApi },
  });
  mock.module("../../ui/src/Api.ts", {
    namedExports: { cancelDownload: fakeCancelDownload },
  });
  store = await import("../../ui/src/model-manager/install-models/downloadStore.ts");
});

beforeEach(() => {
  registered = {};
  cancelCalls.length = 0;
  // Setzt auch `started` zurueck - startDownloadTracking() muss also pro Test
  // neu aufgerufen werden, wenn der Test Ereignisse ausloesen will.
  store.__resetDownloadStore();
});

// --- startDownloadTracking -------------------------------------------------

test("startDownloadTracking ist idempotent - mehrfacher Aufruf registriert keine weiteren Listener", () => {
  store.startDownloadTracking();
  store.startDownloadTracking();
  store.startDownloadTracking();

  assert.equal(
    (registered["download_progress"] ?? []).length,
    1,
    "download_progress darf nur einmal registriert werden",
  );
  assert.equal(
    (registered["download_error"] ?? []).length,
    1,
    "download_error darf nur einmal registriert werden",
  );
});

// --- download_progress -------------------------------------------------

test("download_progress fuellt active: fileName aus save_path abgeleitet (auch bei Windows-Backslashes), eta berechnet", () => {
  store.startDownloadTracking();

  fire("download_progress", [
    {
      save_path: "C:\\models\\checkpoints\\foo.safetensors",
      progress: 40,
      total: 1000,
      downloaded: 400,
      speed: 100,
    },
    {
      save_path: "/models/loras/bar.safetensors",
      progress: 10,
      total: 500,
      downloaded: 50,
      speed: 50,
    },
  ]);

  const snap = store.getDownloadSnapshot();
  assert.equal(snap.active.length, 2);

  const foo = snap.active.find((a) => a.savePath.endsWith("foo.safetensors"))!;
  assert.equal(foo.fileName, "foo.safetensors", "Windows-Pfad muss auf den Dateinamen gekuerzt werden");
  assert.equal(foo.eta, (1000 - 400) / 100, "eta = Restbytes / Geschwindigkeit");

  const bar = snap.active.find((a) => a.savePath.endsWith("bar.safetensors"))!;
  assert.equal(bar.fileName, "bar.safetensors");
  assert.equal(bar.eta, (500 - 50) / 50);
});

test("download_progress ohne total/speed liefert kein eta", () => {
  store.startDownloadTracking();

  fire("download_progress", [{ save_path: "/models/foo.safetensors", progress: 5 }]);

  const snap = store.getDownloadSnapshot();
  assert.equal(snap.active[0].eta, undefined);
});

test("leere Queue heisst alles fertig - active und pending werden geleert", () => {
  store.startDownloadTracking();
  store.markDownloadStarted("wartend.safetensors");
  fire("download_progress", [{ save_path: "/models/laeuft.safetensors", progress: 50 }]);

  assert.ok(store.getDownloadSnapshot().active.length > 0, "Vorbedingung: es laeuft etwas");

  fire("download_progress", []);

  const snap = store.getDownloadSnapshot();
  assert.deepEqual(snap.active, []);
  assert.deepEqual(snap.pending, []);
});

// --- markDownloadStarted -------------------------------------------------

test("markDownloadStarted setzt einen pending-Eintrag, doppelter Aufruf dupliziert nicht", () => {
  store.startDownloadTracking();
  store.markDownloadStarted("neu.safetensors");
  store.markDownloadStarted("neu.safetensors");

  assert.deepEqual(store.getDownloadSnapshot().pending, ["neu.safetensors"]);
});

test("pending-Eintrag verschwindet erst, nachdem der Name in einer Queue war und wieder draus verschwunden ist", () => {
  store.startDownloadTracking();
  store.markDownloadStarted("foo.safetensors");

  // Taucht in der Queue auf - waehrend des Laufs bleibt der pending-Marker
  // bestehen (jetzt durch den active-Eintrag gedeckt).
  fire("download_progress", [{ save_path: "/models/foo.safetensors", progress: 10 }]);
  assert.deepEqual(store.getDownloadSnapshot().pending, ["foo.safetensors"]);

  // Verschwindet wieder aus der Queue (nur noch eine andere Datei laeuft) -
  // das heisst fertig, der pending-Marker muss weg sein.
  fire("download_progress", [{ save_path: "/models/bar.safetensors", progress: 5 }]);
  assert.deepEqual(store.getDownloadSnapshot().pending, []);
});

test("ein Name, der noch nie in einer Queue war, bleibt in pending", () => {
  store.startDownloadTracking();
  store.markDownloadStarted("wird-noch-vorbereitet.safetensors");

  // Eine andere Datei laeuft bereits - der Backend braucht fuer unseren
  // Namen offenbar noch, um die URL aufzuloesen.
  fire("download_progress", [{ save_path: "/models/andere.safetensors", progress: 1 }]);

  assert.deepEqual(store.getDownloadSnapshot().pending, ["wird-noch-vorbereitet.safetensors"]);
});

// --- download_error -------------------------------------------------

test("download_error leert pending, laesst active unangetastet und zaehlt tick hoch", () => {
  store.startDownloadTracking();
  store.markDownloadStarted("scheitert-sofort.safetensors");
  fire("download_progress", [
    { save_path: "/models/laeuft-weiter.safetensors", progress: 20, total: 100, downloaded: 20 },
  ]);

  fire("download_error", "netzwerkfehler");

  let snap = store.getDownloadSnapshot();
  assert.deepEqual(snap.pending, [], "optimistischer Marker muss weg sein");
  assert.equal(snap.active.length, 1, "laufende Downloads bleiben unberuehrt");
  assert.equal(snap.active[0].fileName, "laeuft-weiter.safetensors");
  assert.equal(snap.lastError?.message, "netzwerkfehler");
  assert.equal(snap.lastError?.tick, 1);

  fire("download_error", "netzwerkfehler");
  snap = store.getDownloadSnapshot();
  assert.equal(snap.lastError?.tick, 2, "gleicher Fehlertext muss ueber tick unterscheidbar bleiben");
});

test("download_error maskiert den Civitai-API-Key (token=...) vor der Anzeige", () => {
  store.startDownloadTracking();
  const key = "abcdef1234567890abcdef1234567890";
  fire(
    "download_error",
    `401 for https://civitai.com/api/download/models/1?token=${key}&type=Model`,
  );
  const msg = store.getDownloadSnapshot().lastError?.message ?? "";
  assert.ok(!msg.includes(key), "der Key darf nie im Toast-Text landen");
  assert.match(msg, /token=\*\*\*&type=Model/);
});

// --- overallProgress -------------------------------------------------

test("overallProgress gewichtet nach Dateigroesse, wenn alle Eintraege total haben", () => {
  store.startDownloadTracking();
  fire("download_progress", [
    { save_path: "/a", progress: 50, total: 100, downloaded: 50 },
    { save_path: "/b", progress: 10, total: 900, downloaded: 90 },
  ]);

  // (50 + 90) / (100 + 900) * 100 = 14
  assert.ok(
    Math.abs(store.overallProgress() - 14) < 1e-9,
    `erwartet ~14, war ${store.overallProgress()}`,
  );
});

test("overallProgress ist der einfache Mittelwert, wenn nicht alle Eintraege total haben", () => {
  store.startDownloadTracking();
  fire("download_progress", [
    { save_path: "/a", progress: 50, total: 100, downloaded: 50 },
    { save_path: "/b", progress: 10 },
  ]);

  // kein total bei "/b" -> Groessengewichtung entfaellt, einfacher Mittelwert
  assert.equal(store.overallProgress(), 30);
});

test("overallProgress ist 0, wenn nichts laeuft", () => {
  assert.equal(store.overallProgress(), 0);
});

// --- statForFile -------------------------------------------------

test("statForFile findet den passenden Eintrag oder liefert undefined", () => {
  store.startDownloadTracking();
  fire("download_progress", [{ save_path: "/models/foo.safetensors", progress: 33 }]);

  assert.equal(store.statForFile("foo.safetensors")?.progress, 33);
  assert.equal(store.statForFile("nicht-vorhanden.safetensors"), undefined);
  assert.equal(store.statForFile(undefined), undefined);
});

// --- requestCancel -------------------------------------------------

test("requestCancel reicht genau den savePath an cancelDownload durch", () => {
  store.requestCancel("C:\\models\\checkpoints\\foo.safetensors");

  assert.deepEqual(cancelCalls, ["C:\\models\\checkpoints\\foo.safetensors"]);
});

// --- subscribeDownloads -------------------------------------------------

test("subscribeDownloads benachrichtigt bei Aenderungen, Abmelden stoppt zuverlaessig", () => {
  store.startDownloadTracking();
  let rufe = 0;
  const unsubscribe = store.subscribeDownloads(() => {
    rufe++;
  });

  fire("download_progress", [{ save_path: "/a", progress: 1 }]);
  assert.equal(rufe, 1);

  unsubscribe();
  fire("download_progress", [{ save_path: "/a", progress: 2 }]);
  assert.equal(rufe, 1, "nach dem Abmelden darf der Listener nicht mehr aufgerufen werden");
});

test("derselbe Download taucht nur einmal in der Liste auf", () => {
  // Zweimal auf "Installieren" geklickt: das Backend meldet denselben
  // Zielpfad doppelt. Doppelte Zeilen waeren nicht nur verwirrend, sie
  // kollidieren auch als React-Key.
  store.startDownloadTracking();
  fire("download_progress", [
    { save_path: "C:\models\a.safetensors", progress: 10 },
    { save_path: "C:\models\a.safetensors", progress: 10 },
    { save_path: "C:\models\b.safetensors", progress: 0 },
  ]);
  const pfade = store.getDownloadSnapshot().active.map((a) => a.savePath);
  assert.deepEqual(pfade, ["C:\models\a.safetensors", "C:\models\b.safetensors"]);
});
