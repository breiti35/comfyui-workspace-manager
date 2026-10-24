import { createContext } from "react";
import type { Media } from "../types/dbTypes.ts";

export type GallerySection = "workflow" | "all" | "preview";

/**
 * A transient preview frame produced by a ComfyUI "Preview Image" node. The
 * node writes to the temp dir (type "temp") and emits it on the "executed"
 * event; we show it here WITHOUT creating a file or db entry - exactly like
 * the node itself. `url` points at ComfyUI's native `/view?...&type=temp`
 * route (see usePreviewImage / GalleryPreviewImage).
 */
export interface PreviewImageFrame {
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
  /** Multi-select mode: tiles toggle selection instead of opening detail. */
  selectMode: boolean;
  selectedIds: ReadonlySet<string>;
  toggleSelect: (id: string) => void;
}

export const GalleryContext = createContext<GalleryContextProps>({
  curMedia: null,
  setCurMedia(): void {},
  openDetail(): void {},
  closeDetail(): void {},
  removeMedia(): void {},
  selectMode: false,
  selectedIds: new Set<string>(),
  toggleSelect(): void {},
});
