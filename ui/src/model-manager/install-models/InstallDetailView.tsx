import {
  Badge,
  Box,
  Button,
  CircularProgress,
  Flex,
  Heading,
  HStack,
  IconButton,
  Image,
  Spinner,
  Stack,
  Tag,
  Text,
  Tooltip,
  useToast,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import {
  IconArrowLeft,
  IconCopy,
  IconDownload,
  IconExternalLink,
} from "@tabler/icons-react";
import type { CivitiModel, CivitiModelVersion } from "../types";
import {
  civitDescriptionToText,
  civitThumbUrl,
  getCivitVersionImages,
  type CivitImageWithMeta,
} from "../api/civitDetailApi";
import { getCivitModelPageUrl } from "../../utils/civitUtils";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";
import { KBtoGB, hideScrollbarSx, formatSpeed, formatEta } from "../utils";
import type { DownloadEntry } from "./downloadStore";
import { getFileEssential } from "./util/modelTypes";
import {
  ImageMeta,
  NSFW_BLUR_FILTER,
  nsfwLevelNum,
  SectionLabel,
} from "../components/CivitDetailShared";
import { useT } from "../../i18n/LanguageContext";

interface InstallDetailViewProps {
  model: CivitiModel;
  installedVersionIds: Set<string>;
  installingNames: string[];
  statForName: (fileName?: string) => DownloadEntry | undefined;
  onInstallVersion: (version: CivitiModelVersion, model: CivitiModel) => void;
  onBack: () => void;
  /**
   * Where an install lands (resolved absolute path, or just the folder key
   * when the backend can't resolve it). Undefined = no default folder, the
   * folder picker opens instead.
   */
  targetFolder?: string;
}

export default function InstallDetailView({
  model,
  installedVersionIds,
  installingNames,
  statForName,
  onInstallVersion,
  onBack,
  targetFolder,
}: InstallDetailViewProps) {
  const { t } = useT();
  const versions = useMemo(() => model.modelVersions ?? [], [model]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | undefined>(
    versions[0]?.id,
  );
  const [showNsfw, setShowNsfw] = useState(false);
  const [openMetaIdx, setOpenMetaIdx] = useState<number>();
  const [versionImages, setVersionImages] = useState<CivitImageWithMeta[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const toast = useToast();

  const selectedVersion =
    versions.find((v) => v.id === selectedVersionId) ?? versions[0];
  const descriptionText = useMemo(
    () => civitDescriptionToText(model.description),
    [model.description],
  );

  useEffect(() => {
    userSettingsTable?.getSetting("showNsfwModelThumbnail").then((r) => {
      setShowNsfw(r ?? false);
    });
  }, []);

  // Beispielbilder MIT Prompt-Meta für die gewählte Version nachladen.
  useEffect(() => {
    let cancelled = false;
    setOpenMetaIdx(undefined);
    setVersionImages([]);
    const vid = selectedVersion?.id;
    if (vid == null) {
      setImagesLoading(false);
      return;
    }
    setImagesLoading(true);
    getCivitVersionImages(vid).then((imgs) => {
      if (!cancelled) {
        setVersionImages(imgs);
        setImagesLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedVersion?.id]);

  const galleryImages: CivitImageWithMeta[] = versionImages.length
    ? versionImages
    : imagesLoading
      ? []
      : (selectedVersion?.images ?? []).map((im) => ({
          url: im.url,
          meta: im.meta,
          nsfwLevel: im.nsfw,
        }));

  const isBlur = (lvl?: number | string) =>
    nsfwLevelNum(lvl) >= 4 && !showNsfw;

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    toast({
      title: `${label} ${t("install.detail.copiedSuffix")}`,
      status: "success",
      duration: 1400,
    });
  };

  const openCivit = async () => {
    const win = window.open();
    if (win) {
      win.location.href = await getCivitModelPageUrl(
        String(model.id),
        selectedVersion?.id ? String(selectedVersion.id) : undefined,
      );
    }
  };

  const versionSize = (v: CivitiModelVersion) => {
    const file = v.files?.find((f) => f.primary) ?? v.files?.[0];
    return file?.sizeKB ? KBtoGB(file.sizeKB) : undefined;
  };

  const versionFileName = (v: CivitiModelVersion) =>
    getFileEssential(v, model.name)?.name;

  const cover = selectedVersion?.images?.[0];

  return (
    <Flex direction={"column"} h={"100%"} minH={0}>
      {/* Kopfleiste */}
      <Flex
        align={"center"}
        gap={2}
        px={4}
        py={2}
        pr={12}
        flexShrink={0}
        bg={"galleryPanelBg"}
        borderBottom={"1px solid"}
        borderColor={"rowBorderColor"}
      >
        <Tooltip label={t("install.detail.backTooltip")}>
          <IconButton
            size={"sm"}
            variant={"ghost"}
            icon={<IconArrowLeft size={19} />}
            aria-label={"back to install list"}
            onClick={onBack}
          />
        </Tooltip>
        <Heading size={"sm"} noOfLines={1}>
          {model.name}
        </Heading>
        <Button
          size={"xs"}
          variant={"ghost"}
          leftIcon={<IconExternalLink size={15} />}
          onClick={openCivit}
          flexShrink={0}
        >
          {t("install.detail.openOnCivitai")}
        </Button>
      </Flex>

      <Box flex={1} minH={0} overflowY={"auto"} p={4} sx={hideScrollbarSx}>
        <Flex gap={4} align={"stretch"} wrap={"wrap"}>
          {/* Links: Cover + Typ/Basismodell + Trigger-Wörter */}
          <Box w={"320px"} flexShrink={0}>
            {cover?.url && (
              <Image
                src={civitThumbUrl(cover.url, 512)}
                loading={"lazy"}
                w={"100%"}
                borderRadius={"md"}
                objectFit={"cover"}
                maxH={"320px"}
                filter={isBlur(cover.nsfw) ? NSFW_BLUR_FILTER : undefined}
                alt={"model cover"}
              />
            )}
            <Text fontSize={"sm"} color={"gray.500"} mt={3}>
              {[model.type, selectedVersion?.baseModel]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            {selectedVersion?.trainedWords?.length ? (
              <Box mt={3}>
                <SectionLabel>{t("install.detail.triggerWords")}</SectionLabel>
                <Wrap>
                  {selectedVersion.trainedWords.map((w, i) => (
                    <WrapItem key={i}>
                      <Tag
                        size={"md"}
                        borderRadius={"full"}
                        cursor={"pointer"}
                        onClick={() =>
                          copy(w, t("install.detail.triggerWordLabel"))
                        }
                        gap={1}
                      >
                        {w}
                        <IconCopy size={13} />
                      </Tag>
                    </WrapItem>
                  ))}
                </Wrap>
              </Box>
            ) : null}
          </Box>

          {/* Rechts: Versionsliste mit Install je Version */}
          <Box flex={1} minW={"300px"}>
            <SectionLabel>
              {t("install.detail.versionsLabel")}
              {versions.length ? ` (${versions.length})` : ""}
            </SectionLabel>
            {targetFolder && (
              <Text
                fontSize={"xs"}
                color={"gray.500"}
                mb={1.5}
                noOfLines={1}
                title={targetFolder}
              >
                {t("install.targetFolder")}: {targetFolder}
              </Text>
            )}
            <Box
              maxH={"360px"}
              overflowY={"auto"}
              border={"1px solid"}
              borderColor={"rowBorderColor"}
              borderRadius={"md"}
              sx={hideScrollbarSx}
            >
              <Stack spacing={0}>
                {versions.map((v) => {
                  const active = v.id === selectedVersion?.id;
                  const fileName = versionFileName(v);
                  const installed = installedVersionIds.has(String(v.id));
                  const busy = fileName
                    ? installingNames.includes(fileName)
                    : false;
                  const stat = fileName ? statForName(fileName) : undefined;
                  const progress = stat?.progress;
                  return (
                    <Flex
                      key={v.id}
                      justify={"space-between"}
                      align={"center"}
                      gap={2}
                      px={3}
                      py={2}
                      borderLeft={"2px solid"}
                      borderColor={active ? "blue.400" : "transparent"}
                      bg={active ? "galleryActiveBg" : "transparent"}
                      _hover={{ bg: active ? "galleryActiveBg" : "rowHoverBg" }}
                      cursor={"pointer"}
                      onClick={() => setSelectedVersionId(v.id)}
                    >
                      <Box minW={0}>
                        <HStack gap={2} minW={0}>
                          <Text fontWeight={500} fontSize={"sm"} noOfLines={1}>
                            {v.name}
                          </Text>
                          {v.baseModel && (
                            <Text
                              fontSize={"xs"}
                              color={"gray.500"}
                              flexShrink={0}
                            >
                              {v.baseModel}
                            </Text>
                          )}
                        </HStack>
                        {versionSize(v) && (
                          <Text fontSize={"xs"} color={"gray.500"}>
                            {versionSize(v)}
                          </Text>
                        )}
                      </Box>
                      {installed ? (
                        <Badge
                          colorScheme={"green"}
                          variant={"subtle"}
                          borderRadius={"full"}
                          flexShrink={0}
                        >
                          {t("install.detail.versionInstalled")}
                        </Badge>
                      ) : busy ? (
                        <HStack gap={2} flexShrink={0}>
                          <CircularProgress
                            value={progress ?? 0}
                            isIndeterminate={progress == null}
                            size={"22px"}
                            color={"blue.400"}
                          />
                          <Box minW={"96px"}>
                            <Text fontSize={"xs"} color={"gray.300"}>
                              {progress != null
                                ? `${progress.toFixed(0)}%`
                                : ""}
                            </Text>
                            {(stat?.speed || stat?.eta != null) && (
                              <Text fontSize={"11px"} color={"gray.500"}>
                                {[formatSpeed(stat?.speed), formatEta(stat?.eta)]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </Text>
                            )}
                          </Box>
                        </HStack>
                      ) : (
                        <Tooltip
                          label={
                            targetFolder
                              ? `${t("install.targetFolder")}: ${targetFolder}`
                              : undefined
                          }
                          isDisabled={!targetFolder}
                        >
                          <Button
                            size={"xs"}
                            colorScheme={"blue"}
                            leftIcon={<IconDownload size={14} />}
                            flexShrink={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              onInstallVersion(v, model);
                            }}
                          >
                            {t("install.installButton")}
                          </Button>
                        </Tooltip>
                      )}
                    </Flex>
                  );
                })}
              </Stack>
            </Box>
          </Box>
        </Flex>

        {/* Beschreibung */}
        {descriptionText && (
          <Box mt={5}>
            <SectionLabel>{t("install.detail.descriptionLabel")}</SectionLabel>
            <Box
              maxH={"460px"}
              overflowY={"auto"}
              border={"1px solid"}
              borderColor={"rowBorderColor"}
              borderRadius={"md"}
              p={3}
              sx={hideScrollbarSx}
            >
              <Text fontSize={"sm"} whiteSpace={"pre-wrap"}>
                {descriptionText}
              </Text>
            </Box>
          </Box>
        )}

        {/* Beispielbilder mit Prompts */}
        <Box mt={5}>
          <SectionLabel>{t("install.detail.exampleImagesLabel")}</SectionLabel>
          {imagesLoading ? (
            <Flex py={8} justify={"center"}>
              <Spinner size={"sm"} />
            </Flex>
          ) : galleryImages.length ? (
            <Flex wrap={"wrap"} gap={3} align={"flex-start"}>
              {galleryImages.map((img, idx) => {
                const open = openMetaIdx === idx;
                return (
                  <Box key={idx} w={"180px"}>
                    <Image
                      src={civitThumbUrl(img.url)}
                      loading={"lazy"}
                      w={"180px"}
                      h={"180px"}
                      objectFit={"cover"}
                      borderRadius={"md"}
                      cursor={"pointer"}
                      filter={
                        isBlur(img.nsfwLevel) ? NSFW_BLUR_FILTER : undefined
                      }
                      onClick={() => setOpenMetaIdx(open ? undefined : idx)}
                      alt={"example"}
                    />
                    {open && <ImageMeta meta={img.meta} onCopy={copy} />}
                  </Box>
                );
              })}
            </Flex>
          ) : (
            <Text fontSize={"sm"} color={"gray.500"}>
              {t("install.detail.noExampleImages")}
            </Text>
          )}
        </Box>
      </Box>
    </Flex>
  );
}
