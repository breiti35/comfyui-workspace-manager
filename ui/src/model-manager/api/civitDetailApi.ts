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
  // The images endpoint returns nsfwLevel either as a number (1/2/4/8/16) or a
  // string (None/Soft/Mature/X) depending on API version - handle both.
  nsfwLevel?: number | string;
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
    // withMeta=true is REQUIRED for the `meta` object (prompt, sampler, …) to be
    // included - without it Civitai omits it and every image reads as "no
    // prompt data". limit kept modest so the gallery loads fast.
    //
    // civitai.com only ever returns SFW ("None") images, so for an NSFW model
    // you'd otherwise get only the few tangential SFW community images. When the
    // user has opted into adult content (baseUrl -> civitai.red), request the
    // full browsing level so the model's ACTUAL examples come through (they're
    // still blurred at display time unless "Show NSFW" is on).
    const includeAdult = baseUrl.includes("civitai.red");
    const levelParam = includeAdult ? "&browsingLevel=31" : "";
    const resp = await fetch(
      `${baseUrl}/api/v1/images?modelVersionId=${modelVersionId}&limit=20&withMeta=true${levelParam}`,
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
 * Rewrites a Civitai CDN image URL to a smaller rendered width so the detail
 * gallery loads thumbnails instead of full-resolution originals (a big perf
 * win). Civitai supports on-the-fly transforms in the path
 * (…/width=NNN/… or …/original=true/…); we swap those for a modest width.
 */
export function civitThumbUrl(url?: string, width = 450): string | undefined {
  if (!url) return url;
  if (/\/(?:width|height)=\d+\//.test(url)) {
    return url.replace(/\/(?:width|height)=\d+\//, `/width=${width}/`);
  }
  if (/\/original=true\//.test(url)) {
    return url.replace(/\/original=true\//, `/width=${width}/`);
  }
  return url;
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
