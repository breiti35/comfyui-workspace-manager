import { Button, HStack, Stack } from "@chakra-ui/react";
import { useEffect, useContext } from "react";
import ModelsPanel from "../ModelsPanel";
import "./index.css";
import { WorkspaceContext } from "../../WorkspaceContext";
// @ts-ignore
import { api } from "/scripts/api.js";

import type { ModelsListRespItemFromApi } from "../types";
import { syncModelsToDb } from "../syncModelsToDb";
import DownloadIndicator from "../install-models/DownloadIndicator";
import { TOPBAR_BUTTON_HEIGHT } from "../../const";
import ErrorBoundary from "../../components/ErrorBoundary";
import { useT } from "../../i18n/LanguageContext";

export default function ModelManagerTopbar() {
  const { t } = useT();
  const { openRoute, closeRoute, route } = useContext(WorkspaceContext);
  // modelList and installModels are just two tabs of the same panel now
  // (see ModelsPanel.tsx) - either route means the panel is open. Narrowed
  // to a single value (rather than a plain boolean) so it can be passed on
  // as ModelsPanel's initialRoute below without widening back to
  // WorkspaceRoute.
  const modelsPanelRoute =
    route === "modelList" || route === "installModels" ? route : null;

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
          (incl. this topbar) down - contain it here. The key tracks the
          panel's open/closed identity, not the route: modelList and
          installModels are two tabs of the same panel (see
          ModelsPanel.tsx), so switching tabs must keep the same boundary -
          and thus the panel's state - alive. The key only changes when the
          panel opens or closes, so a caught error resets on the next open,
          not mid-use while the user is just switching tabs. */}
      <ErrorBoundary
        key={modelsPanelRoute ? "open" : "closed"}
        label={t("models.topbar.errorBoundary")}
      >
        {modelsPanelRoute && (
          <ModelsPanel initialRoute={modelsPanelRoute} onClose={closeRoute} />
        )}
      </ErrorBoundary>
    </Stack>
  );
}
