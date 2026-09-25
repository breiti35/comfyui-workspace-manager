import { indexdb } from "../db-tables/indexdb";
import type { Model } from "../types/dbTypes";
import {
  fetchCivitModelFromHashKey,
  isNsfwBlurEligibleCategory,
  runCivitCacheMigrationOnce,
} from "../utils/civitUtils";
import { mapWithConcurrency } from "../utils/asyncPool";
import type { ModelsListRespItemFromApi } from "./types";

/** Parallel Civitai hash lookups per sync run - see mapWithConcurrency. */
export const CIVIT_LOOKUP_CONCURRENCY = 4;

/** Fired on window after indexdb.models has been updated by a sync run. */
export const MODELS_DB_SYNCED_EVENT = "model_list_updated";

export function modelDbId(item: { model_name: string; model_type: string }) {
  return item.model_name + "@" + item.model_type;
}

/** The parts of a Civitai hash lookup result a Model record takes over. */
export interface CivitLookup {
  modelName?: string | null;
  versionName?: string;
  baseModel?: string;
  civitModelID?: string;
  civitModelVersionID?: string;
  imageUrl?: string | null;
  imageIsNsfw?: boolean;
  transient?: boolean;
}

/**
 * Decides whether a model needs a Civitai hash lookup in this sync run.
 * (Pure - exported for tests.)
 *
 *  - no hash yet: nothing to look up (the backend is still hashing).
 *  - existing record with the same hash AND a Civitai match: done, keep it.
 *  - everything else (new file, changed hash, or a previous miss): look up.
 *    A previous miss is NOT final - fetchCivitModelFromHashKey answers from
 *    its cache until the negative-cache TTL expires and only then asks
 *    Civitai again, so a model uploaded to Civitai later still gets matched.
 */
export function needsCivitLookup(
  item: Pick<ModelsListRespItemFromApi, "file_hash">,
  existing: Model | undefined,
): boolean {
  if (!item.file_hash) return false;
  if (!existing || existing.fileHash !== item.file_hash) return true;
  return !existing.civitModelID;
}

/**
 * Builds the record to store for one backend list entry. (Pure - exported
 * for tests.) Merges instead of replacing, so fields other code wrote
 * (e.g. downloadUrl) survive a sync. `lookup` is the hash lookup result, or
 * undefined when none ran; a transient lookup (rate limit, network) never
 * overwrites what we already knew.
 */
export function buildModelRecord(
  item: ModelsListRespItemFromApi,
  existing: Model | undefined,
  lookup: CivitLookup | undefined,
): Model {
  // No hash in the list means "not hashed (yet)" - e.g. right after a
  // backend rescan - not "different file", so keep what we already know.
  const hash = item.file_hash ?? existing?.fileHash ?? null;
  // A different hash means a different file under the same name - the old
  // Civitai match no longer applies.
  const sameFile = existing != null && existing.fileHash === hash;
  const base: Model = {
    ...(sameFile ? existing : {}),
    downloadUrl: existing?.downloadUrl,
    id: modelDbId(item),
    modelName: sameFile ? existing!.modelName : null,
    fileHash: hash,
    fileFolder: item.model_type,
    fileName: item.model_name + item.model_extension,
  };
  if (!lookup || lookup.transient) return base;
  return {
    ...base,
    modelName: lookup.modelName ?? null,
    versionName: lookup.versionName,
    baseModel: lookup.baseModel,
    civitModelID: lookup.civitModelID,
    civitModelVersionID: lookup.civitModelVersionID,
    imageUrl: lookup.imageUrl ?? null,
    // Only checkpoints/loras can ever be blurred, and only on a confirmed
    // Civitai NSFW hit - see civitUtils.ts.
    imageIsNsfw:
      isNsfwBlurEligibleCategory(item.model_type) &&
      (lookup.imageIsNsfw ?? false),
  };
}

/** Ids stored locally that the backend list no longer contains. (Pure.) */
export function vanishedIds(
  storedIds: readonly string[],
  currentIds: ReadonlySet<string>,
): string[] {
  return storedIds.filter((id) => !currentIds.has(id));
}

// Shared by every caller (websocket handler in ModelManagerTopbar, HTTP
// result in useUpdateModels): each run takes a new generation, and a run
// that notices a newer one started simply stops - it would only write
// older data over newer.
let generation = 0;

/**
 * Mirrors the backend's model list into indexdb.models: adds/updates every
 * listed model (with a throttled Civitai hash lookup where needed) and
 * removes records whose file vanished. Returns false when the run was
 * superseded by a newer one and wrote nothing.
 */
export async function syncModelsToDb(
  list: ModelsListRespItemFromApi[],
): Promise<boolean> {
  const myGeneration = ++generation;
  const isStale = () => myGeneration !== generation;

  // One-time reset of stale NSFW caches from earlier fix iterations, before
  // this sync repopulates indexdb.models with the current logic (it clears
  // the table, so it must not run after us).
  await runCivitCacheMigrationOnce();
  if (isStale()) return false;

  const ids = list.map(modelDbId);
  const existingList = await indexdb.models.bulkGet(ids);
  if (isStale()) return false;

  const records = await mapWithConcurrency(
    list,
    CIVIT_LOOKUP_CONCURRENCY,
    async (item, i) => {
      const existing = existingList[i] ?? undefined;
      let lookup: CivitLookup | undefined;
      if (needsCivitLookup(item, existing)) {
        try {
          lookup = await fetchCivitModelFromHashKey(item.file_hash!);
        } catch (e) {
          lookup = undefined; // keep what we have, retry next run
        }
      }
      return buildModelRecord(item, existing, lookup);
    },
    isStale,
  );
  if (isStale()) return false;

  const currentIds = new Set(ids);
  await indexdb.transaction("rw", indexdb.models, async () => {
    // Re-read the stored ids inside the transaction: ModelItem may have
    // added a record while our lookups ran.
    const storedIds = (await indexdb.models.toCollection().primaryKeys()) as string[];
    await indexdb.models.bulkPut(records.filter((r): r is Model => r != null));
    const gone = vanishedIds(storedIds, currentIds);
    if (gone.length) await indexdb.models.bulkDelete(gone);
  });

  window.dispatchEvent(new CustomEvent(MODELS_DB_SYNCED_EVENT));
  return true;
}
