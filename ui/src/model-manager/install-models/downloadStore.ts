import { cancelDownload } from "../../Api";
import { api } from "../../utils/comfyapp";

/**
 * App-level store for model downloads.
 *
 * The download state used to live inside InstallModelsModal, which meant it was
 * created and torn down with that panel: closing the panel dropped the progress
 * listeners and the state, even though the backend worker kept downloading. You
 * then had to reopen the panel and navigate back to the model to see anything -
 * and the cancel button was unreachable entirely.
 *
 * Same shape as previewImageStore for the same reason: capture has to start
 * from an ALWAYS-mounted component (App.tsx), never from a panel.
 */

export interface DownloadEntry {
  /** Full target path, as reported by the backend. Needed to cancel. */
  savePath: string;
  /** Just the file name - what the cards match against. */
  fileName: string;
  progress: number;
  /** Bytes per second (smoothed by the backend). */
  speed?: number;
  downloaded?: number;
  total?: number;
  /** Seconds remaining, derived from speed + bytes left. */
  eta?: number;
}

export interface DownloadError {
  message: string;
  /** Bumped per error so a consumer can react to repeats of the same text. */
  tick: number;
}

interface DownloadState {
  /** Downloads the backend is actively reporting progress for. */
  active: DownloadEntry[];
  /**
   * Files we've asked the backend to download that haven't shown up in a
   * progress queue yet (it may still be resolving the URL). Keeps the UI from
   * looking idle in that gap.
   */
  pending: string[];
  lastError: DownloadError | null;
}

const EMPTY: DownloadState = { active: [], pending: [], lastError: null };

let state: DownloadState = EMPTY;
const listeners = new Set<() => void>();
let started = false;
let errorTick = 0;

/**
 * File names that have appeared in a progress queue at least once, so we can
 * tell "finished" (was there, now gone) from "not started yet".
 */
const seen = new Set<string>();

const basename = (p: string) => p.replace(/^.*[\\/]/, "");

function setState(patch: Partial<DownloadState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function getDownloadSnapshot(): DownloadState {
  return state;
}

export function subscribeDownloads(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

interface ProgressPayload {
  save_path: string;
  progress: number;
  speed?: number;
  downloaded?: number;
  total?: number;
}

function toEntry(p: ProgressPayload): DownloadEntry {
  const eta =
    p.total && p.speed && p.speed > 0
      ? (p.total - (p.downloaded ?? 0)) / p.speed
      : undefined;
  return {
    savePath: p.save_path,
    fileName: basename(p.save_path),
    progress: p.progress,
    speed: p.speed,
    downloaded: p.downloaded,
    total: p.total,
    eta,
  };
}

/**
 * Subscribe to the backend's download events. Idempotent, so it is safe under
 * React StrictMode and repeated calls. Call once from App.tsx.
 */
export function startDownloadTracking(): void {
  if (started || !api?.addEventListener) return;
  started = true;

  api.addEventListener("download_progress", (e: { detail: ProgressPayload[] }) => {
    const queue = e.detail ?? [];

    // The worker emits an empty queue once it has drained every task, so
    // nothing is downloading anymore - drop all optimistic markers. This also
    // covers a download whose file the backend renamed via Content-Disposition
    // (its basename never matched, so the pruning below couldn't catch it),
    // which would otherwise leave a stuck overlay.
    if (queue.length === 0) {
      seen.clear();
      setState({ active: [], pending: [] });
      return;
    }

    // The backend reports the running download plus every queued task, and the
    // same target can legitimately appear twice (queueing the same file twice,
    // e.g. a double click on install). Collapse by target path so the UI shows
    // one row per file - duplicates would also collide as React keys.
    const seenPaths = new Set<string>();
    const active = queue
      .map(toEntry)
      .filter((entry) => {
        if (seenPaths.has(entry.savePath)) return false;
        seenPaths.add(entry.savePath);
        return true;
      });
    const activeNames = new Set(active.map((a) => a.fileName));
    activeNames.forEach((n) => seen.add(n));

    // Keep only markers that are either still running, or haven't appeared yet.
    setState({
      active,
      pending: state.pending.filter(
        (name) => activeNames.has(name) || !seen.has(name),
      ),
    });
  });

  api.addEventListener("download_error", (e: { detail: string }) => {
    errorTick += 1;
    // A download that fails before it ever entered a progress queue (e.g. a
    // gated model without an API key errors immediately) leaves its optimistic
    // marker behind, so clear those. Running downloads keep their own live
    // entries in `active`, which is deliberately left untouched.
    setState({
      pending: [],
      lastError: { message: String(e.detail), tick: errorTick },
    });
  });
}

/** Mark a file as requested, before the backend reports any progress for it. */
export function markDownloadStarted(fileName: string): void {
  seen.delete(fileName);
  if (state.pending.includes(fileName)) return;
  setState({ pending: [...state.pending, fileName] });
}

/** Ask the backend to abort a running download. */
export function requestCancel(savePath: string): void {
  cancelDownload(savePath);
}

/** True while anything is downloading or waiting to start. */
export function hasActivity(s: DownloadState = state): boolean {
  return s.active.length > 0 || s.pending.length > 0;
}

/** Combined progress across all running downloads, 0-100. */
export function overallProgress(s: DownloadState = state): number {
  if (!s.active.length) return 0;
  const withTotals = s.active.filter((a) => a.total);
  // Weight by size when the backend told us the sizes, else plain average.
  if (withTotals.length === s.active.length) {
    const total = withTotals.reduce((n, a) => n + (a.total ?? 0), 0);
    if (total > 0) {
      const done = withTotals.reduce((n, a) => n + (a.downloaded ?? 0), 0);
      return (done / total) * 100;
    }
  }
  return s.active.reduce((n, a) => n + a.progress, 0) / s.active.length;
}

/** What a card/row needs to render for one file, or undefined if it's idle. */
export function statForFile(
  fileName: string | undefined,
  s: DownloadState = state,
): DownloadEntry | undefined {
  if (!fileName) return undefined;
  return s.active.find((a) => a.fileName === fileName);
}

/** Test seam: drop all state and listeners. */
export function __resetDownloadStore(): void {
  state = EMPTY;
  seen.clear();
  errorTick = 0;
  listeners.clear();
  started = false;
}
