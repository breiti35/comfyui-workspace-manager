/**
 * Testvorbereitung, per `node --import` vor den Tests geladen:
 *  1. Resolve-Hook fuer endungslose TS-Importe registrieren.
 *  2. Die Browser-Globals bereitstellen, die der ui-Code voraussetzt.
 */

import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);

// Der Anwendungscode meldet Aenderungen ueber window-Events. Im Test genuegt
// ein Minimal-Fenster, das die Events mitschreibt.
if (typeof globalThis.window === "undefined") {
  const listeners = new Map();
  globalThis.__dispatchedEvents = [];
  globalThis.window = {
    dispatchEvent(event) {
      globalThis.__dispatchedEvents.push(event.type);
      (listeners.get(event.type) ?? []).forEach((fn) => fn(event));
      return true;
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(type) ?? [];
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    localStorage: undefined,
  };
}

if (typeof globalThis.localStorage === "undefined") {
  const speicher = new Map();
  globalThis.localStorage = {
    getItem: (k) => (speicher.has(k) ? speicher.get(k) : null),
    setItem: (k, v) => speicher.set(k, String(v)),
    removeItem: (k) => speicher.delete(k),
    clear: () => speicher.clear(),
  };
  globalThis.window.localStorage = globalThis.localStorage;
}
