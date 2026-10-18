import { Spinner } from "@chakra-ui/react";
import { IconArrowLeft, IconDownload } from "@tabler/icons-react";
import Fuse from "fuse.js/min-basic";
import {
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { ModelsList } from "./ModelsList";
import { type ModelsListRespItem } from "../types";
import { useUpdateModels } from "../hooks/useUpdateModels";
import ModelDetailView from "./ModelDetailView";
import ModelsPanelToolbar, { prettyCategory } from "./ModelsPanelToolbar";
import type { ModelsView } from "../components/LibToolbarParts";
import {
  LibraryFooter,
  LibraryHeader,
  LibrarySelectionBar,
} from "../../library/primitives";
import { WorkspaceContext } from "../../WorkspaceContext";
import { isModelFavorite } from "./modelFavorites";
import { indexdb } from "../../db-tables/indexdb";
import { type Model } from "../../types/dbTypes";
import ModelDropEventListener from "../topbar/ModelDropEventListener";
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
    const [baseFilter, setBaseFilter] = useState("");
    const [view, setView] = useState<ModelsView>("grid");
    const { openRoute } = useContext(WorkspaceContext);
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
          .filter(
            (item) => selectedModel === "" || item.model_type === selectedModel,
          )
          .slice()
          .sort(SORT_CMP[sortBy] ?? SORT_CMP.az);
      } else {
        const fuse = new Fuse(modelsListWithDBData, {
          keys: ["model_name", "db.modelName"],
        });
        res = fuse.search(searchQuery).map((result) => result.item);
      }
      if (baseFilter) {
        res = res.filter(
          (item) => dbModels.get(modelDbId(item))?.baseModel === baseFilter,
        );
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
      baseFilter,
      dbModels,
      modelsListWithDBData,
    ]);

    const counts = useMemo(() => {
      const c: Record<string, number> = {};
      modelsList.forEach((m) => {
        c[m.model_type] = (c[m.model_type] ?? 0) + 1;
      });
      return c;
    }, [modelsList]);

    const baseModels = useMemo(() => {
      const s = new Set<string>();
      dbModels.forEach((m) => m.baseModel && s.add(m.baseModel));
      return Array.from(s).sort((a, b) => a.localeCompare(b));
    }, [dbModels]);

    // Only these change what the user is looking at - the grid's window
    // resets on them, not on every background list refresh (websocket push,
    // hashing poll), which would otherwise yank a scrolled user back to the
    // first 48 cards.
    const viewKey = `${selectedModel}|${searchQuery}|${sortBy}|${favoritesOnly}|${baseFilter}`;

    const total = modelsList.length;
    const detailName = detailItem
      ? (dbModels.get(modelDbId(detailItem))?.modelName ??
        detailItem.model_name)
      : "";
    const countLine = `${total} ${t("models.lib.modelsSuffix")}`;

    return (
      <>
        {detailItem ? (
          <>
            <LibraryHeader
              title={detailName}
              back={
                <div className="lib-crumb">
                  <button type="button" className="lib-btn" onClick={closeDetail}>
                    <IconArrowLeft size={14} />
                    {t("models.lib.back")}
                  </button>
                  <span>
                    {t("models.lib.breadcrumbRoot")} › {detailName}
                  </span>
                </div>
              }
            />
            <div style={{ flex: 1, minHeight: 0 }}>
              <ModelDetailView data={detailItem} onBack={closeDetail} />
            </div>
          </>
        ) : (
          <>
            <LibraryHeader
              title={t("models.lib.installedTitle")}
              subtitle={countLine}
              actions={
                <button
                  type="button"
                  className="lib-btn primary"
                  onClick={() => openRoute("installModels")}
                >
                  <IconDownload size={16} />
                  {t("models.lib.installAction")}
                </button>
              }
            />
            <ModelsPanelToolbar
              categories={modelTypeList}
              counts={counts}
              total={total}
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              baseModels={baseModels}
              baseFilter={baseFilter}
              setBaseFilter={setBaseFilter}
              sortBy={sortBy}
              setSortBy={setSortBy}
              favoritesOnly={favoritesOnly}
              setFavoritesOnly={setFavoritesOnly}
              view={view}
              setView={setView}
              onRefresh={refresh}
            />
            <LibrarySelectionBar />
            <div className="lib-scroll">
              {loading && (
                <div className="lib-state">
                  <Spinner />
                </div>
              )}
              {!loading && error && (
                <div className="lib-state">
                  <span style={{ color: "var(--lib-text)" }}>
                    {t("models.list.loadError")}
                  </span>
                  <span>{error}</span>
                  <button type="button" className="lib-btn" onClick={refresh}>
                    {t("models.list.retry")}
                  </button>
                </div>
              )}
              <ModelsList
                list={curModelList}
                resetKey={viewKey}
                onOpenDetail={setDetailItem}
                compact={view === "compact"}
              />
            </div>
            <LibraryFooter
              left={
                curModelList.length === total
                  ? countLine
                  : `${curModelList.length} ${t("models.lib.of")} ${countLine}`
              }
              right={
                selectedModel === "" ? undefined : prettyCategory(selectedModel)
              }
            />
          </>
        )}
        <ModelDropEventListener />
      </>
    );
  },
);

export default ModelsListPanelContent;
