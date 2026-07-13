import {
  Box,
  Grid,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalCloseButton,
  ModalBody,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
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
  const [models, setModels] = useState<CivitiModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [modelType, setModelType] = useState<MODEL_TYPE | undefined>(
    modelTypeProp,
  );
  const [searchQuery, setSearchQuery] = useState(searchQueryProp);
  const [sortBy, setSortBy] = useState(SORT_OPTIONS[0].key);
  const [baseModel, setBaseModel] = useState("");
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

  const loadData = useCallback(async () => {
    setLoading(true);
    const result = await getModelFromCivitAPi(
      modelType,
      searchQuery,
      sortBy,
      baseModel || undefined,
    );
    setModels(result);
    const df = await userSettingsTable?.getSetting("defaultFolders");
    df && setDefaultFolders(df);
    setLoading(false);
  }, [modelType, searchQuery, sortBy, baseModel]);

  // Trending-Feed beim Öffnen + Neuladen bei Typ/Sort/Basismodell.
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelType, sortBy, baseModel]);

  // Adult-Content-Umschaltung (NSFW-Button) wechselt Host/Params -> neu laden,
  // damit die NSFW-Ergebnisse und Cover sofort erscheinen.
  useEffect(() => {
    const reload = () => loadData();
    window.addEventListener("civitaiIncludeAdultContent", reload);
    return () =>
      window.removeEventListener("civitaiIncludeAdultContent", reload);
  }, [loadData]);

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
        title: "Download-Fehler",
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
                  onSearch={loadData}
                  modelType={modelType}
                  onSelectModelType={setModelType}
                  sortBy={sortBy}
                  setSortBy={setSortBy}
                  baseModel={baseModel}
                  setBaseModel={setBaseModel}
                  onCustomUrlInstall={onOpen}
                  resultCount={models.length}
                  loading={loading}
                />
                <Box
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
