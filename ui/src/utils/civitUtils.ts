import { userSettingsTable } from "../db-tables/WorkspaceDB";
import { indexdb } from "../db-tables/indexdb";

const CIVIT_API_KEY_STORAGE_KEY = "WORKSPACE_CIVIT_API_KEY_STORAGE_KEY";
export function getCivitApiKey() {
  return localStorage.getItem(CIVIT_API_KEY_STORAGE_KEY);
}

export function setCivitApiKey(apiKey: string) {
  localStorage.setItem(CIVIT_API_KEY_STORAGE_KEY, apiKey);
}

/**
 * Since Civitai's April 2026 "Two Front Doors" split, civitai.com only
 * shows SFW content while civitai.red shows everything (SFW + adult).
 * Both domains share the same account/database and the same REST API
 * paths, so switching host is enough - no endpoint or param changes.
 * Defaults to civitai.com (SFW-only) unless the user opts in.
 */
export async function getCivitBaseUrl(): Promise<string> {
  const includeAdultContent = await userSettingsTable?.getSetting(
    "civitaiIncludeAdultContent",
  );
  return includeAdultContent ? "https://civitai.red" : "https://civitai.com";
}

export async function getCivitModelDownloadUrl(modelVersionID: string) {
  const baseUrl = await getCivitBaseUrl();
  return `${baseUrl}/api/download/models/${modelVersionID}`;
}

export async function getCivitModelPageUrl(
  modelID: string,
  modelVersionID?: string,
) {
  const baseUrl = await getCivitBaseUrl();
  if (!modelVersionID) {
    return `${baseUrl}/models/${modelID}`;
  }
  return `${baseUrl}/models/${modelID}?modelVersionId=${modelVersionID}`;
}

export function getHgModelInfoUrlFromDownloadUrl(downloadUrl: string) {
  if (!downloadUrl.includes("huggingface")) return;
  const infoPageUrl = downloadUrl.replace("/resolve/", "/blob/");
  return infoPageUrl;
}

interface ResponsePartial {
  id: number;
  modelId: number;
  name: string;
  model: {
    name: string;
    type: string;
    nsfw: boolean;
  };
  images: {
    url: string;
    nsfwLevel: number;
    width: number;
    height: number;
    hash: string;
  }[];
}

// Local ComfyUI model-folder categories where a Civitai NSFW confirmation
// is actually meaningful, i.e. folders that hold image-generating models.
// Everything else (vae, upscale_models, ultralytics_bbox, ultralytics_segm,
// ultralytics, sams, kjnodes_fonts, seedvr2, controlnet, etc.) is never
// blurred, no matter what a hash lookup returns - blurring a VAE or a face
// detector thumbnail makes no sense and just made the feature unusable.
const NSFW_BLUR_ELIGIBLE_CATEGORIES = new Set(["checkpoints", "loras"]);

export function isNsfwBlurEligibleCategory(modelType: string): boolean {
  return NSFW_BLUR_ELIGIBLE_CATEGORIES.has(modelType);
}

interface HashLookupResult {
  modelName?: string;
  civitModelID?: string;
  civitModelVersionID?: string;
  imageUrl?: string;
  // Whether Civitai actively confirmed this image as NSFW (nsfwLevel !== 1
  // on the chosen image). Only true on a confirmed hit - a failed/404/
  // unknown lookup is NOT treated as NSFW (that was too aggressive: most
  // models simply aren't registered on Civitai at all). Callers must also
  // gate this by isNsfwBlurEligibleCategory() before using it to blur.
  imageIsNsfw: boolean;
}

const HASH_LOOKUP_CACHE_PREFIX = "civit-hash-lookup:";
// Bump this whenever the hash-lookup interpretation changes, so cached
// results computed by earlier (buggy) versions are never reused. The key
// carries the version, and runCivitCacheMigrationOnce() also proactively
// deletes entries from earlier versions on startup.
export const CIVIT_HASH_CACHE_VERSION = 4;
const HASH_LOOKUP_VERSIONED_PREFIX = `${HASH_LOOKUP_CACHE_PREFIX}v${CIVIT_HASH_CACHE_VERSION}:`;
const CIVIT_CACHE_MIGRATION_LS_KEY = "WORKSPACE_CIVIT_CACHE_MIGRATION_VERSION";
const HASH_LOOKUP_SUCCESS_TTL_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
// Failures get a much shorter TTL than successes: a wrong/unreachable host
// or a transient error should retry soon, but must not re-query on every
// single render/mount in the meantime (that was the "same hash queried
// repeatedly" bug).
const HASH_LOOKUP_FAILURE_TTL_MS = 60 * 60 * 1000; // 1 hour

// TEMPORARY DIAGNOSTIC: short, readable hash prefix so console logs from
// civitUtils (which only knows the hash) can be correlated with ModelItem
// logs (which know the model name).
function shortHash(filehash: string): string {
  return filehash ? filehash.slice(0, 12) : String(filehash);
}

/**
 * One-time reset of stale NSFW/Civitai caches left over from earlier fix
 * iterations. Runs at most once per CIVIT_HASH_CACHE_VERSION (guarded by a
 * localStorage marker). It:
 *   1. deletes every hash-lookup cache entry that isn't on the current
 *      version prefix, and
 *   2. clears indexdb.models, whose per-record imageIsNsfw was frozen by
 *      whichever version last scanned it (the bulk scan keeps existing
 *      hashed records as-is), so everything repopulates with current logic.
 */
export async function runCivitCacheMigrationOnce(): Promise<void> {
  try {
    if (
      localStorage.getItem(CIVIT_CACHE_MIGRATION_LS_KEY) ===
      String(CIVIT_HASH_CACHE_VERSION)
    ) {
      return;
    }
    const all = (await indexdb.cache?.toArray()) ?? [];
    const staleIds = all
      .filter(
        (e) =>
          e.id.startsWith(HASH_LOOKUP_CACHE_PREFIX) &&
          !e.id.startsWith(HASH_LOOKUP_VERSIONED_PREFIX),
      )
      .map((e) => e.id);
    if (staleIds.length) {
      await indexdb.cache.bulkDelete(staleIds);
    }
    await indexdb.models?.clear();
    localStorage.setItem(
      CIVIT_CACHE_MIGRATION_LS_KEY,
      String(CIVIT_HASH_CACHE_VERSION),
    );
    console.log(
      `[NSFW-DEBUG] cache migration -> v${CIVIT_HASH_CACHE_VERSION}: deleted ${staleIds.length} old hash-lookup cache entr${
        staleIds.length === 1 ? "y" : "ies"
      }, cleared models table for a fresh rescan`,
    );
  } catch (e) {
    console.warn("[NSFW-DEBUG] cache migration failed", e);
  }
}

/**
 * Looks up a model on Civitai by file hash, with a persistent cache (keyed
 * by version + host + hash, so civitai.com/civitai.red and older versions
 * never mix) covering both successes and failures. Fallback policy: if the
 * lookup fails, 404s, or the model simply isn't registered on Civitai,
 * imageIsNsfw is false - "unknown" is not treated as NSFW, only a confirmed
 * hit is.
 *
 * `debugLabel` is only used for the temporary [NSFW-DEBUG] console output.
 */
export async function fetchCivitModelFromHashKey(
  filehash: string,
  debugLabel?: string,
): Promise<HashLookupResult> {
  const baseUrl = await getCivitBaseUrl();
  const cacheKey = `${HASH_LOOKUP_VERSIONED_PREFIX}${baseUrl}:${filehash}`;

  const cached = await indexdb.cache?.get(cacheKey);
  if (cached?.value != null) {
    try {
      const { data, timestamp, failed } = JSON.parse(cached.value);
      const ttlMs = failed
        ? HASH_LOOKUP_FAILURE_TTL_MS
        : HASH_LOOKUP_SUCCESS_TTL_MS;
      if (Date.now() - timestamp < ttlMs) {
        console.log("[NSFW-DEBUG] hashLookup CACHE-HIT", {
          label: debugLabel,
          hash: shortHash(filehash),
          baseUrl,
          failed: !!failed,
          cachedImageIsNsfw: (data as HashLookupResult).imageIsNsfw,
          ageMin: Math.round((Date.now() - timestamp) / 60000),
        });
        return data as HashLookupResult;
      }
    } catch (e) {
      // fall through and re-fetch
    }
  }

  const result = await lookupCivitModelFromHashKey(baseUrl, filehash, debugLabel);
  await indexdb.cache?.put({
    id: cacheKey,
    value: JSON.stringify({
      data: result,
      timestamp: Date.now(),
      failed: result.civitModelID == null,
    }),
  });
  return result;
}

async function lookupCivitModelFromHashKey(
  baseUrl: string,
  filehash: string,
  debugLabel?: string,
): Promise<HashLookupResult> {
  const hash = shortHash(filehash);
  try {
    const url = `${baseUrl}/api/v1/model-versions/by-hash/${filehash}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      // e.g. a 404 - most often just means the model isn't registered on
      // Civitai at all (private/custom checkpoints, LoRAs trained locally,
      // etc.), which is the common case, not the exception. Unknown is not
      // NSFW.
      console.log("[NSFW-DEBUG] hashLookup FETCH", {
        label: debugLabel,
        hash,
        baseUrl,
        httpStatus: resp.status,
        imageIsNsfw: false,
        reason: "response not ok (likely 404 - not registered on Civitai)",
      });
      return { imageIsNsfw: false };
    }
    const json: ResponsePartial = await resp.json();
    // Always resolve to the best available image - prefer an explicitly
    // SFW-tagged one, otherwise fall back to the first image and flag it
    // as NSFW. Whether to actually show it clearly or blurred is a
    // display-time decision (see ModelItem.tsx), not something baked into
    // the fetched/cached data, so toggling "Show NSFW" doesn't need a
    // re-fetch from Civitai.
    const sfwImage = json.images?.find((i) => i.nsfwLevel == 1);
    const chosenImage = sfwImage ?? json.images?.[0];
    const imageIsNsfw = chosenImage == null ? false : chosenImage.nsfwLevel !== 1;

    console.log("[NSFW-DEBUG] hashLookup FETCH", {
      label: debugLabel,
      hash,
      baseUrl,
      httpStatus: resp.status,
      civitModelName: json.model?.name,
      modelNsfwFlag: json.model?.nsfw,
      imageNsfwLevels: json.images?.map((i) => i.nsfwLevel),
      sfwImageFound: sfwImage != null,
      chosenImageNsfwLevel: chosenImage?.nsfwLevel,
      imageIsNsfw,
      note: "current rule: prefer an nsfwLevel==1 image if ANY exists, then imageIsNsfw = chosenImage.nsfwLevel !== 1",
    });

    return {
      modelName: json.model?.name,
      civitModelID: json.modelId != null ? String(json.modelId) : undefined,
      civitModelVersionID: json.id != null ? String(json.id) : undefined,
      imageUrl: chosenImage?.url,
      imageIsNsfw,
    };
  } catch (e) {
    // Network error, malformed JSON, etc. - same fallback as a non-ok
    // response above: unknown is not NSFW.
    console.log("[NSFW-DEBUG] hashLookup FETCH", {
      label: debugLabel,
      hash,
      baseUrl,
      imageIsNsfw: false,
      reason: "exception (network / JSON parse error)",
      error: String(e),
    });
    return { imageIsNsfw: false };
  }
}
