import { createContext } from "react";
import type { LibrarySection } from "../libraryContext";

/** Undock to the window and open `section` (on the entry `key`, if given). */
export type OpenInLibrary = (section: LibrarySection, key?: string) => void;

export const OpenInLibraryContext = createContext<OpenInLibrary>(() => {});
