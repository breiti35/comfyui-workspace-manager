/**
 * Funktionstests fuer den DE/EN-Sprachumschalter.
 *
 * Die Uebersetzungen sind ein reines Datenobjekt - genau die Sorte Code, wo
 * ein vergessener Schluessel niemandem auffaellt, bis im deutschen UI ploetzlich
 * ein englischer Fetzen steht. Diese Tests pruefen die Vollstaendigkeit
 * maschinell.
 *
 * Laeuft mit dem eingebauten Test-Runner von Node (>= 22), ohne zusaetzliche
 * Abhaengigkeiten:  node --test tests/frontend/
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { translations } from "../../ui/src/i18n/translations.ts";

const en = translations.en as Record<string, string>;
const de = translations.de as Record<string, string>;

test("es gibt ueberhaupt Uebersetzungen", () => {
  assert.ok(Object.keys(en).length > 100, "EN-Woerterbuch ist verdaechtig klein");
  assert.ok(Object.keys(de).length > 100, "DE-Woerterbuch ist verdaechtig klein");
});

test("jeder englische Schluessel hat eine deutsche Entsprechung", () => {
  const fehlend = Object.keys(en).filter((key) => !(key in de));
  assert.deepEqual(
    fehlend,
    [],
    `Ohne DE-Wert faellt die Oberflaeche auf Englisch zurueck: ${fehlend.join(", ")}`,
  );
});

test("es gibt keine verwaisten deutschen Schluessel", () => {
  const verwaist = Object.keys(de).filter((key) => !(key in en));
  assert.deepEqual(
    verwaist,
    [],
    `Diese DE-Schluessel zeigen ins Leere: ${verwaist.join(", ")}`,
  );
});

test("keine leeren Uebersetzungen", () => {
  const leer: string[] = [];
  for (const [key, wert] of Object.entries(de)) {
    if (typeof wert !== "string" || wert.trim() === "") leer.push(`de.${key}`);
  }
  for (const [key, wert] of Object.entries(en)) {
    if (typeof wert !== "string" || wert.trim() === "") leer.push(`en.${key}`);
  }
  assert.deepEqual(leer, [], `Leere Werte: ${leer.join(", ")}`);
});

test("deutsche Texte benutzen echte Umlaute statt ASCII-Ersatz", () => {
  // Projektvorgabe: keine Ersatzschreibungen wie "fuer" oder "loeschen".
  const ersatzschreibung =
    /\b(fuer|ueber|ueberschreiben|koenn\w*|loesch\w*|groess\w*|muess\w*|aender\w*|oeffn\w*|waehl\w*|zurueck|naechst\w*|urspruengl\w*|hinzufuegen|schliess\w*|ausfuehr\w*)\b/i;

  const treffer: string[] = [];
  for (const [key, wert] of Object.entries(de)) {
    const m = wert.match(ersatzschreibung);
    if (m) treffer.push(`${key}: "${m[0]}"`);
  }
  assert.deepEqual(
    treffer,
    [],
    `ASCII-Ersatz statt Umlaut gefunden:\n  ${treffer.join("\n  ")}`,
  );
});

test("Platzhalter stimmen zwischen den Sprachen ueberein", () => {
  // z.B. {count} oder {name} - fehlt der Platzhalter in einer Sprache,
  // steht dort spaeter eine Luecke im Satz.
  const platzhalter = (s: string) =>
    (s.match(/\{\w+\}/g) ?? []).slice().sort().join(",");

  const abweichungen: string[] = [];
  for (const key of Object.keys(en)) {
    if (!(key in de)) continue;
    const a = platzhalter(en[key]);
    const b = platzhalter(de[key]);
    if (a !== b) abweichungen.push(`${key}: EN[${a}] vs DE[${b}]`);
  }
  assert.deepEqual(
    abweichungen,
    [],
    `Platzhalter passen nicht:\n  ${abweichungen.join("\n  ")}`,
  );
});

test("die in dieser Ausbaustufe ergaenzten Bereiche sind uebersetzt", () => {
  // Regressionsschutz fuer die zuletzt gebauten Oberflaechen: Topbar,
  // Prompt-Bibliothek, CivArchive-Fallback, Download-Anzeige.
  const praefixe = [
    "topbar.",
    "prompts.",
    "models.civArchive.",
    "gallery.",
    "apikey.",
    "install.",
    "settings.",
    "drawer.",
  ];
  for (const praefix of praefixe) {
    const keys = Object.keys(en).filter((k) => k.startsWith(praefix));
    assert.ok(keys.length > 0, `Keine Schluessel fuer "${praefix}" vorhanden`);
    const ohneDe = keys.filter((k) => !de[k]);
    assert.deepEqual(ohneDe, [], `"${praefix}" ist unvollstaendig: ${ohneDe}`);
  }
});
