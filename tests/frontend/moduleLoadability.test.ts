/**
 * Ladbarkeitstest fuer alle Logik-Module unter ui/src.
 *
 * Hintergrund: Node entfernt beim Type-Stripping nur reine Typannotationen,
 * laesst Wert-Importe aber stehen. Eine Zeile wie
 *
 *   import { Foo } from "../bar";     // Foo ist in Wahrheit ein reiner Typ
 *
 * fuehrt deshalb zur Ladezeit zu einem SyntaxError ("does not provide an
 * export named 'Foo'"), obwohl Vite/esbuild anstandslos baut - dort werden
 * Typ-only-Importe anhand der Typinfos automatisch entfernt. Korrekt waere
 * `import type { Foo } from "../bar"`. Das betrifft aktuell zahlreiche
 * Dateien im Projekt und macht sie fuer node --test unerreichbar.
 *
 * Dieser Test laedt jedes .ts-Logikmodul unter ui/src per dynamischem
 * import() und haelt fest, welche Module (noch) nicht laden. Er ist bewusst
 * KEIN Funktionstest der Module selbst, sondern nur ein ehrlicher
 * Ladbarkeits-Nachweis fuer den Ist-Zustand. Ein spaeteres "Sweep"-Paket
 * stellt die betroffenen Importe auf `import type` um; danach sollten immer
 * mehr der unten aufgefuehrten Module aus der Fehlerliste verschwinden.
 *
 * Umfang: alle *.ts-Dateien unter ui/src, rekursiv gesammelt (kein
 * Abtippen einer Liste, damit kuenftig hinzukommende Module automatisch
 * erfasst werden).
 *
 *  - KEINE *.tsx: die brauchen ein DOM/React-Rendering und sind hier nicht
 *    das Ziel.
 *  - KEINE *.d.ts: das sind reine Ambient-Typdeklarationen, die nie als
 *    Laufzeitmodul geladen werden (Vite/esbuild bauen daraus nichts - sie
 *    dienen ausschliesslich dem Typchecker). Ein import() darauf waere ein
 *    Kategorienfehler: types/dbTypes... nein, z.B. types/workspace.d.ts
 *    scheitert unter Node an "TypeScript enum is not supported" bzw.
 *    litegraph.d.ts an "'const' declarations must be initialized" - beides
 *    Deklarations-Syntax, die ausserhalb eines .d.ts nicht vorkaeme und mit
 *    dem import-type-Problem nichts zu tun hat.
 *
 * Aufruf (siehe tests/README.md):
 *   node --experimental-transform-types --experimental-test-module-mocks \
 *        --disable-warning=ExperimentalWarning \
 *        --import ./tests/frontend/setup.mjs \
 *        --test tests/frontend/moduleLoadability.test.ts
 */

import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const UI_SRC = path.resolve(HIER, "../../ui/src");

/**
 * Sammelt rekursiv alle *.ts-Dateien unter `dir` - ohne *.tsx, ohne *.d.ts
 * (Begruendung siehe Datei-Kommentar oben). Pfade werden relativ zu UI_SRC
 * mit "/" als Trenner zurueckgegeben, damit die Ausnahmeliste unten
 * plattformunabhaengig funktioniert (auch unter Windows).
 */
function sammleModule(dir: string): string[] {
  let ergebnis: string[] = [];
  for (const eintrag of fs.readdirSync(dir, { withFileTypes: true })) {
    const vollpfad = path.join(dir, eintrag.name);
    if (eintrag.isDirectory()) {
      ergebnis = ergebnis.concat(sammleModule(vollpfad));
    } else if (
      eintrag.isFile() &&
      eintrag.name.endsWith(".ts") &&
      !eintrag.name.endsWith(".d.ts")
    ) {
      ergebnis.push(path.relative(UI_SRC, vollpfad).split(path.sep).join("/"));
    }
  }
  return ergebnis;
}

/**
 * Ausnahmeliste: Module, die HEUTE nachweislich aus einem ANDEREN Grund als
 * dem import-type-Problem nicht laden - meist weil sie echten Browser- bzw.
 * ComfyUI-Laufzeitkontext brauchen, den es unter Node schlicht nicht gibt.
 * Jeder Eintrag wurde einzeln anhand der tatsaechlich geworfenen
 * Fehlermeldung geprueft (nicht anhand von Vermutungen). Faellt einer davon
 * spaeter doch erfolgreich durch, schlaegt der zweite Test unten
 * ("verwaiste Ausnahme") an - dann muss der Eintrag hier raus.
 *
 * Bewusst NICHT hier drin: alles, dessen heutige Fehlermeldung auf eine
 * Kaskade durch ein anderes, ebenfalls fehlerhaftes Modul zurueckgeht (z.B.
 * "TypeScript enum is not supported" beim Import von types/dbTypes.ts als
 * Wert statt als Typ). Auch wenn ein Teil dieser Kaskaden nach dem
 * import-type-Sweep vermutlich weiterhin rot bleibt, waere eine Aufnahme
 * hier - ohne pro Datei zu verifizieren, ob NICHT doch ein simpler
 * import-type-Fehler die Ursache ist - genau das Verstecken des
 * Typ-Problems, vor dem diese Datei ausdruecklich warnt.
 */
const AUSNAHMEN = new Map<string, string>([
  [
    "gallery/previewImageStore.ts",
    "importiert ComfyUI-Interna '/scripts/api.js' direkt - dieses Modul " +
      "existiert nur im Browser (von ComfyUI zur Laufzeit bereitgestellt), " +
      "nicht unter Node. Verifiziert: Error \"Cannot find module " +
      "'.../scripts/api.js'\".",
  ],
  [
    "gallery/usePreviewImage.ts",
    "importiert previewImageStore.ts (s.o.) als Wert und haengt damit am " +
      "selben ComfyUI-Interna-Import - der geworfene Fehler wird explizit " +
      "auf previewImageStore.ts als Quelle zurueckgefuehrt.",
  ],
  [
    "model-manager/api/modelsApi.ts",
    "importiert ComfyUI-Interna '/scripts/api.js' direkt - selbe " +
      "Begruendung wie gallery/previewImageStore.ts.",
  ],
  [
    "model-manager/hooks/useUpdateModels.ts",
    "importiert ComfyUI-Interna '/scripts/api.js' direkt - selbe " +
      "Begruendung wie gallery/previewImageStore.ts.",
  ],
  [
    "utils/showAlert.ts",
    "importiert eine .css-Datei direkt (`import \"./showAlert.css\"`, ein " +
      "Vite-Asset-Import). Node hat keinen Loader fuer CSS. Verifiziert: " +
      "\"Unknown file extension '.css'\".",
  ],
]);

type Ladeergebnis =
  | { pfad: string; status: "erfolgreich"; modul: Record<string, unknown> }
  | { pfad: string; status: "fehlgeschlagen"; fehler: unknown };

let alleModule: string[] = [];
let ergebnisse: Ladeergebnis[] = [];

before(async () => {
  alleModule = sammleModule(UI_SRC).sort();

  const settled = await Promise.allSettled(
    alleModule.map((relPfad) => {
      const url = pathToFileURL(path.join(UI_SRC, relPfad)).href;
      return import(url);
    }),
  );

  ergebnisse = settled.map((r, i) => {
    const pfad = alleModule[i];
    if (r.status === "fulfilled") {
      return { pfad, status: "erfolgreich", modul: r.value };
    }
    return { pfad, status: "fehlgeschlagen", fehler: r.reason };
  });

  // Aufraeumen: Module, die beim Laden einen echten `new BroadcastChannel(...)`
  // anlegen (frueher topbar/TabBroadcastChannel.ts, inzwischen entfernt).
  // Node haelt dafuer den Event-Loop offen - ohne .close() wuerde der
  // Testprozess nie von selbst beenden. Generisch
  // gehalten (nicht an den Dateipfad gebunden), damit kuenftige Module mit
  // demselben Muster automatisch mit abgeraeumt werden.
  for (const r of ergebnisse) {
    if (r.status !== "erfolgreich") continue;
    for (const wert of Object.values(r.modul)) {
      if (typeof BroadcastChannel !== "undefined" && wert instanceof BroadcastChannel) {
        wert.close();
      }
    }
  }
});

/** Fehlersignatur fuer die Gruppierung: Konstruktorname + volle Meldung. */
function fehlersignatur(fehler: unknown): string {
  if (fehler instanceof Error) {
    return `${fehler.constructor.name}: ${fehler.message}`;
  }
  return String(fehler);
}

/**
 * Baut eine gruppierte, lesbare Fehlerausgabe: pro eindeutiger
 * Fehlermeldung ein Block mit allen betroffenen Modulpfaden. Begrenzt die
 * Anzahl angezeigter Pfade auf `maxPfade`, nennt aber immer die
 * Gesamtzahl und weist auf die Kuerzung hin.
 */
function formatiereFehlerBericht(
  fehlgeschlagen: { pfad: string; fehler: unknown }[],
  maxPfade = 60,
): string {
  const gruppen = new Map<string, string[]>();
  for (const { pfad, fehler } of fehlgeschlagen) {
    const sig = fehlersignatur(fehler);
    if (!gruppen.has(sig)) gruppen.set(sig, []);
    gruppen.get(sig)!.push(pfad);
  }

  const sortierteGruppen = [...gruppen.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );

  const zeilen: string[] = [];
  zeilen.push(
    `${fehlgeschlagen.length} von ${alleModule.length} Modulen unter ui/src konnten nicht geladen werden:`,
    "",
  );

  let angezeigtePfade = 0;
  let gekuerzt = false;
  for (const [sig, pfade] of sortierteGruppen) {
    if (angezeigtePfade >= maxPfade) {
      gekuerzt = true;
      break;
    }
    zeilen.push(`[${pfade.length}x] ${sig}`);
    for (const pfad of pfade) {
      if (angezeigtePfade >= maxPfade) {
        gekuerzt = true;
        break;
      }
      zeilen.push(`  - ${pfad}`);
      angezeigtePfade++;
    }
    zeilen.push("");
  }

  if (gekuerzt) {
    zeilen.push(
      `... Ausgabe gekuerzt auf ${maxPfade} von ${fehlgeschlagen.length} fehlgeschlagenen Modulpfaden.`,
    );
  }

  return zeilen.join("\n");
}

test("jedes Logik-Modul unter ui/src ausserhalb der Ausnahmeliste laedt per dynamischem import()", () => {
  assert.ok(alleModule.length > 0, "sammleModule() hat kein einziges Modul gefunden - stimmt UI_SRC?");

  const unerwartetFehlgeschlagen = ergebnisse.filter(
    (r): r is { pfad: string; status: "fehlgeschlagen"; fehler: unknown } =>
      r.status === "fehlgeschlagen" && !AUSNAHMEN.has(r.pfad),
  );

  assert.deepEqual(
    unerwartetFehlgeschlagen.map((r) => r.pfad),
    [],
    unerwartetFehlgeschlagen.length > 0
      ? formatiereFehlerBericht(unerwartetFehlgeschlagen)
      : undefined,
  );
});

test("jeder Eintrag der Ausnahmeliste existiert wirklich und laedt weiterhin NICHT (keine verwaiste Ausnahme)", () => {
  const fehlendeDateien = [...AUSNAHMEN.keys()].filter(
    (pfad) => !alleModule.includes(pfad),
  );
  assert.deepEqual(
    fehlendeDateien,
    [],
    `Ausnahmeliste verweist auf Dateien, die sammleModule() nicht (mehr) findet: ${fehlendeDateien.join(", ")}`,
  );

  const nunLadbar = ergebnisse.filter(
    (r) => r.status === "erfolgreich" && AUSNAHMEN.has(r.pfad),
  );

  assert.deepEqual(
    nunLadbar.map((r) => r.pfad),
    [],
    nunLadbar.length > 0
      ? "Diese Module stehen in der Ausnahmeliste, laden inzwischen aber " +
        "erfolgreich - die Begruendung ist ueberholt, Eintrag bitte aus " +
        "AUSNAHMEN entfernen:\n" +
        nunLadbar.map((r) => `  - ${r.pfad}`).join("\n")
      : undefined,
  );
});
