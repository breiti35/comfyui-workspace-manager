import { Box, Button, Flex, Spinner, Text } from "@chakra-ui/react";
import Fuse from "fuse.js/min-basic";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { ModelsList } from "./ModelsList";
import { type ModelsListRespItem } from "../types";
import { useUpdateModels } from "../hooks/useUpdateModels";
import ModelDetailView from "./ModelDetailView";
import ModelsPanelToolbar from "./ModelsPanelToolbar";
import { isModelFavorite } from "./modelFavorites";
import { indexdb } from "../../db-tables/indexdb";
import { type Model } from "../../types/dbTypes";
import ModelDropEventListener from "../topbar/ModelDropEventListener";
import { hideScrollbarSx } from "../utils";
import { MODELS_DB_SYNCED_EVENT, modelDbId } from "../syncModelsToDb";
import { useT } from "../../i18n/LanguageContext";

interface Props {
  // Bubbles up whenever this tab's detail view opens/closes, so the shared
  // ModelsPanel modal can scope Esc/overlay-dismiss to the active tab - see
  // ModelsPanel.tsx.
  onDetailOpenChange: (open: boolean) => void;
}

// Imperative surface the shared ModelsPanel modal needs: close this tab's
// detail view on demand, and read the currently selected folder once (to
// derive the Install tab's initial Civitai type on first activation).
export interface ModelsListPanelHandle {
  closeDetail: () => void;
  selectedFolder: string;
}

const SORT_CMP: Record<
  string,
  (a: ModelsListRespItem, b: ModelsListRespItem) => number
> = {
  az: (a, b) => a.model_name.localeCompare(b.model_name),
  za: (a, b) => b.model_name.localeCompare(a.model_name),
  newest: (a, b) => b.date.getTime() - a.date.getTime(),
  oldest: (a, b) => a.date.getTime() - b.date.getTime(),
};

const ModelsListPanelContent = forwardRef<ModelsListPanelHandle, Props>(
  function ModelsListPanelContent({ onDetailOpenChange }, ref) {
    const [selectedModel, setSelectedModel] = useState("checkpoints");
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState("az");
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    const { t } = useT();
    const { loading, error, modelTypeList, modelsList, refresh } =
      useUpdateModels();
    // indexdb.models by id - Civitai names for the search. Re-read whenever
    // a sync run finished, so names that arrive after the list (hash lookups
    // run in the background) become searchable without reopening the panel.
    const [dbModels, setDbModels] = useState<Map<string, Model>>(new Map());
    const [dbVersion, setDbVersion] = useState(0);

    useEffect(() => {
      const bump = () => setDbVersion((v) => v + 1);
      window.addEventListener(MODELS_DB_SYNCED_EVENT, bump);
      return () => window.removeEventListener(MODELS_DB_SYNCED_EVENT, bump);
    }, []);

    // when set, the detail view replaces the grid (gallery-style back nav).
    const [detailItem, setDetailItem] = useState<ModelsListRespItem | null>(
      null,
    );
    const closeDetail = () => setDetailItem(null);

    useEffect(() => {
      onDetailOpenChange(detailItem !== null);
    }, [detailItem, onDetailOpenChange]);

    useImperativeHandle(ref, () => ({
      closeDetail,
      selectedFolder: selectedModel,
    }));

    useEffect(() => {
      // The panel can unmount (or the list change again) while the read is
      // in flight - don't set state from a stale read.
      let cancelled = false;
      indexdb.models
        .toArray()
        .then((models) => {
          if (cancelled) return;
          setDbModels(new Map(models.map((m) => [m.id, m])));
        })
        .catch((e) => console.error("Error reading indexdb.models:", e));
      return () => {
        cancelled = true;
      };
    }, [modelsList, dbVersion]);

    const modelsListWithDBData = useMemo<
      Array<{ db?: Model } & ModelsListRespItem>
    >(
      () =>
        modelsList.map((item) => ({
          ...item,
          db: dbModels.get(modelDbId(item)),
        })),
      [modelsList, dbModels],
    );

    // filter by model type / search, sort, then optionally keep only favorites
    const curModelList = useMemo(() => {
      let res: ModelsListRespItem[] = [];
      if (!searchQuery.length) {
        res = modelsList
          .filter((item) => item.model_type === selectedModel)
          .slice()
          .sort(SORT_CMP[sortBy] ?? SORT_CMP.az);
      } else {
        const fuse = new Fuse(modelsListWithDBData, {
          keys: ["model_name", "db.modelName"],
        });
        res = fuse.search(searchQuery).map((result) => result.item);
      }
      if (favoritesOnly) {
        res = res.filter((item) =>
          isModelFavorite(item.model_name + "@" + item.model_type),
        );
      }
      return res;
    }, [
      selectedModel,
      modelsList,
      searchQuery,
      sortBy,
      favoritesOnly,
      modelsListWithDBData,
    ]);

    // Only these change what the user is looking at - the grid's window
    // resets on them, not on every background list refresh (websocket push,
    // hashing poll), which would otherwise yank a scrolled user back to the
    // first 48 cards.
    const viewKey = `${selectedModel}|${searchQuery}|${sortBy}|${favoritesOnly}`;

    return (
      <>
        {detailItem ? (
          <Box flex={1} minHeight={0}>
            <ModelDetailView data={detailItem} onBack={closeDetail} />
          </Box>
        ) : (
          <>
            <ModelsPanelToolbar
              categories={modelTypeList}
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              sortBy={sortBy}
              setSortBy={setSortBy}
              favoritesOnly={favoritesOnly}
              setFavoritesOnly={setFavoritesOnly}
              onRefresh={refresh}
              resultCount={curModelList.length}
            />
            <Box
              flex={1}
              minHeight={0}
              overflowY={"auto"}
              px={4}
              pb={4}
              sx={hideScrollbarSx}
            >
              {loading && (
                <Flex justifyContent={"center"} alignItems={"center"} py={8}>
                  <Spinner />
                </Flex>
              )}
              {!loading && error && (
                <Flex
                  direction={"column"}
                  align={"center"}
                  gap={2}
                  py={8}
                >
                  <Text color={"red.300"} fontSize={"sm"}>
                    {t("models.list.loadError")}
                  </Text>
                  <Text color={"gray.500"} fontSize={"xs"}>
                    {error}
                  </Text>
                  <Button size={"xs"} variant={"outline"} onClick={refresh}>
                    {t("models.list.retry")}
                  </Button>
                </Flex>
              )}
              <ModelsList
                list={curModelList}
                resetKey={viewKey}
                onOpenDetail={setDetailItem}
              />
            </Box>
          </>
        )}
        <ModelDropEventListener />
      </>
    );
  },
);

export default ModelsListPanelContent;
