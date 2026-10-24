import { userSettingsTable } from "../db-tables/WorkspaceDB";
import { indexdb } from "../db-tables/indexdb";
import { fetchApi } from "../Api";

// The Civitai API key is persisted server-side in db/settings.json (via
// userSettings), like every other setting - so it survives ComfyUI restarts
// and moves with the install. It used to live ONLY in browser localStorage,
// which the ComfyUI desktop app / some browsers drop on restart, so the key
// kept disappearing. We keep a synchronous in-memory cache (hydrated at startup
// by loadCivitApiKey) so the existing synchronous getCivitApiKey() callers stay
// unchanged, and still mirror to localStorage as a same-session fallback.
const CIVIT_API_KEY_STORAGE_KEY = "WORKSPACE_CIVIT_API_KEY_STORAGE_KEY";
let apiKeyCache: string | null = null;

/**
 * Load the API key from the persistent server-side settings into the sync
 * cache. Call once at startup (after userSettings is loaded). Also performs a
 * one-time migration of any pre-existing localStorage key to server-side.
 */
export async function loadCivitApiKey(): Promise<void> {
  try {
    const fromSettings = await userSettingsTable?.getSetting("civitaiApiKey");
    if (fromSettings) {
      apiKeyCache = fromSettings;
      return;
    }
    const legacy = localStorage.getItem(CIVIT_API_KEY_STORAGE_KEY);
    if (legacy) {
      apiKeyCache = legacy;
      await userSettingsTable?.upsert({ civitaiApiKey: legacy });
    }
  } catch (e) {
    // Settings unreachable - fall back to whatever localStorage still holds.
    apiKeyCache = localStorage.getItem(CIVIT_API_KEY_STORAGE_KEY);
  }
}

export function getCivitApiKey(): string | null {
  // Prefer the hydrated server-side value; fall back to localStorage in case a
  // read happens before loadCivitApiKey() finished.
  return apiKeyCache ?? localStorage.getItem(CIVIT_API_KEY_STORAGE_KEY);
}

export function setCivitApiKey(apiKey: string) {
  apiKeyCache = apiKey || null;
  // Persist server-side (the durable store) and mirror to localStorage.
  // Not awaited (sync API); a failed write is logged, the in-memory key and
  // the localStorage mirror still work for this session.
  userSettingsTable
    ?.upsert({ civitaiApiKey: apiKey })
    ?.catch?.((e: unknown) => console.error("Error saving Civitai API key:", e));
  if (apiKey) {
    localStorage.setItem(CIVIT_API_KEY_STORAGE_KEY, apiKey);
  } else {
    // Clear rather than storing "" - otherwise getCivitApiKey() would hand
    // back an empty string instead of null after deleting the key.
    localStorage.removeItem(CIVIT_API_KEY_STORAGE_KEY);
  }
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

interface ResponsePartial {
  id: number;
  modelId: number;
  // The version name (e.g. "v6", "ZENITH (V9)") - Civitai returns this at the
  // top level of the by-hash response, the model name is nested under `model`.
  name: string;
  baseModel?: string;
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
  // The matched version's name and base model (e.g. "SDXL 1.0"), used for the
  // card's version chip. Only present on a confirmed hit.
  versionName?: string;
  baseModel?: string;
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
  // true when the lookup didn't reach a verdict (rate limit, 5xx, network
  // error, or we're still backing off from one). Such results are never
  // cached, and callers must not overwrite previously known data with them.
  transient?: boolean;
}

const HASH_LOOKUP_CACHE_PREFIX = "civit-hash-lookup:";
// Bump this whenever the hash-lookup interpretation changes, so cached
// results computed by earlier (buggy) versions are never reused. The key
// carries the version, and runCivitCacheMigrationOnce() also proactively
// deletes entries from earlier versions on startup.
export const CIVIT_HASH_CACHE_VERSION = 6;
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
let migrationPromise: Promise<void> | null = null;

export function runCivitCacheMigrationOnce(): Promise<void> {
  // Memoized: the websocket sync and the HTTP sync may both call this right
  // at startup, and a second concurrent run would clear indexdb.models again
  // after the first sync already refilled it.
  if (!migrationPromise) migrationPromise = runCivitCacheMigration();
  return migrationPromise;
}

async function runCivitCacheMigration(): Promise<void> {
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
  // Only real verdicts (hit or 404) are cached. A rate limit / 5xx / network
  // error says nothing about the model, so caching it as "not on Civitai"
  // would hide the card data for the whole failure TTL.
  if (result.transient) return result;
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

/**
 * CivArchive fallback: for a file hash Civitai doesn't know (deleted models,
 * or models mirrored from another platform), our Python backend scrapes
 * civitaiarchive.com/sha256/<hash> and returns a preview image + basic model
 * info. Purely SHA256-based, so it works across every platform CivArchive
 * indexes (CivitAI, HuggingFace, TensorArt, ...). Cached in indexdb (successes
 * long, misses short) so a big grid doesn't re-hit the backend on every mount.
 */
export interface CivArchiveResult {
  imageUrl?: string;
  modelName?: string;
  modelType?: string;
  nsfwLevel?: number;
  source?: string;
  sourceModelId?: string;
  sourceModelVersionId?: string;
}

const CIVARCHIVE_CACHE_PREFIX = "civarchive-hash-lookup:v1:";
const CIVARCHIVE_SUCCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CIVARCHIVE_FAILURE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function fetchCivArchiveByHash(
  filehash: string,
): Promise<CivArchiveResult> {
  const cacheKey = `${CIVARCHIVE_CACHE_PREFIX}${filehash}`;
  const cached = await indexdb.cache?.get(cacheKey);
  if (cached?.value != null) {
    try {
      const { data, timestamp, failed } = JSON.parse(cached.value);
      const ttlMs = failed
        ? CIVARCHIVE_FAILURE_TTL_MS
        : CIVARCHIVE_SUCCESS_TTL_MS;
      if (Date.now() - timestamp < ttlMs) {
        return data as CivArchiveResult;
      }
    } catch (e) {
      // fall through and re-fetch
    }
  }

  let result: CivArchiveResult = {};
  try {
    const resp = await fetchApi(
      `/model_manager/civarchive_by_hash?hash=${encodeURIComponent(filehash)}`,
    );
    if (resp.ok) {
      result = (await resp.json()) as CivArchiveResult;
    }
  } catch (e) {
    // network/backend error - cache as a short-TTL miss below.
  }
  await indexdb.cache?.put({
    id: cacheKey,
    value: JSON.stringify({
      data: result,
      timestamp: Date.now(),
      failed: !result.imageUrl,
    }),
  });
  return result;
}

/**
 * Global backoff for Civitai hash lookups after a transient failure. A 429
 * applies to all our requests, not just the one hash, so while it's active
 * every lookup returns a transient "unknown" without touching the network.
 */
let civitBackoffUntil = 0;
let civitConsecutiveFailures = 0;
const CIVIT_BACKOFF_BASE_MS = 30 * 1000;
const CIVIT_BACKOFF_MAX_MS = 10 * 60 * 1000;

/**
 * Parses a Retry-After header (delta-seconds or HTTP-date) into a delay in
 * ms. Returns null when absent/unparseable. (Pure - exported for tests.)
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}

/**
 * Backoff delay after the n-th consecutive failure: the server's Retry-After
 * if given, else exponential (30s, 60s, 120s, ...), capped at 10 min.
 * (Pure - exported for tests.)
 */
export function computeCivitBackoffMs(
  consecutiveFailures: number,
  retryAfterMs: number | null,
): number {
  if (retryAfterMs != null) return Math.min(retryAfterMs, CIVIT_BACKOFF_MAX_MS);
  const exp = CIVIT_BACKOFF_BASE_MS * 2 ** Math.max(0, consecutiveFailures - 1);
  return Math.min(exp, CIVIT_BACKOFF_MAX_MS);
}

function noteCivitFailure(retryAfterMs: number | null) {
  civitConsecutiveFailures += 1;
  civitBackoffUntil =
    Date.now() + computeCivitBackoffMs(civitConsecutiveFailures, retryAfterMs);
}

function noteCivitSuccess() {
  civitConsecutiveFailures = 0;
  civitBackoffUntil = 0;
}

async function lookupCivitModelFromHashKey(
  baseUrl: string,
  filehash: string,
): Promise<HashLookupResult> {
  if (Date.now() < civitBackoffUntil) {
    return { imageIsNsfw: false, transient: true };
  }
  try {
    const url = `${baseUrl}/api/v1/model-versions/by-hash/${filehash}`;
    const resp = await fetch(url);
    if (resp.status === 404) {
      // Most often just means the model isn't registered on Civitai at all
      // (private/custom checkpoints, LoRAs trained locally, etc.), which is
      // the common case, not the exception. Unknown is not NSFW. This is the
      // only failure that gets cached as "not on Civitai".
      noteCivitSuccess();
      return { imageIsNsfw: false };
    }
    if (!resp.ok) {
      // 429 / 5xx / auth trouble: no verdict about this hash. Back off
      // (honouring Retry-After when Civitai sends it) and don't cache.
      noteCivitFailure(parseRetryAfter(resp.headers?.get("Retry-After")));
      return { imageIsNsfw: false, transient: true };
    }
    const json: ResponsePartial = await resp.json();
    noteCivitSuccess();
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
      versionName: json.name,
      baseModel: json.baseModel,
      civitModelID: json.modelId != null ? String(json.modelId) : undefined,
      civitModelVersionID: json.id != null ? String(json.id) : undefined,
      imageUrl: chosenImage?.url,
      imageIsNsfw: json.model?.nsfw === true,
    };
  } catch (e) {
    // Network error, malformed JSON, etc. - unknown is not NSFW, and it's
    // transient: back off and retry later instead of caching a miss.
    noteCivitFailure(null);
    return { imageIsNsfw: false, transient: true };
  }
}
