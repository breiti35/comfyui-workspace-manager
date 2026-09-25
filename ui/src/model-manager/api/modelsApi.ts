// @ts-expect-error ComfyUI imports
import { api } from "/scripts/api.js";
import { maskSecrets } from "../../utils/maskSecrets";

export type InstallModelsApiInput = {
  save_path: string;
  filename: string;
  url: string;
  file_hash?: string;
  force_filename?: boolean; // true to use filename as downloaded name, false to fetch from the response header
};

/**
 * Queues a model download on the backend. Progress and late failures arrive
 * via the download_progress / download_error websocket events (see
 * downloadStore.ts); this only reports whether the request itself was
 * accepted. Throws on a network error or non-2xx answer, with any Civitai
 * token in the message masked, so callers can show it in a toast.
 */
export const installModelsApi = async (target: InstallModelsApiInput) => {
  let response: Response;
  try {
    response = await api.fetchApi("/model_manager/install_model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(target),
    });
  } catch (error) {
    console.error("Failed to connect to the server:", maskSecrets(String(error)));
    throw new Error(maskSecrets(String(error)));
  }
  if (!response.ok) {
    let text = "";
    try {
      text = await response.text();
    } catch (e) {
      // body unreadable - the status alone has to do
    }
    throw new Error(
      maskSecrets(`HTTP ${response.status}${text ? `: ${text}` : ""}`),
    );
  }
};
