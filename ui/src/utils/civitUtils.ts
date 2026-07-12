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
  // Whether Civitai classifies the MODEL as adult (model.nsfw === true).
  // Deliberately model-level, not per-image: the per-image nsfwLevel of the
  // displayed thumbnail is unreliable (we prefer a SFW preview image, so it
  // almost always reads as "safe" even for hardcore models, and it flips
  // between versions of the same model). Only true on a confirmed hit -
  // a failed/404/unknown lookup is NOT treated as NSFW. Callers must also
  // gate this by isNsfwBlurEligibleCategory() before using it to blur.
  imageIsNsfw: boolean;
}

const HASH_LOOKUP_CACHE_PREFIX = "civit-hash-lookup:";
// Bump this whenever the hash-lookup interpretation changes, so cached
// results computed by earlier (buggy) versions are never reused. The key
// carries the version, and runCivitCacheMigrationOnce() also proactively
// deletes entries from earlier versions on startup.
export const CIVIT_HASH_CACHE_VERSION = 5;
const HASH_LOOKUP_VERSIONED_PREFIX = `${HASH_LOOKUP_CACHE_PREFIX}v${CIVIT_HASH_CACHE_VERSION}:`;
const CIVIT_CACHE_MIGRATION_LS_KEY = "WORKSPACE_CIVIT_CACHE_MIGRATION_VERSION";
const HASH_LOOKUP_SUCCESS_TTL_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
// Failures get a much shorter TTL than successes: a wrong/unreachable host
// or a transient error should retry soon, but must not re-query on every
// single render/mount in the meantime (that was the "same hash queried
// repeatedly" bug).
const HASH_LOOKUP_FAILURE_TTL_MS = 60 * 60 * 1000; // 1 hour

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
  } catch (e) {
    // best-effort reset; if it fails, the versioned cache key still keeps
    // old-version entries from being reused.
  }
}

/**
 * Looks up a model on Civitai by file hash, with a persistent cache (keyed
 * by version + host + hash, so civitai.com/civitai.red and older versions
 * never mix) covering both successes and failures. Fallback policy: if the
 * lookup fails, 404s, or the model simply isn't registered on Civitai,
 * imageIsNsfw is false - "unknown" is not treated as NSFW, only a confirmed
 * hit is.
 */
export async function fetchCivitModelFromHashKey(
  filehash: string,
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
        return data as HashLookupResult;
      }
    } catch (e) {
      // fall through and re-fetch
    }
  }

  const result = await lookupCivitModelFromHashKey(baseUrl, filehash);
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
): Promise<HashLookupResult> {
  try {
    const url = `${baseUrl}/api/v1/model-versions/by-hash/${filehash}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      // e.g. a 404 - most often just means the model isn't registered on
      // Civitai at all (private/custom checkpoints, LoRAs trained locally,
      // etc.), which is the common case, not the exception. Unknown is not
      // NSFW.
      return { imageIsNsfw: false };
    }
    const json: ResponsePartial = await resp.json();
    // For the thumbnail we still prefer an explicitly SFW image (so the
    // preview shown - blurred or not - isn't the most explicit one), but the
    // blur DECISION is the model-level adult flag, not the chosen image's
    // nsfwLevel. The old per-image logic was unreliable: it read the flag off
    // a deliberately SFW-preferred image, so hardcore models resolved to
    // "safe" and the result flipped between versions of the same model.
    const sfwImage = json.images?.find((i) => i.nsfwLevel == 1);
    const chosenImage = sfwImage ?? json.images?.[0];

    return {
      modelName: json.model?.name,
      civitModelID: json.modelId != null ? String(json.modelId) : undefined,
      civitModelVersionID: json.id != null ? String(json.id) : undefined,
      imageUrl: chosenImage?.url,
      imageIsNsfw: json.model?.nsfw === true,
    };
  } catch (e) {
    // Network error, malformed JSON, etc. - same fallback as a non-ok
    // response above: unknown is not NSFW.
    return { imageIsNsfw: false };
  }
}
