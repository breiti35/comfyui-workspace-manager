import { useEffect, useRef, useState } from "react";
import type { PreviewImageFrame } from "./GalleryContext.ts";
// @ts-ignore - ComfyUI's own api singleton (the existing WebSocket); we
// attach to it rather than opening a second connection.
import { api } from "/scripts/api.js";

interface Options {
  // Called shortly after a run writes a saved output image, so the gallery can
  // refresh its saved-image lists (the plugin writes the media record on the
  // "executed" event for type "output" - see App.tsx).
  onSavedMediaChanged?: () => void;
}

interface ComfyImageRef {
  filename?: string;
  subfolder?: string;
  type?: string;
}

/**
 * Surfaces the images produced by ComfyUI "Preview Image" nodes. Those nodes
 * write to the temp dir (type "temp") and are emitted on the "executed" event,
 * but the plugin never persists them (App.tsx only stores type "output"), so
 * they'd otherwise never appear in the gallery. We show the finished preview
 * here via ComfyUI's native `/view` route - no file, no db entry, purely
 * transient UI state that stays until the next run replaces it.
 */
export function usePreviewImage({ onSavedMediaChanged }: Options = {}) {
  const [frames, setFrames] = useState<PreviewImageFrame[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const savedCbRef = useRef(onSavedMediaChanged);
  savedCbRef.current = onSavedMediaChanged;

  useEffect(() => {
    if (!api?.addEventListener) return;

    let reloadTimer: ReturnType<typeof setTimeout>;

    const viewURL = (im: ComfyImageRef) => {
      const params = new URLSearchParams({
        filename: im.filename ?? "",
        subfolder: im.subfolder ?? "",
        type: im.type ?? "temp",
        // Cache-buster: a re-run can reuse the same temp filename, so force
        // the browser to refetch the new image.
        rand: `${Date.now()}`,
      });
      return api.apiURL(`/view?${params.toString()}`);
    };

    const onStart = () => setIsGenerating(true);

    const onExecuted = (e: any) => {
      const output = e?.detail?.output;
      const images: ComfyImageRef[] = [
        ...(output?.images ?? []),
        ...(output?.gifs ?? []),
      ];
      if (!images.length) return;

      // "Preview Image" node -> temp dir. Show it as the transient preview.
      const previews = images.filter((im) => im.type === "temp");
      if (previews.length) {
        setFrames(
          previews.map((im, i) => ({
            id: `${im.subfolder ?? ""}/${im.filename ?? ""}#${i}`,
            url: viewURL(im),
            nodeId: e?.detail?.node,
          })),
        );
        setIsGenerating(false);
      }

      // "Save Image" node -> output dir. The plugin creates the media record;
      // give it a beat, then refresh the saved lists so it shows up under
      // "Dieser Workflow".
      if (images.some((im) => im.type === "output")) {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => savedCbRef.current?.(), 600);
      }
    };

    const onDone = () => setIsGenerating(false);

    api.addEventListener("execution_start", onStart);
    api.addEventListener("executed", onExecuted);
    api.addEventListener("execution_success", onDone);
    api.addEventListener("execution_error", onDone);
    api.addEventListener("execution_interrupted", onDone);

    return () => {
      clearTimeout(reloadTimer);
      api.removeEventListener("execution_start", onStart);
      api.removeEventListener("executed", onExecuted);
      api.removeEventListener("execution_success", onDone);
      api.removeEventListener("execution_error", onDone);
      api.removeEventListener("execution_interrupted", onDone);
    };
  }, []);

  return { frames, isGenerating };
}
