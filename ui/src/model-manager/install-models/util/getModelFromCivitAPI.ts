import { indexdb } from "../../../db-tables/indexdb";
import { userSettingsTable } from "../../../db-tables/WorkspaceDB";
import { getCivitBaseUrl } from "../../../utils/civitUtils";
import { CivitiModel } from "../../types";
import { CACHE_EXPIRY_DAYS, MODEL_TYPE } from "./modelTypes";

type CivitModelQueryParams = {
  types?: MODEL_TYPE;
  query?: string;
  limit?: string;
  nsfw?: string;
  sort?: string;
  baseModels?: string;
  cursor?: string;
};

// Civitai's /models endpoint is cursor-based: the response carries only a
// `nextCursor` (no total count, no page numbers - `page=N` returns HTTP 400).
// So we page forward via nextCursor and remember visited cursors client-side.
export interface CivitModelPage {
  items: CivitiModel[];
  nextCursor?: string;
}

export async function getModelFromCivitAPi(
  types?: MODEL_TYPE,
  query?: string,
  sort?: string,
  baseModels?: string,
  limit = 25,
  cursor?: string,
): Promise<CivitModelPage> {
  const params: CivitModelQueryParams = {
    limit: String(limit),
  };
  if (types) params.types = types;
  if (query) params.query = query;
  if (sort) params.sort = sort;
  if (baseModels) params.baseModels = baseModels;
  if (cursor) params.cursor = cursor;
  const includeAdultContent = await userSettingsTable?.getSetting(
    "civitaiIncludeAdultContent",
  );
  if (includeAdultContent) {
    // Belt-and-suspenders: civitai.red already includes adult content by
    // default, but explicitly requesting it too guards against the API
    // defaulting to SFW-only regardless of host.
    params.nsfw = "true";
  }

  const queryString = new URLSearchParams(params).toString();
  const baseUrl = await getCivitBaseUrl();
  // Cache key includes cursor + limit (both live in queryString), so each page
  // caches independently.
  const fullURL = `${baseUrl}/api/v1/models?${queryString}`;

  const cacheEntry = await indexdb.cache?.get(fullURL);
  if (cacheEntry?.value != null) {
    try {
      const { data, nextCursor, timestamp } = JSON.parse(cacheEntry?.value);
      // Check if cached data is still valid
      const ageInDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
      // Only trust the cache when it actually holds a list. A previously
      // cached malformed response (non-array) must never poison later reads.
      if (ageInDays < CACHE_EXPIRY_DAYS && Array.isArray(data)) {
        return { items: data, nextCursor };
      }
    } catch (e) {
      console.error("err fetching cache", e);
    }
  }

  try {
    const data = await fetch(fullURL);
    const json = await data.json();
    // Civitai occasionally answers a search with an error/rate-limit payload
    // that has no `items`. Coerce to an array so the caller never receives
    // `undefined` (which would throw on `.length`/`.map` during render).
    const items: CivitiModel[] = Array.isArray(json?.items) ? json.items : [];
    const nextCursor: string | undefined = json?.metadata?.nextCursor;
    // Cache only well-formed (array) responses - never a transient error
    // payload, or it would keep returning nothing until cache expiry.
    if (Array.isArray(json?.items)) {
      indexdb.cache.put({
        id: fullURL,
        value: JSON.stringify({
          data: items,
          nextCursor,
          timestamp: Date.now(),
        }),
      });
    }
    return { items, nextCursor };
  } catch (e) {
    // Network failure or non-JSON response: return an empty list so the
    // caller keeps a valid array and the UI cannot crash.
    console.error("err fetching civitai models", e);
    return { items: [], nextCursor: undefined };
  }
}
