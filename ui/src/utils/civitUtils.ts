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

interface HashLookupResult {
  modelName?: string;
  civitModelID?: string;
  civitModelVersionID?: string;
  imageUrl?: string;
  // Whether this should be blurred, not a raw "is this actually NSFW" flag:
  // true both for confirmed-NSFW images AND for anything we couldn't
  // confirm as safe (failed/404/network error). "Unknown" must never look
  // identical to "confirmed safe" - see the fallback policy below.
  imageIsNsfw: boolean;
}

const HASH_LOOKUP_CACHE_PREFIX = "civit-hash-lookup:";
const HASH_LOOKUP_SUCCESS_TTL_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
// Failures get a much shorter TTL than successes: a wrong/unreachable host
// or a transient error should retry soon, but must not re-query on every
// single render/mount in the meantime (that was the "same hash queried
// repeatedly" bug).
const HASH_LOOKUP_FAILURE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Looks up a model on Civitai by file hash, with a persistent cache (keyed
 * by host + hash, so civitai.com/civitai.red results never mix) covering
 * both successes and failures. Fallback policy: if the lookup fails or the
 * response can't be parsed, the NSFW status is unknown - and unknown must
 * default to "blur", not "show clearly" (see imageIsNsfw doc above).
 */
export async function fetchCivitModelFromHashKey(
  filehash: string,
): Promise<HashLookupResult> {
  const baseUrl = await getCivitBaseUrl();
  const cacheKey = `${HASH_LOOKUP_CACHE_PREFIX}${baseUrl}:${filehash}`;

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
      // e.g. a 404 - not registered on this host (or this host/path is
      // wrong/unreachable). Either way the NSFW status is unknown, so we
      // must not fall through to parsing an error body as if it were a
      // model record.
      return { imageIsNsfw: true };
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

    return {
      modelName: json.model?.name,
      civitModelID: json.modelId != null ? String(json.modelId) : undefined,
      civitModelVersionID: json.id != null ? String(json.id) : undefined,
      imageUrl: chosenImage?.url,
      imageIsNsfw: chosenImage == null ? false : chosenImage.nsfwLevel !== 1,
    };
  } catch (e) {
    // Network error, malformed JSON, etc. - status unknown, same fallback
    // as a non-ok response above.
    return { imageIsNsfw: true };
  }
}
