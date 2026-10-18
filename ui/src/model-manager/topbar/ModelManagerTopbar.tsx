import { useEffect } from "react";
import "./index.css";
// @ts-ignore
import { api } from "/scripts/api.js";

import type { ModelsListRespItemFromApi } from "../types";
import { syncModelsToDb } from "../syncModelsToDb";
import DownloadIndicator from "../install-models/DownloadIndicator";

export default function ModelManagerTopbar() {
  useEffect(() => {
    // Mirror every model_list push from the backend into indexdb.models (the
    // Civitai names/thumbnails the cards and search use). syncModelsToDb
    // runs the one-time cache migration first, throttles the Civitai
    // lookups, and discards a run as soon as a newer list arrives.
    const handleModelList = (e: { detail: ModelsListRespItemFromApi[] }) => {
      if (!Array.isArray(e.detail)) return;
      syncModelsToDb(e.detail).catch((err) =>
        console.error("Error syncing model list to indexdb:", err),
      );
    };
    api.addEventListener("model_list", handleModelList);
    return () => {
      api.removeEventListener("model_list", handleModelList);
    };
  }, []);

  // The Models button and panel moved into the library (library/LibraryHost);
  // what stays here is the always-mounted model-list sync and the download ring.
  return <DownloadIndicator />;
}
