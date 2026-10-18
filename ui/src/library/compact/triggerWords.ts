import { getCivitModelDetail } from "../../model-manager/api/civitDetailApi";

// Trigger words come from the Civitai model detail (cached 2 days in
// indexdb by getCivitModelDetail). The list is long, so lookups run at most
// two at a time and only for rows that scrolled into view.

/** Model folders whose models can carry trigger words. */
export const TRIGGER_TYPES = new Set([
  "loras",
  "lycoris",
  "embeddings",
  "checkpoints",
  "hypernetworks",
]);

const MAX_PARALLEL = 2;
let running = 0;
const waiting: (() => void)[] = [];

function slot<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      running++;
      job()
        .then(resolve, reject)
        .finally(() => {
          running--;
          waiting.shift()?.();
        });
    };
    if (running < MAX_PARALLEL) start();
    else waiting.push(start);
  });
}

const cache = new Map<string, Promise<string[]>>();

export function fetchTriggerWords(
  modelId: string,
  versionId?: string,
): Promise<string[]> {
  const key = `${modelId}:${versionId ?? ""}`;
  let p = cache.get(key);
  if (!p) {
    p = slot(async () => {
      const detail = await getCivitModelDetail(modelId);
      if (!detail) {
        cache.delete(key); // network hiccup: allow a retry later
        return [];
      }
      const versions = detail.modelVersions ?? [];
      const v =
        versions.find((x) => String(x.id) === versionId) ?? versions[0];
      const words = (v?.trainedWords ?? [])
        .map((w) => w.trim())
        .filter(Boolean);
      return Array.from(new Set(words));
    }).catch(() => {
      cache.delete(key);
      return [] as string[];
    });
    cache.set(key, p);
  }
  return p;
}
