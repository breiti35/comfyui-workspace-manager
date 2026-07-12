import { createContext } from "react";
import type { Media } from "../types/dbTypes.ts";

export type GallerySection = "workflow" | "all" | "live";

/**
 * A transient, in-memory live preview frame streamed from ComfyUI's
 * WebSocket while a generation is running. These are NOT persisted - no file,
 * no db entry - they only live in UI state until the run finishes (see
 * useLivePreview / GalleryLivePreview). `url` is an object URL of the binary
 * preview blob.
 */
export interface LivePreviewFrame {
  id: string;
  url: string;
  nodeId?: string;
}

interface GalleryContextProps {
  curMedia: Media | null;
  setCurMedia: (media: Media | null) => void;
  /** Open the single-image detail view for a media item. */
  openDetail: (media: Media) => void;
  /** Return from the detail view back to the grid. */
  closeDetail: () => void;
  /** Drop a media item from the in-memory lists after it's deleted. */
  removeMedia: (id: string) => void;
}

export const GalleryContext = createContext<GalleryContextProps>({
  curMedia: null,
  setCurMedia(): void {},
  openDetail(): void {},
  closeDetail(): void {},
  removeMedia(): void {},
});
