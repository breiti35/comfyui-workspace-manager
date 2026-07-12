import {
  Badge,
  Box,
  Flex,
  Heading,
  HStack,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalOverlay,
  Tooltip,
} from "@chakra-ui/react";
import { useContext, useEffect, useState } from "react";
import { mediaTable, workflowsTable } from "../db-tables/WorkspaceDB";
import { IconArrowLeft } from "@tabler/icons-react";
import { WorkspaceContext } from "../WorkspaceContext";
import { Media } from "../types/dbTypes";
import { GalleryCarouselImageViewer } from "./components/GalleryCarouselImageViewer.tsx";
import GalleryGridView from "./components/GalleryGridView.tsx";
import { useDebounce } from "../customHooks/useDebounce.ts";
import SearchInput from "../components/SearchInput.tsx";
import { GalleryContext, GallerySection } from "./GalleryContext.ts";
import { GallerySidebar } from "./components/GallerySidebar.tsx";
import { GalleryPreviewImage } from "./components/GalleryPreviewImage.tsx";
import { usePreviewImage } from "./usePreviewImage.ts";

export default function GalleryModal({ onclose }: { onclose: () => void }) {
  const { curFlowID } = useContext(WorkspaceContext);
  const [workflowName, setWorkflowName] = useState("");
  const [section, setSection] = useState<GallerySection>("workflow");
  const [curMedia, setCurMedia] = useState<Media | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [workflowMedia, setWorkflowMedia] = useState<Media[]>([]);
  const [allMedia, setAllMedia] = useState<Media[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const debounceSearchValue = useDebounce(searchValue, 300);

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

  if (curFlowID == null) {
    return null;
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
  const closeDetail = () => setDetailOpen(false);

  const selectSection = (next: GallerySection) => {
    setSection(next);
    setDetailOpen(false);
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
      ? workflowName || "Dieser Workflow"
      : section === "all"
        ? "Alle Bilder"
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
      <Modal isOpen={true} onClose={onclose} blockScrollOnMount={true}>
        <ModalOverlay />
        <ModalContent width={"90%"} maxWidth={"90vw"} height={"90vh"}>
          <ModalCloseButton zIndex={2} />
          <ModalBody p={0} display={"flex"} overflow={"hidden"}>
            <GallerySidebar
              section={section}
              onSelect={selectSection}
              workflowCount={workflowMedia.length}
              allCount={allMedia.length}
              previewCount={previewFrames.length}
              isGenerating={isGenerating}
            />
            <Flex direction={"column"} flex={1} minW={0} p={4} gap={3}>
              <HStack justify={"space-between"} gap={3} align={"center"}>
                <HStack gap={2} minW={0}>
                  {detailOpen && (
                    <Tooltip label={"Zurück zur Übersicht"}>
                      <IconButton
                        size={"sm"}
                        variant={"ghost"}
                        icon={<IconArrowLeft size={19} />}
                        aria-label={"back to grid"}
                        onClick={closeDetail}
                      />
                    </Tooltip>
                  )}
                  <Heading size={"md"} noOfLines={1}>
                    {sectionTitle}
                  </Heading>
                  {section !== "preview" && (
                    <Badge
                      colorScheme={"gray"}
                      borderRadius={"full"}
                      px={2}
                      flexShrink={0}
                    >
                      {filteredList.length}
                    </Badge>
                  )}
                </HStack>
                {section !== "preview" && !detailOpen && (
                  <SearchInput
                    searchValue={searchValue}
                    onUpdateSearchValue={setSearchValue}
                    placeholder="Search prompt, model name, etc."
                    style={{ width: "300px" }}
                  />
                )}
              </HStack>

              <Box flex={1} minH={0} overflowY={"auto"}>
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
            </Flex>
          </ModalBody>
        </ModalContent>
      </Modal>
    </GalleryContext.Provider>
  );
}
