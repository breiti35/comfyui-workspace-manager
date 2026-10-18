import { createContext, useContext, useEffect } from "react";
import type { WorkspaceRoute } from "../types/types";

/** Routes that are sections of the library window. */
export type LibrarySection = Extract<
  WorkspaceRoute,
  | "recentFlows"
  | "gallery"
  | "promptLibrary"
  | "modelList"
  | "installModels"
  | "downloads"
  | "settings"
>;

export const LIBRARY_SECTIONS: readonly LibrarySection[] = [
  "recentFlows",
  "gallery",
  "promptLibrary",
  "modelList",
  "installModels",
  "downloads",
  "settings",
];

export function isLibrarySection(r: WorkspaceRoute): r is LibrarySection {
  return (LIBRARY_SECTIONS as readonly string[]).includes(r);
}

export interface LibraryContextValue {
  /** true while shown as the docked side panel instead of the window */
  docked: boolean;
  /** the X in the header: closes the whole library (resetRoutes) */
  closeAll: () => void;
  /**
   * Sections register their panel-local detail view here so Esc backs out of
   * it first (one level), before the library itself closes.
   */
  setSubLevel: (section: LibrarySection, close: (() => void) | null) => void;
}

export const LibraryContext = createContext<LibraryContextValue>({
  docked: false,
  closeAll: () => {},
  setSubLevel: () => {},
});

/**
 * Call from a section: while `isOpen`, Esc runs `close` instead of closing
 * the library. Replaces useModalSubLevelDismiss for embedded sections.
 */
export function useLibrarySubLevel(
  section: LibrarySection,
  isOpen: boolean,
  close: () => void,
) {
  const { setSubLevel } = useContext(LibraryContext);
  useEffect(() => {
    setSubLevel(section, isOpen ? close : null);
    return () => setSubLevel(section, null);
  }, [section, isOpen, close, setSubLevel]);
}
