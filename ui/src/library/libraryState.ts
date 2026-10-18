import { useSyncExternalStore } from "react";
import type { LibrarySection } from "./libraryContext";

// Small module-level store shared by the topbar (open / dock buttons) and the
// library host. Session state only; dock + width survive reloads through
// localStorage (a per-viewer convenience, so every access is guarded).

const DOCK_KEY = "workspaceManager.library.docked";
const WIDTH_KEY = "workspaceManager.library.dockWidth";
const SIDE_KEY = "workspaceManager.library.dockSide";
/** ComfyUI's own icon rail on the left; a left dock sits next to it. */
export const DOCK_LEFT_OFFSET = 60;
export const DOCK_MIN_WIDTH = 340;
export const DOCK_MAX_WIDTH = 900;

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: setting just won't persist */
  }
}

let docked = readLS(DOCK_KEY) === "1";
let dockWidth = Math.min(
  DOCK_MAX_WIDTH,
  Math.max(DOCK_MIN_WIDTH, Number(readLS(WIDTH_KEY)) || 460),
);
let dockSide: "left" | "right" = readLS(SIDE_KEY) === "left" ? "left" : "right";
let lastSection: LibrarySection = "modelList";
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function setLibraryDocked(v: boolean) {
  docked = v;
  writeLS(DOCK_KEY, v ? "1" : "0");
  emit();
}
export function setLibraryDockSide(s: "left" | "right") {
  dockSide = s;
  writeLS(SIDE_KEY, s);
  emit();
}
export function setLibraryDockWidth(w: number) {
  dockWidth = Math.min(DOCK_MAX_WIDTH, Math.max(DOCK_MIN_WIDTH, Math.round(w)));
  writeLS(WIDTH_KEY, String(dockWidth));
  emit();
}
export function rememberLibrarySection(s: LibrarySection) {
  lastSection = s;
}
/** Section the "Library" button reopens (last one used this session). */
export function getLastLibrarySection(): LibrarySection {
  return lastSection;
}

export function useLibraryDocked(): boolean {
  return useSyncExternalStore(subscribe, () => docked);
}
export function useLibraryDockSide(): "left" | "right" {
  return useSyncExternalStore(subscribe, () => dockSide);
}
export function useLibraryDockWidth(): number {
  return useSyncExternalStore(subscribe, () => dockWidth);
}
