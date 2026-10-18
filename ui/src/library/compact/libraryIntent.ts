import { useEffect, useRef, useSyncExternalStore } from "react";

// "Open in library" from the compact bar: the bar undocks into the window and
// the target section picks the entry up once it is mounted and has loaded its
// list. A tiny module-level hand-over, because the section mounts lazily and
// may not exist yet when the bar asks for it.

export type IntentSection = "modelList" | "promptLibrary" | "gallery";
interface Intent {
  section: IntentSection;
  key: string;
}

let intent: Intent | null = null;
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function setLibraryIntent(next: Intent | null) {
  intent = next;
  version++;
  listeners.forEach((l) => l());
}

/**
 * Call from a library section. When an intent for `section` is pending and
 * `ready` is true (list loaded), `handle(key)` runs once and the intent is
 * consumed - also when the key matches nothing, so it can't fire later.
 */
export function useLibraryIntent(
  section: IntentSection,
  ready: boolean,
  handle: (key: string) => void,
) {
  const v = useSyncExternalStore(subscribe, () => version);
  const handleRef = useRef(handle);
  handleRef.current = handle;
  useEffect(() => {
    if (!ready || !intent || intent.section !== section) return;
    const { key } = intent;
    intent = null;
    handleRef.current(key);
  }, [v, ready, section]);
}
