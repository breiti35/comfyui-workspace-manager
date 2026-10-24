// Captures the API-format prompt graph of a finished run so it can be stored
// with the Media record (the gallery search reads it via Media.workflowJSON).

/** Find the prompt for `promptId` in a ComfyUI `/queue` response. */
export function findPromptInQueue(queue: any, promptId: string): any | null {
  for (const key of ["queue_running", "queue_pending"]) {
    const list = queue?.[key];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (Array.isArray(entry) && entry[1] === promptId) {
        const p = entry[2];
        return p && typeof p === "object" ? p : null;
      }
    }
  }
  return null;
}

const MAX_CACHE = 20;
const cache = new Map<string, string>();

/** Remember a serialized prompt per prompt_id; keeps the cache small. */
export function cachePrompt(promptId: string, json: string) {
  cache.delete(promptId);
  cache.set(promptId, json);
  while (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function getCachedPrompt(promptId: string): string | undefined {
  return cache.get(promptId);
}
