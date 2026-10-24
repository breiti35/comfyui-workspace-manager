import { useSyncExternalStore } from "react";

// Per-image favorites, keyed by Media.id. Local only (localStorage), like the
// model favorites. A tiny store lets tile, detail toolbar and filter share
// one state without prop drilling.
const KEY = "WORKSPACE_GALLERY_FAVORITES";

function read(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
  } catch {
    return new Set();
  }
}

let current: Set<string> | null = null;
const listeners = new Set<() => void>();

function snapshot(): Set<string> {
  if (current == null) current = read();
  return current;
}

export function isGalleryFavorite(id: string): boolean {
  return snapshot().has(id);
}

export function toggleGalleryFavorite(id: string): boolean {
  const s = new Set(snapshot());
  if (s.has(id)) s.delete(id);
  else s.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    // storage unavailable: keep in-memory state only
  }
  current = s;
  listeners.forEach((l) => l());
  return s.has(id);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Reactive set of favorite media ids (new Set instance on every change). */
export function useGalleryFavorites(): Set<string> {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
