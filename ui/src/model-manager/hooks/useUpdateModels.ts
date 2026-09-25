import { useCallback, useEffect, useRef, useState } from "react";
import { getAllModelsList } from "../../Api";
import type { ModelsListRespItem, ModelsListRespItemFromApi } from "../types";
import { createSequenceGuard } from "../../utils/requestSequence";
import { syncModelsToDb } from "../syncModelsToDb";
// @ts-ignore
import { api } from "/scripts/api.js";

// While the backend is still hashing, the list is re-read over plain HTTP at
// this interval. The model_list websocket push normally delivers progress,
// but on RunPod's proxy the websocket drops often enough that the panel would
// otherwise sit on "hashing..." until reopened.
const HASH_POLL_INTERVAL_MS = 10_000;

export const useUpdateModels = () => {
  // all model types
  const [modelTypeList, setModelTypeList] = useState<string[]>(["checkpoints"]);

  // all models
  const [modelsList, setModelsList] = useState<ModelsListRespItem[]>([]);

  // loading status
  const [loading, setLoading] = useState(true);

  // Message of the last failed HTTP load (null = fine). A successful load or
  // websocket push clears it.
  const [error, setError] = useState<string | null>(null);

  // Bumped after every poll so the poll re-arms even when a silent poll
  // failed and the list therefore didn't change.
  const [pollTick, setPollTick] = useState(0);

  // HTTP answers can arrive after a newer websocket push (slow proxy) - the
  // guard drops those instead of rolling the list back.
  const guardRef = useRef(createSequenceGuard());

  const updateModels = useCallback(
    (file_list?: ModelsListRespItemFromApi[]) => {
      if (!file_list) return;
      setLoading(false);
      setError(null);
      const modelTypeList = Array.from(
        new Set(file_list.map((item) => item.model_type)),
      );
      // checkpoints must be in first
      const index = modelTypeList.indexOf("checkpoints");
      if (index >= 0) {
        modelTypeList.splice(index, 1);
      }
      modelTypeList.unshift("checkpoints");
      setModelTypeList(modelTypeList);
      setModelsList(
        file_list.map((item) => ({
          ...item,
          date: new Date(item.date * 1000),
        })),
      );
    },
    [],
  );

  /**
   * Loads the list over HTTP. `silent` (the hashing poll) neither toggles the
   * spinner nor reports errors - the next poll or websocket push retries.
   */
  const initData = useCallback(
    async (fresh = false, silent = false) => {
      const guard = guardRef.current;
      const ticket = guard.begin();
      try {
        const file_list = await getAllModelsList(fresh);
        if (!guard.isCurrent(ticket)) return;
        updateModels(file_list);
        // Also mirror into indexdb.models here, not only from the websocket
        // handler (ModelManagerTopbar): with a dropped websocket this is the
        // only way the Civitai names/thumbnails get filled in.
        syncModelsToDb(file_list).catch((e) =>
          console.error("Error syncing model list to indexdb:", e),
        );
      } catch (e) {
        if (!guard.isCurrent(ticket) || silent) return;
        console.error("Error loading model list:", e);
        setLoading(false);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [updateModels],
  );

  useEffect(() => {
    const guard = guardRef.current;
    initData();
    const handleModelList = (e: { detail: ModelsListRespItemFromApi[] }) => {
      // Newer than any HTTP request still in flight.
      guard.notePush();
      updateModels(e.detail);
    };
    api.addEventListener("model_list", handleModelList);
    return () => {
      guard.invalidate();
      api.removeEventListener("model_list", handleModelList);
    };
  }, [initData, updateModels]);

  // Fallback poll while any entry still lacks a hash. Re-armed on every list
  // change, so it stops by itself once everything is hashed, and the cleanup
  // stops it when the panel unmounts.
  useEffect(() => {
    if (loading || error) return;
    if (!modelsList.some((m) => !m.file_hash)) return;
    let active = true;
    const timer = setTimeout(() => {
      initData(false, true).finally(() => {
        if (active) setPollTick((n) => n + 1);
      });
    }, HASH_POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [modelsList, loading, error, initData, pollTick]);

  // Re-read the model list from the ComfyUI backend (the "Aktualisieren"
  // action). Shows the spinner again until the fresh list arrives.
  const refresh = async () => {
    setLoading(true);
    setError(null);
    await initData(true);
  };

  return {
    modelTypeList,
    modelsList,
    loading,
    error,
    refresh,
  };
};
