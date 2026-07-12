import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  getPreviewImageSnapshot,
  subscribePreviewImage,
} from "./previewImageStore.ts";

interface Options {
  // Called shortly after a run writes a saved output image, so the gallery can
  // refresh its saved-image lists while it's open.
  onSavedMediaChanged?: () => void;
}

/**
 * Reads the app-level preview-image store (populated by
 * startPreviewImageCapture in App.tsx). Because capture runs at app level, the
 * latest "Preview Image" node output is available even if it was produced
 * while the gallery was closed.
 */
export function usePreviewImage({ onSavedMediaChanged }: Options = {}) {
  const snap = useSyncExternalStore(
    subscribePreviewImage,
    getPreviewImageSnapshot,
  );

  const cbRef = useRef(onSavedMediaChanged);
  cbRef.current = onSavedMediaChanged;
  const lastTick = useRef(snap.savedTick);

  useEffect(() => {
    if (snap.savedTick !== lastTick.current) {
      lastTick.current = snap.savedTick;
      cbRef.current?.();
    }
  }, [snap.savedTick]);

  return { frames: snap.frames, isGenerating: snap.isGenerating };
}
