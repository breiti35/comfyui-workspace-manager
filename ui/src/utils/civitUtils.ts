import { userSettingsTable } from "../db-tables/WorkspaceDB";

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

export async function fetchCivitModelFromHashKey(filehash: string): Promise<{
  modelName?: string;
  civitModelID?: string;
  civitModelVersionID?: string;
  imageUrl?: string;
  imageIsNsfw?: boolean;
}> {
  try {
    const baseUrl = await getCivitBaseUrl();
    const url = `${baseUrl}/api/v1/model-versions/by-hash/${filehash}`;
    const resp = await fetch(url);
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
      modelName: json.model.name,
      civitModelID: String(json.modelId),
      civitModelVersionID: String(json.id),
      imageUrl: chosenImage?.url,
      imageIsNsfw: chosenImage != null && chosenImage.nsfwLevel !== 1,
    };
  } catch (e) {
    return {};
  }
}
