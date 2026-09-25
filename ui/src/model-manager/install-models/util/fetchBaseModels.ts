import { indexdb } from "../../../db-tables/indexdb";
import { getCivitBaseUrl } from "../../../utils/civitUtils";
import { CACHE_EXPIRY_DAYS } from "./modelTypes";
import { FALLBACK_BASE_MODELS } from "./baseModels";

const CACHE_KEY = "civitai:enums:ActiveBaseModel";

/**
 * Base model names Civitai currently accepts as a filter, from its
 * /api/v1/enums endpoint. Cached like the model searches; falls back to the
 * built-in snapshot when Civitai is unreachable or answers with garbage.
 */
export async function fetchBaseModels(): Promise<string[]> {
  try {
    const cached = await indexdb.cache?.get(CACHE_KEY);
    if (cached?.value != null) {
      const { data, timestamp } = JSON.parse(cached.value);
      const ageInDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
      if (ageInDays < CACHE_EXPIRY_DAYS && Array.isArray(data) && data.length) {
        return data;
      }
    }
  } catch (e) {
    console.error("err reading base model cache", e);
  }

  try {
    const baseUrl = await getCivitBaseUrl();
    const resp = await fetch(`${baseUrl}/api/v1/enums`);
    const json = await resp.json();
    const list = json?.ActiveBaseModel ?? json?.BaseModel;
    if (Array.isArray(list) && list.length) {
      const data = list.filter((x: unknown) => typeof x === "string");
      indexdb.cache?.put({
        id: CACHE_KEY,
        value: JSON.stringify({ data, timestamp: Date.now() }),
      });
      return data;
    }
  } catch (e) {
    console.error("err fetching civitai base models", e);
  }
  return FALLBACK_BASE_MODELS;
}
