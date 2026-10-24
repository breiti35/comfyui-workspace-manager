import {
  Box,
  Flex,
  IconButton,
  Tooltip,
} from "@chakra-ui/react";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { mediaTable, workflowsTable } from "../db-tables/WorkspaceDB";
import {
  IconArrowLeft,
  IconCheckbox,
  IconDownload,
  IconStar,
  IconStarFilled,
  IconTrash,
} from "@tabler/icons-react";
import { setGalleryFavorites, useGalleryFavorites } from "./galleryFavorites";
import {
  allSelected,
  selectedVisibleIds,
  toggleSelection,
} from "./gallerySelection";
import { useDialog } from "../components/AlertDialogProvider";
import { viewMediaUrl } from "../utils";
import { buildSearchIndex, matchesQuery } from "./gallerySearch";
import { WorkspaceContext } from "../WorkspaceContext";
import { Media } from "../types/dbTypes";
import { GalleryCarouselImageViewer } from "./components/GalleryCarouselImageViewer.tsx";
import GalleryGridView from "./components/GalleryGridView.tsx";
import { useDebounce } from "../customHooks/useDebounce.ts";
import { GalleryContext, GallerySection } from "./GalleryContext.ts";
import { GalleryPreviewImage } from "./components/GalleryPreviewImage.tsx";
import { usePreviewImage } from "./usePreviewImage.ts";
import { useT } from "../i18n/LanguageContext";
import {
  LibraryFooter,
  LibraryHeader,
  LibrarySelectionBar,
  LibraryToolbar,
} from "../library/primitives";
import { useLibrarySubLevel } from "../library/libraryContext";
import { useLibraryIntent } from "../library/compact/libraryIntent";

export default function GalleryModal(_props: {
  onclose?: () => void;
}) {
  const { t } = useT();
  const { curFlowID, openRoute } = useContext(WorkspaceContext);
  const [workflowName, setWorkflowName] = useState("");
  const [section, setSection] = useState<GallerySection>("workflow");
  const [curMedia, setCurMedia] = useState<Media | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [workflowMedia, setWorkflowMedia] = useState<Media[]>([]);
  const [allMedia, setAllMedia] = useState<Media[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const debounceSearchValue = useDebounce(searchValue, 300);
  const [favOnly, setFavOnly] = useState(false);
  const favorites = useGalleryFavorites();
  // Search text per medium (file name + prompts/checkpoint/LoRAs); computed
  // once per list change, not per keystroke.
  const searchIndex = useMemo(
    () => buildSearchIndex([...allMedia, ...workflowMedia]),
    [allMedia, workflowMedia],
  );
  // setDetailOpen is a stable state setter, so this never changes identity.
  const closeDetail = useCallback(() => setDetailOpen(false), []);
  const { showDialog } = useDialog();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);
  const toggleSelect = useCallback(
    (id: string) => setSelectedIds((prev) => toggleSelection(prev, id)),
    [],
  );
  // Esc backs out of the detail view first, then of select mode, then closes
  // the library.
  const closeSubLevel = useCallback(() => {
    if (detailOpen) closeDetail();
    else exitSelect();
  }, [detailOpen, closeDetail, exitSelect]);
  useLibrarySubLevel("gallery", detailOpen || selectMode, closeSubLevel);
  // Deleting the shown medium leaves no current media: leave the detail view.
  useEffect(() => {
    if (detailOpen && !curMedia) setDetailOpen(false);
  }, [detailOpen, curMedia]);

  const refreshLists = async () => {
    if (curFlowID == null) return;
    const media = await mediaTable?.listByWorkflowID(curFlowID);
    setWorkflowMedia(media ?? []);
    const all = await mediaTable?.listAll();
    setAllMedia(
      (all ?? []).slice().sort((a, b) => b.createTime - a.createTime),
    );
    return media;
  };

  const loadData = async () => {
    const media = await refreshLists();
    if (media?.length) {
      setCurMedia(media[0]);
    }
  };

  useEffect(() => {
    loadData();
    curFlowID &&
      workflowsTable?.get(curFlowID).then((flow) => {
        if (flow) {
          setWorkflowName(flow.name);
        }
      });
  }, []);

  // Attach to ComfyUI's existing WebSocket to surface "Preview Image" node
  // outputs (temp images) transiently. When a run also saves an output image,
  // the plugin writes the media record and we refresh the saved lists so it
  // appears under "Dieser Workflow".
  const { frames: previewFrames, isGenerating } = usePreviewImage({
    onSavedMediaChanged: refreshLists,
  });

  // "Open in library" from the compact bar's live preview.
  useLibraryIntent("gallery", true, (key) => {
    if (key !== "preview") return;
    setSection("preview");
    setDetailOpen(false);
  });

  if (curFlowID == null) {
    return (
      <div className="lib-section">
        <LibraryHeader title={t("gallery.sidebar.allImages")} />
        <Flex
          flex={1}
          direction={"column"}
          align={"center"}
          justify={"center"}
          gap={3}
          p={8}
          textAlign={"center"}
        >
          <Box maxW={"420px"} color={"var(--lib-text-2)"}>
            {t("lib.gallery.empty")}
          </Box>
          <button
            type="button"
            className="lib-btn primary"
            onClick={() => openRoute("recentFlows")}
          >
            {t("lib.toWorkflows")}
          </button>
        </Flex>
      </div>
    );
  }

  const removeMedia = (id: string) => {
    setWorkflowMedia((prev) => prev.filter((m) => m.id !== id));
    setAllMedia((prev) => prev.filter((m) => m.id !== id));
    setCurMedia((prev) => (prev?.id === id ? null : prev));
  };

  const openDetail = (media: Media) => {
    setCurMedia(media);
    setDetailOpen(true);
  };

  const selectSection = (next: GallerySection) => {
    setSection(next);
    closeDetail();
    exitSelect();
  };

  const baseList = section === "all" ? allMedia : workflowMedia;
  const query = debounceSearchValue.trim().toLowerCase();
  const filteredList = baseList.filter(
    (m) =>
      (!favOnly || favorites.has(m.id)) &&
      (!query || matchesQuery(searchIndex, m.id, query)),
  );

  const visibleIds = filteredList.map((m) => m.id);
  const chosenIds = selectedVisibleIds(selectedIds, visibleIds);

  const bulkRemove = () =>
    showDialog(
      t("gallery.bulk.removeText").replace("{n}", String(chosenIds.length)),
      [
        {
          label: t("gallery.removeMediaDialog.confirm"),
          colorScheme: "red",
          onClick: async () => {
            for (const id of chosenIds) {
              try {
                await mediaTable?.delete(id);
                removeMedia(id);
              } catch (e) {
                console.error("Error removing media record:", e);
              }
            }
            exitSelect();
          },
        },
      ],
    );

  const bulkDownload = async () => {
    const byId = new Map(filteredList.map((m) => [m.id, m]));
    for (const id of chosenIds) {
      const path = byId.get(id)?.localPath;
      if (!path) continue;
      const a = document.createElement("a");
      a.href = viewMediaUrl(path);
      a.download = path.split("/").pop() || path;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Small gap so the browser does not drop consecutive downloads.
      await new Promise((r) => setTimeout(r, 300));
    }
  };

  const sectionTitle =
    section === "workflow"
      ? workflowName || t("gallery.sidebar.thisWorkflow")
      : section === "all"
        ? t("gallery.sidebar.allImages")
        : "Preview Image";

  return (
    <GalleryContext.Provider
      value={{
        curMedia,
        setCurMedia,
        openDetail,
        closeDetail,
        removeMedia,
        selectMode,
        selectedIds,
        toggleSelect,
      }}
    >
      <div className="lib-section">
        <LibraryHeader
          title={sectionTitle}
          subtitle={
            section !== "preview" ? String(filteredList.length) : undefined
          }
          back={
            detailOpen ? (
              <Tooltip label={t("gallery.backToOverview")}>
                <IconButton
                  size={"xs"}
                  variant={"ghost"}
                  icon={<IconArrowLeft size={16} />}
                  aria-label={"back to grid"}
                  onClick={closeDetail}
                />
              </Tooltip>
            ) : undefined
          }
        />
        {!detailOpen && (
          <LibraryToolbar>
            <input
              className="lib-input"
              style={{ width: 300 }}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={t("gallery.searchPlaceholder")}
              aria-label={t("gallery.searchPlaceholder")}
              disabled={section === "preview"}
            />
            <button
              type="button"
              className={"lib-btn" + (favOnly ? " fav" : "")}
              aria-pressed={favOnly}
              title={t("gallery.favOnlyTooltip")}
              aria-label={t("gallery.favOnlyAria")}
              disabled={section === "preview"}
              onClick={() => setFavOnly((v) => !v)}
            >
              {favOnly ? <IconStarFilled size={13} /> : <IconStar size={13} />}
              {t("gallery.favOnly")}
            </button>
            <button
              type="button"
              className={"lib-btn" + (selectMode ? " fav" : "")}
              aria-pressed={selectMode}
              title={t("gallery.bulk.selectTooltip")}
              disabled={section === "preview"}
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            >
              <IconCheckbox size={13} />
              {t("gallery.bulk.select")}
            </button>
            <div className="lib-seg" role="tablist">
              {(
                [
                  ["workflow", t("gallery.sidebar.thisWorkflow"), workflowMedia.length],
                  ["all", t("gallery.sidebar.allImages"), allMedia.length],
                  ["preview", "Preview Image", previewFrames.length],
                ] as [GallerySection, string, number][]
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={section === key}
                  className={section === key ? "on" : undefined}
                  onClick={() => selectSection(key)}
                >
                  {label}
                  {key === "preview" && isGenerating ? " ●" : count > 0 ? ` ${count}` : ""}
                </button>
              ))}
            </div>
          </LibraryToolbar>
        )}
        <LibrarySelectionBar>
          {selectMode && !detailOpen && section !== "preview" && (
            <div className="lib-tools">
              <span>
                {chosenIds.length} {t("gallery.bulk.selected")}
              </span>
              <button
                type="button"
                className="lib-btn"
                disabled={
                  visibleIds.length === 0 || allSelected(selectedIds, visibleIds)
                }
                onClick={() => setSelectedIds(new Set(visibleIds))}
              >
                {t("gallery.bulk.selectAll")}
              </button>
              <button
                type="button"
                className="lib-btn"
                disabled={chosenIds.length === 0}
                onClick={() => setSelectedIds(new Set())}
              >
                {t("gallery.bulk.clear")}
              </button>
              <button
                type="button"
                className="lib-btn"
                disabled={chosenIds.length === 0}
                onClick={() => setGalleryFavorites(chosenIds, true)}
              >
                <IconStar size={13} />
                {t("gallery.bulk.favorite")}
              </button>
              <button
                type="button"
                className="lib-btn"
                disabled={chosenIds.length === 0}
                onClick={bulkDownload}
              >
                <IconDownload size={13} />
                {t("gallery.download")}
              </button>
              <button
                type="button"
                className="lib-btn"
                disabled={chosenIds.length === 0}
                onClick={bulkRemove}
              >
                <IconTrash size={13} />
                {t("gallery.removeMediaDialog.confirm")}
              </button>
            </div>
          )}
        </LibrarySelectionBar>
        <Box flex={1} minH={0} overflowY={"auto"} p={"16px 24px"}>
          {section === "preview" ? (
            <GalleryPreviewImage
              frames={previewFrames}
              isGenerating={isGenerating}
            />
          ) : detailOpen && curMedia ? (
            <GalleryCarouselImageViewer mediaList={filteredList} />
          ) : (
            <GalleryGridView medias={filteredList} />
          )}
        </Box>
        <LibraryFooter
          left={
            section === "preview"
              ? undefined
              : `${filteredList.length} / ${baseList.length}`
          }
          right={workflowName}
        />
      </div>
    </GalleryContext.Provider>
  );
}
