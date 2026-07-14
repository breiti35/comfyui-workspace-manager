import {
  Box,
  Button,
  Flex,
  Grid,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalCloseButton,
  ModalBody,
  Text,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { installModelsApi } from "../api/modelsApi";
import InstallModelCard from "./InstallModelCard";
import InstallToolbar, { SORT_OPTIONS } from "./InstallToolbar";
import InstallDetailView from "./InstallDetailView";
import ChooseFolder from "./ChooseFolder";
import {
  getCivitApiKey,
  getCivitModelDownloadUrl,
} from "../../utils/civitUtils";
import { useStateRef } from "../../customHooks/useStateRef";
import {
  FileEssential,
  MODEL_TYPE,
  MODEL_TYPE_TO_FOLDER_MAPPING,
  getFileEssential,
} from "./util/modelTypes";
import { getModelFromCivitAPi } from "./util/getModelFromCivitAPI";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";
import { indexdb } from "../../db-tables/indexdb";
import { hideScrollbarSx } from "../utils";
import { api } from "../../utils/comfyapp";
import type { CivitiModel, CivitiModelVersion } from "../types";
import { useT } from "../../i18n/LanguageContext";

interface Props {
  onclose: () => void;
  searchQuery?: string;
  modelType?: MODEL_TYPE;
}

type ProgressEntry = { save_path: string; progress: number };

const basename = (p: string) => p.replace(/^.*[\\/]/, "");

export default function InstallModelsModal({
  onclose: onCloseInstallModelsModal,
  searchQuery: searchQueryProp = "",
  modelType: modelTypeProp,
}: Props) {
  const { t } = useT();
  const [models, setModels] = useState<CivitiModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [modelType, setModelType] = useState<MODEL_TYPE | undefined>(
    modelTypeProp,
  );
  const [searchQuery, setSearchQuery] = useState(searchQueryProp);
  const [sortBy, setSortBy] = useState(SORT_OPTIONS[0].key);
  const [baseModel, setBaseModel] = useState("");
  const [pageSize, setPageSize] = useState(25);
  // Cursor-based paging: current page's cursor, a stack of previous cursors to
  // walk back, the nextCursor from the last response (enables "Weiter"), and a
  // display-only running page number (the API gives no total).
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [prevCursors, setPrevCursors] = useState<(string | undefined)[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [pageNumber, setPageNumber] = useState(1);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const [installing, setInstalling] = useState<string[]>([]);
  const [progressQueue, setProgressQueue] = useState<ProgressEntry[]>([]);
  const [installedModelIds, setInstalledModelIds] = useState<Set<string>>(
    new Set(),
  );
  const [installedVersionIds, setInstalledVersionIds] = useState<Set<string>>(
    new Set(),
  );
  const [detailItem, setDetailItem] = useState<CivitiModel | null>(null);

  const { isOpen, onOpen, onClose: onCloseChooseFolderModal } = useDisclosure();
  const toast = useToast();
  // Filenames that have appeared in a download_progress queue at least once,
  // so we can tell "completed" (was seen, now gone) from "not started yet".
  const seenDownloadsRef = useRef<Set<string>>(new Set());
  const [fileState, setFile, file] = useStateRef<FileEssential>();
  const [defaultFolders, setDefaultFolders] = useState<
    Record<MODEL_TYPE, string>
  >(MODEL_TYPE_TO_FOLDER_MAPPING);

  const loadData = useCallback(
    async (pageCursor?: string) => {
      setLoading(true);
      const { items, nextCursor: nc } = await getModelFromCivitAPi(
        modelType,
        searchQuery,
        sortBy,
        baseModel || undefined,
        pageSize,
        pageCursor,
      );
      setModels(items);
      setNextCursor(nc);
      const df = await userSettingsTable?.getSetting("defaultFolders");
      df && setDefaultFolders(df);
      setLoading(false);
    },
    [modelType, searchQuery, sortBy, baseModel, pageSize],
  );

  // Zur ersten Seite zurück und laden. Wird bei jeder Filter-/Such-/
  // Seitengrößen-Änderung aufgerufen (die Cursor-Historie ist dann hinfällig).
  const resetAndLoad = useCallback(() => {
    setPrevCursors([]);
    setCursor(undefined);
    setNextCursor(undefined);
    setPageNumber(1);
    gridScrollRef.current?.scrollTo({ top: 0 });
    loadData(undefined);
  }, [loadData]);

  const goNext = () => {
    if (!nextCursor || loading) return;
    setPrevCursors((s) => [...s, cursor]);
    setCursor(nextCursor);
    setPageNumber((n) => n + 1);
    gridScrollRef.current?.scrollTo({ top: 0 });
    loadData(nextCursor);
  };

  const goPrev = () => {
    if (pageNumber <= 1 || loading) return;
    const prev = prevCursors[prevCursors.length - 1];
    setPrevCursors((s) => s.slice(0, -1));
    setCursor(prev);
    setPageNumber((n) => n - 1);
    gridScrollRef.current?.scrollTo({ top: 0 });
    loadData(prev);
  };

  // Trending-Feed beim Öffnen + Reset-auf-Seite-1 bei Typ/Sort/Basismodell/
  // Seitengröße.
  useEffect(() => {
    resetAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelType, sortBy, baseModel, pageSize]);

  // Adult-Content-Umschaltung (Settings) wechselt Host/Params -> zurück auf
  // Seite 1 laden, damit die NSFW-Ergebnisse und Cover sofort erscheinen.
  useEffect(() => {
    const reload = () => resetAndLoad();
    window.addEventListener("civitaiIncludeAdultContent", reload);
    return () =>
      window.removeEventListener("civitaiIncludeAdultContent", reload);
  }, [resetAndLoad]);

  // Lokale Modelle -> „installiert"-Mengen (Modell- und Versions-IDs).
  useEffect(() => {
    (async () => {
      const local = await indexdb.models.toArray();
      setInstalledModelIds(
        new Set(
          local
            .map((m) => m.civitModelID)
            .filter((x): x is string => x != null),
        ),
      );
      setInstalledVersionIds(
        new Set(
          local
            .map((m) => m.civitModelVersionID)
            .filter((x): x is string => x != null),
        ),
      );
    })();
  }, [models]);

  // Download-Fortschritt (globales Event) für die Karten-Anzeige.
  useEffect(() => {
    const onProgress = (e: { detail: ProgressEntry[] }) => {
      const queue = e.detail ?? [];
      setProgressQueue(queue);
      // The worker emits an empty queue once it has drained all tasks, so
      // nothing is downloading anymore - clear every optimistic marker. This
      // also covers the case where the backend renamed a file via
      // Content-Disposition (so its basename never matched and the seen-based
      // pruning below couldn't catch it), preventing a stuck overlay.
      if (queue.length === 0) {
        seenDownloadsRef.current.clear();
        setInstalling([]);
        return;
      }
      const active = new Set(queue.map((q) => basename(q.save_path)));
      active.forEach((n) => seenDownloadsRef.current.add(n));
      // Drop optimistic "installing" markers once their download has appeared
      // in a queue and then left it again (i.e. finished). Keep markers that
      // haven't shown up yet (backend still preparing the download).
      setInstalling((cur) =>
        cur.filter(
          (name) => active.has(name) || !seenDownloadsRef.current.has(name),
        ),
      );
    };
    const onError = (e: { detail: string }) => {
      toast({
        title: t("install.toast.downloadError.title"),
        description: e.detail,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      // The failed download's optimistic marker can't be cleared via the progress
      // handler when the error fires before it ever entered a progress queue
      // (e.g. missing-API-key → file_size 0 raises immediately). Clear optimistic
      // markers here; still-active/queued downloads stay covered by their own
      // live progressQueue entries, so we deliberately do NOT clear progressQueue.
      setInstalling([]);
    };
    api.addEventListener("download_progress", onProgress);
    api.addEventListener("download_error", onError);
    return () => {
      api.removeEventListener("download_progress", onProgress);
      api.removeEventListener("download_error", onError);
    };
  }, []);

  const progressForFile = (fileName?: string): number | undefined => {
    if (!fileName) return undefined;
    const entry = progressQueue.find((q) => basename(q.save_path) === fileName);
    return entry?.progress;
  };

  const doDownload = async (
    fileEssential: FileEssential,
    folderPath: string,
  ) => {
    setFile(fileEssential);
    let url = await getCivitModelDownloadUrl(String(fileEssential.id));
    let version = fileEssential.name ?? url.split("/").pop();
    if (!version) return;
    setInstalling((cur) => [...cur, version as string]);
    seenDownloadsRef.current.delete(version as string);
    const apiKey = getCivitApiKey();
    if (apiKey) {
      try {
        const u = new URL(url);
        if (!u.searchParams.has("token")) u.searchParams.set("token", apiKey);
        url = u.toString();
      } catch {
        if (!/[?&]token=/.test(url)) {
          url += `${url.includes("?") ? "&" : "?"}token=${apiKey}`;
        }
      }
    }
    installModelsApi({
      file_hash: fileEssential.SHA256,
      filename: version,
      save_path: folderPath,
      url,
    });
    setFile(undefined);
  };

  const installVersion = async (
    version: CivitiModelVersion,
    model: CivitiModel,
  ) => {
    const fileEssential = getFileEssential(version, model.name);
    const folderPath = defaultFolders[model.type as MODEL_TYPE];
    if (!fileEssential) return;
    if (folderPath == null) {
      setFile(fileEssential);
      onOpen();
    } else {
      doDownload(fileEssential, folderPath);
    }
  };

  const quickInstall = (model: CivitiModel) => {
    const latest = model.modelVersions?.[0];
    if (latest) installVersion(latest, model);
  };

  return (
    <>
      <Modal
        isOpen={true}
        onClose={onCloseInstallModelsModal}
        blockScrollOnMount={true}
      >
        <ModalOverlay />
        <ModalContent
          width={"90%"}
          maxWidth={"90vw"}
          height={"90vh"}
          display={"flex"}
          flexDirection={"column"}
        >
          <ModalCloseButton
            zIndex={3}
            top={2}
            right={4}
            size={"md"}
            borderRadius={"md"}
            border={"1px solid"}
            borderColor={"red.400"}
            color={"red.300"}
            bg={"rgba(245, 101, 101, 0.14)"}
            _hover={{ bg: "rgba(245, 101, 101, 0.3)", color: "white" }}
            _active={{ bg: "rgba(245, 101, 101, 0.42)" }}
          />
          <ModalBody
            p={0}
            overflow={"hidden"}
            display={"flex"}
            flexDirection={"column"}
            flex={1}
            minHeight={0}
          >
            {detailItem ? (
              <Box flex={1} minHeight={0}>
                <InstallDetailView
                  model={detailItem}
                  installedVersionIds={installedVersionIds}
                  installingNames={installing}
                  onInstallVersion={installVersion}
                  onBack={() => setDetailItem(null)}
                />
              </Box>
            ) : (
              <>
                <InstallToolbar
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  onSearch={resetAndLoad}
                  modelType={modelType}
                  onSelectModelType={setModelType}
                  sortBy={sortBy}
                  setSortBy={setSortBy}
                  baseModel={baseModel}
                  setBaseModel={setBaseModel}
                  pageSize={pageSize}
                  setPageSize={setPageSize}
                  onCustomUrlInstall={onOpen}
                  resultCount={models.length}
                  loading={loading}
                />
                <Box
                  ref={gridScrollRef}
                  flex={1}
                  minHeight={0}
                  overflowY={"auto"}
                  px={4}
                  py={4}
                  sx={hideScrollbarSx}
                >
                  <Grid
                    templateColumns={"repeat(auto-fill, minmax(190px, 1fr))"}
                    gap={4}
                  >
                    {models.map((model) => {
                      const latestFile = getFileEssential(
                        model.modelVersions?.[0],
                        model.name,
                      );
                      return (
                        <InstallModelCard
                          key={model.id}
                          model={model}
                          installed={installedModelIds.has(String(model.id))}
                          progress={progressForFile(latestFile?.name)}
                          installing={
                            latestFile?.name
                              ? installing.includes(latestFile.name)
                              : false
                          }
                          onQuickInstall={quickInstall}
                          onOpenDetail={setDetailItem}
                        />
                      );
                    })}
                  </Grid>
                </Box>

                {/* Blätter-Leiste: cursor-basiert, daher nur Vor/Zurück +
                    laufender Seitenzähler (keine Gesamtzahl von der API). */}
                <Flex
                  flexShrink={0}
                  align={"center"}
                  justify={"center"}
                  gap={4}
                  px={4}
                  py={2}
                  borderTop={"1px solid"}
                  borderColor={"rowBorderColor"}
                  bg={"galleryPanelBg"}
                >
                  <Button
                    size={"sm"}
                    variant={"ghost"}
                    leftIcon={<IconChevronLeft size={16} />}
                    isDisabled={pageNumber <= 1 || loading}
                    onClick={goPrev}
                  >
                    {t("install.pagination.prev")}
                  </Button>
                  <Text fontSize={"sm"} color={"gray.400"} minW={"64px"} textAlign={"center"}>
                    {t("install.pagination.page")} {pageNumber}
                  </Text>
                  <Button
                    size={"sm"}
                    variant={"ghost"}
                    rightIcon={<IconChevronRight size={16} />}
                    isDisabled={!nextCursor || loading}
                    onClick={goNext}
                  >
                    {t("install.pagination.next")}
                  </Button>
                </Flex>
              </>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
      <ChooseFolder
        fileSelected={!!fileState}
        isOpen={isOpen}
        onClose={onCloseChooseFolderModal}
        selectFolder={(folderPath: string, customUrl?: string) => {
          if (file.current) {
            doDownload(file.current, folderPath);
          } else if (customUrl) {
            // Custom URL Install: direkt über die bestehende API laden.
            const version = customUrl.split("/").pop() ?? "download";
            setInstalling((cur) => [...cur, version]);
            seenDownloadsRef.current.delete(version);
            const apiKey = getCivitApiKey();
            let url = customUrl;
            if (apiKey && !/[?&]token=/.test(url)) {
              url += `${url.includes("?") ? "&" : "?"}token=${apiKey}`;
            }
            installModelsApi({ filename: version, save_path: folderPath, url });
          }
          onCloseChooseFolderModal();
        }}
      />
    </>
  );
}
