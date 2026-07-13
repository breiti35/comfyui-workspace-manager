import { indexdb } from "../../db-tables/indexdb";
import { getCivitBaseUrl } from "../../utils/civitUtils";
import { CivitiModel } from "../types";

// Cache full model-detail responses per host+id. Bump the version if the shape
// we rely on changes. Detail data is fairly static, so a couple of days is
// plenty and keeps repeated opens instant.
const DETAIL_CACHE_PREFIX = "civit-model-detail:v1:";
const DETAIL_CACHE_TTL_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

/**
 * Fetches a model's full detail (description, versions, trained words, example
 * images with their generation meta) from Civitai's `/api/v1/models/{id}`.
 * Host-aware (civitai.com vs civitai.red, via getCivitBaseUrl) and cached in
 * indexdb. Returns null on any failure - callers fall back to local info.
 *
 * This runs only when the user opens a model's detail view, never in bulk.
 */
export async function getCivitModelDetail(
  modelId: string,
): Promise<CivitiModel | null> {
  const baseUrl = await getCivitBaseUrl();
  const cacheKey = `${DETAIL_CACHE_PREFIX}${baseUrl}:${modelId}`;

  const cached = await indexdb.cache?.get(cacheKey);
  if (cached?.value != null) {
    try {
      const { data, timestamp } = JSON.parse(cached.value);
      if (Date.now() - timestamp < DETAIL_CACHE_TTL_MS) {
        return data as CivitiModel;
      }
    } catch {
      // fall through and refetch
    }
  }

  try {
    const resp = await fetch(`${baseUrl}/api/v1/models/${modelId}`);
    if (!resp.ok) return null;
    const json: CivitiModel = await resp.json();
    await indexdb.cache?.put({
      id: cacheKey,
      value: JSON.stringify({ data: json, timestamp: Date.now() }),
    });
    return json;
  } catch {
    return null;
  }
}

export interface CivitImageWithMeta {
  id?: number;
  url?: string;
  // Civitai's numeric browsing level on the images endpoint: 1=PG(None),
  // 2=PG13(Soft), 4=R(Mature), 8=X, 16=XXX. We blur >= 4 unless "Show NSFW".
  nsfwLevel?: number;
  meta?: {
    prompt?: string;
    negativePrompt?: string;
    sampler?: string;
    steps?: number;
    cfgScale?: number;
    seed?: number;
  } | null;
}

const VERSION_IMAGES_CACHE_PREFIX = "civit-version-images:v1:";

/**
 * Fetches example images WITH their generation metadata (prompt, sampler, …)
 * for a model version. The `/api/v1/models/{id}` response's images do NOT carry
 * `meta`, so prompts must come from the dedicated `/api/v1/images` endpoint.
 * Host-aware + cached; returns [] on failure so the caller can fall back to the
 * model-version's plain images.
 */
export async function getCivitVersionImages(
  modelVersionId: number | string,
): Promise<CivitImageWithMeta[]> {
  const baseUrl = await getCivitBaseUrl();
  const cacheKey = `${VERSION_IMAGES_CACHE_PREFIX}${baseUrl}:${modelVersionId}`;

  const cached = await indexdb.cache?.get(cacheKey);
  if (cached?.value != null) {
    try {
      const { data, timestamp } = JSON.parse(cached.value);
      if (Date.now() - timestamp < DETAIL_CACHE_TTL_MS) {
        return data as CivitImageWithMeta[];
      }
    } catch {
      // fall through
    }
  }

  try {
    const resp = await fetch(
      `${baseUrl}/api/v1/images?modelVersionId=${modelVersionId}&limit=24`,
    );
    if (!resp.ok) return [];
    const json = await resp.json();
    const items: CivitImageWithMeta[] = json?.items ?? [];
    await indexdb.cache?.put({
      id: cacheKey,
      value: JSON.stringify({ data: items, timestamp: Date.now() }),
    });
    return items;
  } catch {
    return [];
  }
}

/**
 * Safely turns Civitai's HTML description into plain text with basic line
 * breaks. We deliberately do NOT render the raw HTML (no dangerouslySetInnerHTML)
 * - the description is user-provided and there is no sanitizer available, so
 * DOMParser + textContent keeps it XSS-safe while preserving readable structure.
 */
export function civitDescriptionToText(html?: string): string {
  if (!html) return "";
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    doc
      .querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, ul, ol, tr")
      .forEach((el) => el.append("\n"));
    return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    return "";
  }
}
