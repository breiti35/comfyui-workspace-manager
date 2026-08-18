import { Button, DarkMode, HStack, Stack } from "@chakra-ui/react";
import { lazy, useEffect, useContext, Suspense } from "react";
import ModelsListDrawer from "../models-list-drawer/ModelsListDrawer";
import "./index.css";
import { WorkspaceContext } from "../../WorkspaceContext";
// @ts-ignore
import { api } from "/scripts/api.js";

import { Model } from "../../types/dbTypes";
import {
  fetchCivitModelFromHashKey,
  isNsfwBlurEligibleCategory,
  runCivitCacheMigrationOnce,
} from "../../utils/civitUtils";
import { indexdb } from "../../db-tables/indexdb";
import type { ModelsListRespItemFromApi } from "../types";
import InatallModelsModal from "../install-models/InstallModelsModal";
import DownloadIndicator from "../install-models/DownloadIndicator";
import { TOPBAR_BUTTON_HEIGHT } from "../../const";
import ErrorBoundary from "../../components/ErrorBoundary";
import { useT } from "../../i18n/LanguageContext";
import { routeStackSignature } from "../../routeStack";

export default function ModelManagerTopbar() {
  const { t } = useT();
  const { openRoute, closeRoute, route, routeStack } =
    useContext(WorkspaceContext);

  useEffect(() => {
    // One-time reset of stale NSFW caches from earlier fix iterations, before
    // any scan repopulates indexdb.models with the current logic.
    runCivitCacheMigrationOnce();
    api.addEventListener(
      "model_list",
      async (e: { detail: ModelsListRespItemFromApi[] }) => {
        const modelsPromises = e.detail?.map(async (item) => {
          const existing = await indexdb.models.get(
            item.model_name + "@" + item.model_type,
          );
          // avoid overwriting existing models cuz it may have downloadUrl info
          if (existing?.fileHash) return existing;
          let newModel: Model = {
            id: item.model_name + "@" + item.model_type,
            modelName: null,
            fileHash: item.file_hash ?? null,
            fileFolder: item.model_type,
            fileName: item.model_name + item.model_extension,
          };
          if (!item.file_hash) return newModel;
          const json = await fetchCivitModelFromHashKey(item.file_hash);
          newModel = {
            ...newModel,
            modelName: json.modelName ?? null,
            civitModelID: json.civitModelID,
            civitModelVersionID: json.civitModelVersionID,
            imageUrl: json.imageUrl ?? null,
            // Only checkpoints/loras can ever be blurred, and only on a
            // confirmed Civitai NSFW hit - see civitUtils.ts.
            imageIsNsfw:
              isNsfwBlurEligibleCategory(item.model_type) &&
              (json.imageIsNsfw ?? false),
          };
          return newModel;
        });
        const models = (await Promise.all(modelsPromises)).filter(
          (model) => model != null,
        );
        // clear first so deleted models can be removed?
        await indexdb.models.clear();
        await indexdb.models.bulkPut(
          models.filter((model) => model != null) as Model[],
        );
        window.dispatchEvent(new CustomEvent("model_list_updated"));
      },
    );
  }, []);

  return (
    <Stack style={{ position: "relative" }}>
      {/* HStack just to seat the (always-mounted, but usually invisible)
          download indicator next to the button - the button itself is
          untouched. */}
      <HStack spacing={1}>
        <Button
          size={"sm"}
          variant={"ghost"}
          color={"white"}
          colorScheme="blue"
          aria-label={t("models.topbar.myModelsAria")}
          onClick={() => openRoute("modelList")}
          px={1}
          height={TOPBAR_BUTTON_HEIGHT + "px"}
        >
          {t("models.topbar.button")}
        </Button>
        <DownloadIndicator />
      </HStack>
      {/* A crash inside a drawer/modal must never take the whole plugin UI
          (incl. this topbar) down - contain it here. key={routeStackSignature(routeStack)}
          gives each distinct stack a fresh boundary so a caught error resets
          on navigation - the full signature (not just the top route) is the
          right trigger because the stack's depth can change without the top
          route itself changing. */}
      <ErrorBoundary
        key={routeStackSignature(routeStack)}
        label={t("models.topbar.errorBoundary")}
      >
        {route === "modelList" && (
          <ModelsListDrawer onClose={closeRoute} />
        )}
        {route === "installModels" && (
          <InatallModelsModal
            modelType="Checkpoint"
            onclose={closeRoute}
          />
        )}
      </ErrorBoundary>
    </Stack>
  );
}
