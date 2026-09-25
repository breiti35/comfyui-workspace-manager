import {
  Box,
  Button,
  Flex,
  Grid,
  Text,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { useDownloads } from "./useDownloads";
import { markDownloadStarted } from "./downloadStore";
import type { CivitiModel, CivitiModelVersion } from "../types";
import { useT } from "../../i18n/LanguageContext";
import { createSequenceGuard } from "../../utils/requestSequence";
import { resolveModelFolder } from "../../Api";
import { MODELS_DB_SYNCED_EVENT } from "../syncModelsToDb";

interface Props {
  searchQuery?: string;
  modelType?: MODEL_TYPE;
  // Bubbles up whenever this tab's detail view opens/closes, so the shared
  // ModelsPanel modal can scope Esc/overlay-dismiss to the active tab - see
  // ModelsPanel.tsx.
  onDetailOpenChange: (open: boolean) => void;
}

// Imperative surface the shared ModelsPanel modal needs to close this tab's
// detail view on demand (Esc/overlay-click while it's open).
export interface InstallModelsPanelHandle {
  closeDetail: () => void;
}

const InstallModelsPanelContent = forwardRef<
  InstallModelsPanelHandle,
  Props
>(function InstallModelsPanelContent(
  { searchQuery: searchQueryProp = "", modelType: modelTypeProp, onDetailOpenChange },
  ref,
) {
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
  const [installedModelIds, setInstalledModelIds] = useState<Set<string>>(
    new Set(),
  );
  const [installedVersionIds, setInstalledVersionIds] = useState<Set<string>>(
    new Set(),
  );
  const [detailItem, setDetailItem] = useState<CivitiModel | null>(null);
  const closeDetail = () => setDetailItem(null);

  useEffect(() => {
    onDetailOpenChange(detailItem !== null);
  }, [detailItem, onDetailOpenChange]);

  useImperativeHandle(ref, () => ({
    closeDetail,
  }));

  const { isOpen, onOpen, onClose: onCloseChooseFolderModal } = useDisclosure();
  const toast = useToast();
  const { pending, lastError, statFor, isDownloading } = useDownloads();
  // Tick of the last error we've already shown a toast for - starts at
  // whatever the store already holds so a stale error isn't re-toasted just
  // because the panel got reopened.
  const shownErrorTickRef = useRef(lastError?.tick ?? 0);
  const [fileState, setFile, file] = useStateRef<FileEssential>();
  const [defaultFolders, setDefaultFolders] = useState<
    Record<MODEL_TYPE, string>
  >(MODEL_TYPE_TO_FOLDER_MAPPING);

  // Each loadData call supersedes the previous one: on the slow proxy a
  // page-1 reload and an older "next page" request can resolve in any order,
  // and the older one must not overwrite items/nextCursor.
  const loadGuardRef = useRef(createSequenceGuard());
  useEffect(() => {
    const guard = loadGuardRef.current;
    return () => guard.invalidate();
  }, []);

  const loadData = useCallback(
    async (pageCursor?: string) => {
      const guard = loadGuardRef.current;
      const ticket = guard.begin();
      setLoading(true);
      try {
        const { items, nextCursor: nc } = await getModelFromCivitAPi(
          modelType,
          searchQuery,
          sortBy,
          baseModel || undefined,
          pageSize,
          pageCursor,
        );
        if (!guard.isCurrent(ticket)) return;
        setModels(items);
        setNextCursor(nc);
        const df = await userSettingsTable?.getSetting("defaultFolders");
        if (!guard.isCurrent(ticket)) return;
        // Stored settings predate newer types (LoCon, DoRA) - fill those in
        // from the built-in mapping instead of dropping them.
        df && setDefaultFolders({ ...MODEL_TYPE_TO_FOLDER_MAPPING, ...df });
      } catch (e) {
        if (!guard.isCurrent(ticket)) return;
        console.error("Error loading Civitai models:", e);
      } finally {
        if (guard.isCurrent(ticket)) setLoading(false);
      }
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

  // Bumped whenever the local model set may have changed: a sync run wrote
  // indexdb.models, or the download queue just drained.
  const [installedTick, setInstalledTick] = useState(0);
  useEffect(() => {
    const bump = () => setInstalledTick((n) => n + 1);
    window.addEventListener(MODELS_DB_SYNCED_EVENT, bump);
    return () => window.removeEventListener(MODELS_DB_SYNCED_EVENT, bump);
  }, []);
  const wasDownloadingRef = useRef(isDownloading);
  useEffect(() => {
    if (wasDownloadingRef.current && !isDownloading) {
      setInstalledTick((n) => n + 1);
    }
    wasDownloadingRef.current = isDownloading;
  }, [isDownloading]);

  // Lokale Modelle -> „installiert"-Mengen (Modell- und Versions-IDs).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = await indexdb.models.toArray();
      if (cancelled) return;
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
    })().catch((e) => console.error("Error reading local models:", e));
    return () => {
      cancelled = true;
    };
  }, [models, installedTick]);

  // Resolved download targets per folder key (e.g. "loras" ->
  // "/workspace/ComfyUI/models/loras"), shown on the install buttons. Falls
  // back to the key itself when the backend can't resolve it.
  const [resolvedFolders, setResolvedFolders] = useState<
    Record<string, string>
  >({});
  const folderKeysInView = useMemo(() => {
    const keys = new Set<string>();
    models.forEach((m) => {
      const key = defaultFolders[m.type as MODEL_TYPE];
      if (key) keys.add(key);
    });
    if (detailItem) {
      const key = defaultFolders[detailItem.type as MODEL_TYPE];
      if (key) keys.add(key);
    }
    return Array.from(keys);
  }, [models, detailItem, defaultFolders]);
  useEffect(() => {
    let cancelled = false;
    folderKeysInView
      .filter((key) => !(key in resolvedFolders))
      .forEach((key) => {
        resolveModelFolder(key).then((path) => {
          if (cancelled) return;
          setResolvedFolders((prev) => ({ ...prev, [key]: path ?? key }));
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderKeysInView]);
  const targetFolderFor = (model?: CivitiModel | null): string | undefined => {
    const key = model ? defaultFolders[model.type as MODEL_TYPE] : undefined;
    if (!key) return undefined;
    return resolvedFolders[key] ?? key;
  };

  // Fehler-Toast aus dem app-weiten Download-Store: nur bei neuem tick
  // anzeigen, nie erneut für einen Fehler, der schon vor dem Öffnen des
  // Panels aufgetreten ist.
  useEffect(() => {
    if (!lastError || lastError.tick === shownErrorTickRef.current) return;
    shownErrorTickRef.current = lastError.tick;
    toast({
      title: t("install.toast.downloadError.title"),
      description: lastError.message,
      status: "error",
      duration: 5000,
      isClosable: true,
    });
  }, [lastError, t, toast]);

  const doDownload = async (
    fileEssential: FileEssential,
    folderPath: string,
  ) => {
    setFile(fileEssential);
    let url = await getCivitModelDownloadUrl(String(fileEssential.id));
    let version = fileEssential.name ?? url.split("/").pop();
    if (!version) return;
    markDownloadStarted(version as string);
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
    requestInstall({
      file_hash: fileEssential.SHA256,
      filename: version,
      save_path: folderPath,
      url,
    });
    setFile(undefined);
  };

  // Queues the download; a rejected request (backend down, bad input) is
  // reported right away - late failures come via download_error instead.
  const requestInstall = (input: Parameters<typeof installModelsApi>[0]) => {
    installModelsApi(input).catch((e) => {
      toast({
        title: t("install.toast.downloadError.title"),
        description: e instanceof Error ? e.message : String(e),
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    });
  };

  // Folder category the folder picker should preselect (the ComfyUI folder
  // matching the Civitai type of the model being installed).
  const [pendingInstallCategory, setPendingInstallCategory] = useState<
    string | undefined
  >(undefined);

  const installVersion = async (
    version: CivitiModelVersion,
    model: CivitiModel,
  ) => {
    const fileEssential = getFileEssential(version, model.name);
    const folderPath = defaultFolders[model.type as MODEL_TYPE];
    if (!fileEssential) return;
    if (folderPath == null) {
      setFile(fileEssential);
      setPendingInstallCategory(
        MODEL_TYPE_TO_FOLDER_MAPPING[model.type as MODEL_TYPE],
      );
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
      {detailItem ? (
        <Box flex={1} minHeight={0}>
          <InstallDetailView
            model={detailItem}
            installedVersionIds={installedVersionIds}
            installingNames={pending}
            statForName={statFor}
            onInstallVersion={installVersion}
            onBack={closeDetail}
            targetFolder={targetFolderFor(detailItem)}
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
            onCustomUrlInstall={() => {
              setPendingInstallCategory(undefined);
              onOpen();
            }}
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
                    stat={statFor(latestFile?.name)}
                    installing={
                      latestFile?.name
                        ? pending.includes(latestFile.name)
                        : false
                    }
                    onQuickInstall={quickInstall}
                    onOpenDetail={setDetailItem}
                    targetFolder={targetFolderFor(model)}
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
            <Text
              fontSize={"sm"}
              color={"gray.400"}
              minW={"64px"}
              textAlign={"center"}
            >
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
      <ChooseFolder
        fileSelected={!!fileState}
        preferredCategory={pendingInstallCategory}
        isOpen={isOpen}
        onClose={onCloseChooseFolderModal}
        selectFolder={(folderPath: string, customUrl?: string) => {
          if (file.current) {
            doDownload(file.current, folderPath);
          } else if (customUrl) {
            // Custom URL Install: direkt über die bestehende API laden.
            const version = customUrl.split("/").pop() ?? "download";
            markDownloadStarted(version);
            const apiKey = getCivitApiKey();
            let url = customUrl;
            if (apiKey && !/[?&]token=/.test(url)) {
              url += `${url.includes("?") ? "&" : "?"}token=${apiKey}`;
            }
            requestInstall({ filename: version, save_path: folderPath, url });
          }
          onCloseChooseFolderModal();
        }}
      />
    </>
  );
});

export default InstallModelsPanelContent;
