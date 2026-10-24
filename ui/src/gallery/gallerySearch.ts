import { extractLiveParams } from "../library/compact/liveParams";
import type { Media } from "../types/dbTypes";

/**
 * Lower-cased searchable text of one image: file name plus the real
 * metadata (positive/negative prompt, checkpoint, LoRAs) taken from the
 * prompt graph in `workflowJSON`. Never the raw JSON. Pure function.
 */
export function buildSearchText(m: {
  localPath?: string;
  workflowJSON?: string;
}): string {
  const parts: string[] = [m.localPath ?? ""];
  if (m.workflowJSON) {
    try {
      const prompt = JSON.parse(m.workflowJSON);
      if (prompt && typeof prompt === "object" && !Array.isArray(prompt)) {
        const p = extractLiveParams(prompt);
        parts.push(p.positive, p.negative, p.model, p.loras);
      }
    } catch {
      // not a prompt graph / invalid JSON: only the file name is searchable
    }
  }
  return parts.filter(Boolean).join("\n").toLowerCase();
}

/** Index once per list (memoize with useMemo); filter is a cheap includes. */
export function buildSearchIndex(list: Media[]): Map<string, string> {
  return new Map(list.map((m) => [m.id, buildSearchText(m)]));
}

export function matchesQuery(
  index: Map<string, string>,
  id: string,
  query: string,
): boolean {
  return index.get(id)?.includes(query) ?? false;
}
