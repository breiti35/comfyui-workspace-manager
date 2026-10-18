import { useEffect, useSyncExternalStore } from "react";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";
import { COMPACT_SECTIONS, type CompactSection } from "./compactState";

// Which areas the docked bar's cabinet column shows. Stored in the user
// settings (dockSections), mirrored here so the bar and the settings switches
// update at once. Order is always COMPACT_SECTIONS; at least one stays on.

const EVENT = "dockSections";

function normalize(v: unknown): CompactSection[] {
  const list = Array.isArray(v) ? v : [];
  const out = COMPACT_SECTIONS.filter((s) => list.includes(s));
  return out.length ? out : [...COMPACT_SECTIONS];
}

let enabled: CompactSection[] = [...COMPACT_SECTIONS];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

function apply(next: CompactSection[]) {
  if (
    next.length === enabled.length &&
    next.every((s, i) => s === enabled[i])
  )
    return;
  enabled = next;
  emit();
}

async function load() {
  try {
    const v = await userSettingsTable?.getSetting("dockSections");
    loaded = true;
    apply(normalize(v));
  } catch {
    /* keep showing all areas */
  }
}

/** Switches one area on/off (ignored when it would leave none). */
export async function setDockSectionEnabled(s: CompactSection, on: boolean) {
  const prev = enabled;
  const next = COMPACT_SECTIONS.filter((x) =>
    x === s ? on : prev.includes(x),
  );
  if (!next.length) return;
  apply(next);
  try {
    await userSettingsTable?.upsert({ dockSections: next });
    window.dispatchEvent(new Event(EVENT));
  } catch (e) {
    console.error("Error saving setting dockSections:", e);
    apply(prev);
  }
}

/** The areas currently shown in the docked bar (cabinet order). */
export function useDockSections(): readonly CompactSection[] {
  useEffect(() => {
    if (!loaded) void load();
    const reload = () => void load();
    window.addEventListener(EVENT, reload);
    return () => window.removeEventListener(EVENT, reload);
  }, []);
  return useSyncExternalStore(subscribe, () => enabled);
}
