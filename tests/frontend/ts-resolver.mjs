/**
 * Resolve-Hook fuer Node's Testlauf.
 *
 * Der Anwendungscode importiert wie in Vite ueblich ohne Dateiendung
 * (`import { fetchApi } from "../Api"`). Node loest das von sich aus nicht auf,
 * weil es in ESM keine Endungs-Ergaenzung gibt. Dieser Hook haengt die
 * passende TypeScript-Endung an, sodass die ui/src-Module im Test ohne
 * Bundler ladbar sind. Node selbst entfernt die Typannotationen beim Laden
 * (Type-Stripping ab Node 22/23) - es wird also nichts kompiliert.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const KANDIDATEN = [".ts", ".tsx", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, nextResolve) {
  const hatEndung = /\.(ts|tsx|js|mjs|cjs|json|css)$/.test(specifier);
  if (specifier.startsWith(".") && !hatEndung && context.parentURL) {
    for (const endung of KANDIDATEN) {
      const kandidat = new URL(specifier + endung, context.parentURL);
      if (existsSync(fileURLToPath(kandidat))) {
        return nextResolve(specifier + endung, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
