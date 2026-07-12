import type { PreviewImageFrame } from "./GalleryContext.ts";
// @ts-ignore - ComfyUI's own api singleton (the existing WebSocket).
import { api } from "/scripts/api.js";

interface ComfyImageRef {
  filename?: string;
  subfolder?: string;
  type?: string;
}

interface PreviewState {
  frames: PreviewImageFrame[];
  isGenerating: boolean;
  // Bumped whenever a run writes a saved output image, so the gallery can
  // refresh its saved lists while it happens to be open.
  savedTick: number;
}

let state: PreviewState = { frames: [], isGenerating: false, savedTick: 0 };
const listeners = new Set<() => void>();
let started = false;

function setState(patch: Partial<PreviewState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function getPreviewImageSnapshot(): PreviewState {
  return state;
}

export function subscribePreviewImage(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function viewURL(im: ComfyImageRef): string {
  const params = new URLSearchParams({
    filename: im.filename ?? "",
    subfolder: im.subfolder ?? "",
    type: im.type ?? "temp",
    // Cache-buster: a re-run can reuse the same temp filename.
    rand: `${Date.now()}`,
  });
  return api.apiURL(`/view?${params.toString()}`);
}

/**
 * Starts listening on ComfyUI's existing WebSocket for "Preview Image" node
 * outputs and keeps the latest one in a module-level store. Idempotent (safe
 * under React StrictMode / repeated calls).
 *
 * Crucially this must be started from an ALWAYS-mounted component (App.tsx),
 * not from the gallery modal - otherwise previews produced while the gallery
 * is closed are never captured, which was exactly the bug.
 */
export function startPreviewImageCapture(): void {
  if (started || !api?.addEventListener) return;
  started = true;

  api.addEventListener("execution_start", () =>
    setState({ isGenerating: true }),
  );

  api.addEventListener("executed", (e: any) => {
    const output = e?.detail?.output;
    const images: ComfyImageRef[] = [
      ...(output?.images ?? []),
      ...(output?.gifs ?? []),
    ];
    if (!images.length) return;

    // "Preview Image" node -> temp dir. Keep it as the transient preview.
    const previews = images.filter((im) => im.type === "temp");
    if (previews.length) {
      setState({
        frames: previews.map((im, i) => ({
          id: `${im.subfolder ?? ""}/${im.filename ?? ""}#${i}`,
          url: viewURL(im),
          nodeId: e?.detail?.node,
        })),
        isGenerating: false,
      });
    }

    // "Save Image" node -> output dir. The plugin creates the media record;
    // signal the gallery (if open) to refresh its saved lists.
    if (images.some((im) => im.type === "output")) {
      setState({ savedTick: state.savedTick + 1 });
    }
  });

  const done = () => setState({ isGenerating: false });
  api.addEventListener("execution_success", done);
  api.addEventListener("execution_error", done);
  api.addEventListener("execution_interrupted", done);
}
