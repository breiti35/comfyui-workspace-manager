import { useSyncExternalStore } from "react";

// State of the compact (docked) bar, kept at module level so the active area,
// the search text per area and the scroll position survive the bar being
// unmounted (undock to the window and dock again, or a closed library).

export type CompactSection =
  | "live"
  | "models"
  | "prompts"
  | "workflows"
  | "gallery"
  | "downloads"
  | "settings";
/** All areas, in cabinet order. Which of them show is up to dockSections.ts. */
export const COMPACT_SECTIONS: readonly CompactSection[] = [
  "live",
  "models",
  "prompts",
  "workflows",
  "gallery",
  "downloads",
  "settings",
];

const KEY = "workspaceManager.library.compactSection";

function readSection(): CompactSection {
  try {
    const v = localStorage.getItem(KEY);
    if ((COMPACT_SECTIONS as readonly string[]).includes(v ?? ""))
      return v as CompactSection;
  } catch {
    /* storage unavailable: start on live */
  }
  return "live";
}

let section: CompactSection = readSection();
const search: Partial<Record<CompactSection, string>> = {};
const scroll: Partial<Record<CompactSection, number>> = {};
let searchVersion = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function setCompactSection(s: CompactSection) {
  section = s;
  try {
    localStorage.setItem(KEY, s);
  } catch {
    /* per-viewer convenience only */
  }
  emit();
}
export function useCompactSection(): CompactSection {
  return useSyncExternalStore(subscribe, () => section);
}

export function setCompactSearch(s: CompactSection, value: string) {
  search[s] = value;
  searchVersion++;
  emit();
}
export function useCompactSearch(s: CompactSection): string {
  useSyncExternalStore(subscribe, () => searchVersion);
  return search[s] ?? "";
}

export function saveCompactScroll(s: CompactSection, top: number) {
  scroll[s] = top;
}
export function getCompactScroll(s: CompactSection): number {
  return scroll[s] ?? 0;
}
