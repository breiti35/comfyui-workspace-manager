import {
  Box,
  Flex,
  IconButton,
  Tooltip,
} from "@chakra-ui/react";
import { useCallback, useContext, useEffect, useState } from "react";
import { mediaTable, workflowsTable } from "../db-tables/WorkspaceDB";
import { IconArrowLeft } from "@tabler/icons-react";
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
  // setDetailOpen is a stable state setter, so this never changes identity.
  const closeDetail = useCallback(() => setDetailOpen(false), []);
  // Esc backs out of the detail view first, then closes the library.
  useLibrarySubLevel("gallery", detailOpen, closeDetail);

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
  };

  const baseList = section === "all" ? allMedia : workflowMedia;
  const query = debounceSearchValue.trim().toLowerCase();
  const filteredList = query
    ? baseList.filter(
        (m) =>
          (m.localPath?.toLowerCase().includes(query) ?? false) ||
          (m.workflowJSON?.toLowerCase().includes(query) ?? false),
      )
    : baseList;

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
        <LibrarySelectionBar />
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
