import { useSyncExternalStore } from "react";
import {
  getDownloadSnapshot,
  subscribeDownloads,
  hasActivity,
  overallProgress,
  statForFile,
  type DownloadEntry,
} from "./downloadStore";

/**
 * Reads the app-level download store (fed by startDownloadTracking in App.tsx).
 * Because tracking runs at app level, progress stays available no matter which
 * panel is open - or whether any is.
 */
export function useDownloads() {
  const snap = useSyncExternalStore(subscribeDownloads, getDownloadSnapshot);

  return {
    /** Downloads the backend is actively reporting. */
    active: snap.active,
    /** Requested but not yet reported by the backend. */
    pending: snap.pending,
    /** Latest failure, with a tick so repeats of the same text still register. */
    lastError: snap.lastError,
    isDownloading: hasActivity(snap),
    overallProgress: overallProgress(snap),
    statFor: (fileName?: string): DownloadEntry | undefined =>
      statForFile(fileName, snap),
  };
}
