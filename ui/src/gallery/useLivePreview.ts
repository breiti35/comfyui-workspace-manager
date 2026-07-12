import { useEffect, useRef, useState } from "react";
import type { LivePreviewFrame } from "./GalleryContext.ts";
// @ts-ignore - ComfyUI's own api singleton (the existing WebSocket); we
// attach to it rather than opening a second connection.
import { api } from "/scripts/api.js";

interface Options {
  // Called shortly after a run produces output images, so the gallery can
  // refresh its saved-image lists (the plugin writes the media record on the
  // "executed" event - see App.tsx).
  onSavedMediaChanged?: () => void;
}

/**
 * Listens on ComfyUI's existing WebSocket (via its `api` singleton) for the
 * same binary preview frames its native "Show Image Feed" uses, and exposes
 * them as transient live-preview frames. Nothing here is persisted - frames
 * are object URLs kept only in state and revoked as soon as they're replaced
 * or the run ends.
 */
export function useLivePreview({ onSavedMediaChanged }: Options = {}) {
  const [frames, setFrames] = useState<LivePreviewFrame[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const urlsRef = useRef<string[]>([]);
  const savedCbRef = useRef(onSavedMediaChanged);
  savedCbRef.current = onSavedMediaChanged;

  useEffect(() => {
    if (!api?.addEventListener) return;

    const revokeAll = () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = [];
    };
    const clearLive = () => {
      revokeAll();
      setFrames([]);
      setIsGenerating(false);
    };

    let reloadTimer: ReturnType<typeof setTimeout>;

    const onPreview = (e: any) => {
      const blob = e?.detail;
      if (!(blob instanceof Blob)) return;
      const url = URL.createObjectURL(blob);
      // Keep only the latest preview frame; drop the previous object URL so
      // we don't leak memory during a long sampling run.
      revokeAll();
      urlsRef.current.push(url);
      setFrames([{ id: "live-preview", url }]);
      setIsGenerating(true);
    };
    const onStart = () => setIsGenerating(true);
    const onExecuting = (e: any) => {
      // detail is the executing node id, or null/undefined when the whole
      // prompt has finished.
      if (e?.detail == null) {
        clearLive();
      } else {
        setIsGenerating(true);
      }
    };
    const onExecuted = (e: any) => {
      const output = e?.detail?.output;
      const hasImages = output?.images?.length || output?.gifs?.length;
      if (!hasImages) return;
      // The plugin's own "executed" handler creates the media record
      // asynchronously; give it a beat, then let the gallery refresh so the
      // finished image shows up under the saved sections.
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => savedCbRef.current?.(), 600);
    };

    api.addEventListener("b_preview", onPreview);
    api.addEventListener("execution_start", onStart);
    api.addEventListener("executing", onExecuting);
    api.addEventListener("execution_success", clearLive);
    api.addEventListener("execution_error", clearLive);
    api.addEventListener("execution_interrupted", clearLive);
    api.addEventListener("executed", onExecuted);

    return () => {
      clearTimeout(reloadTimer);
      api.removeEventListener("b_preview", onPreview);
      api.removeEventListener("execution_start", onStart);
      api.removeEventListener("executing", onExecuting);
      api.removeEventListener("execution_success", clearLive);
      api.removeEventListener("execution_error", clearLive);
      api.removeEventListener("execution_interrupted", clearLive);
      api.removeEventListener("executed", onExecuted);
      revokeAll();
    };
  }, []);

  return { frames, isGenerating };
}
