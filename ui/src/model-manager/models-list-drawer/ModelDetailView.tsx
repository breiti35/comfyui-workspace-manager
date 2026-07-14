import {
  Badge,
  Box,
  Button,
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
  IconExternalLink,
} from "@tabler/icons-react";
import type { CivitiModel, ModelsListRespItem } from "../types";
import { indexdb } from "../../db-tables/indexdb";
import type { Model } from "../../types/dbTypes";
import {
  civitDescriptionToText,
  civitThumbUrl,
  getCivitModelDetail,
  getCivitVersionImages,
  type CivitImageWithMeta,
} from "../api/civitDetailApi";
import { getCivitModelPageUrl } from "../../utils/civitUtils";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";
import { KBtoGB, hideScrollbarSx } from "../utils";
import {
  ImageMeta,
  NSFW_BLUR_FILTER,
  nsfwLevelNum,
  SectionLabel,
} from "../components/CivitDetailShared";
import { useT } from "../../i18n/LanguageContext";

interface Props {
  data: ModelsListRespItem;
  onBack: () => void;
}

export default function ModelDetailView({ data, onBack }: Props) {
  const { t } = useT();
  const [loading, setLoading] = useState(true);
  const [dbModel, setDbModel] = useState<Model>();
  const [detail, setDetail] = useState<CivitiModel | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<number>();
  const [showNsfw, setShowNsfw] = useState(false);
  const [openMetaIdx, setOpenMetaIdx] = useState<number>();
  const [versionImages, setVersionImages] = useState<CivitImageWithMeta[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    userSettingsTable?.getSetting("showNsfwModelThumbnail").then((r) => {
      setShowNsfw(r ?? false);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setDetail(null);
      setOpenMetaIdx(undefined);
      const m = await indexdb.models.get(
        data.model_name + "@" + data.model_type,
      );
      if (cancelled) return;
      setDbModel(m);
      if (m?.civitModelID) {
        const d = await getCivitModelDetail(m.civitModelID);
        if (cancelled) return;
        setDetail(d);
        const installedVid = m.civitModelVersionID
          ? Number(m.civitModelVersionID)
          : undefined;
        const vlist = d?.modelVersions ?? [];
        const initial =
          vlist.find((v) => v.id === installedVid) ?? vlist[0];
        setSelectedVersionId(initial?.id);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  const versions = detail?.modelVersions ?? [];
  const selectedVersion =
    versions.find((v) => v.id === selectedVersionId) ?? versions[0];
  const installedVid = dbModel?.civitModelVersionID
    ? Number(dbModel.civitModelVersionID)
    : undefined;

  const descriptionText = useMemo(
    () => civitDescriptionToText(detail?.description),
    [detail?.description],
  );

  // Fetch the selected version's example images WITH generation meta (prompts)
  // from the dedicated images endpoint - the models endpoint omits `meta`.
  // A loading flag prevents showing fallback images first and then swapping
  // them out (the visible "everything reloads / cover changes" flicker).
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

  // Gallery = the images-with-meta result. Only fall back to the version's
  // plain (meta-less) images once the fetch has actually finished empty, so we
  // never render one set and then swap to another.
  const galleryImages: CivitImageWithMeta[] = versionImages.length
    ? versionImages
    : imagesLoading
      ? []
      : (selectedVersion?.images ?? []).map((im) => ({
          url: im.url,
          meta: im.meta,
          nsfwLevel: im.nsfw,
        }));

  const isBlur = (lvl?: number | string) => nsfwLevelNum(lvl) >= 4 && !showNsfw;

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    toast({
      title: `${label} ${t("models.copiedSuffix")}`,
      status: "success",
      duration: 1400,
    });
  };

  const openCivit = async () => {
    if (!dbModel?.civitModelID) return;
    const win = window.open();
    if (win) {
      win.location.href = await getCivitModelPageUrl(
        dbModel.civitModelID,
        selectedVersion?.id ? String(selectedVersion.id) : undefined,
      );
    }
  };

  const versionSize = (v: (typeof versions)[number]) => {
    const file = v.files?.find((f) => f.primary) ?? v.files?.[0];
    return file?.sizeKB ? KBtoGB(file.sizeKB) : undefined;
  };

  // Cover comes from the model's own (stable) version image, decoupled from the
  // async example-image gallery - so it appears once and doesn't swap.
  const cover = selectedVersion?.images?.[0];

  return (
    <Flex direction={"column"} h={"100%"} minH={0}>
      {/* Gray header bar - matches the panel's toolbar chrome. */}
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
        <Tooltip label={t("models.detail.backTooltip")}>
          <IconButton
            size={"sm"}
            variant={"ghost"}
            icon={<IconArrowLeft size={19} />}
            aria-label={t("models.detail.backAria")}
            onClick={onBack}
          />
        </Tooltip>
        <Heading size={"sm"} noOfLines={1}>
          {detail?.name ?? data.model_name}
        </Heading>
        {dbModel?.civitModelID && (
          <Button
            size={"xs"}
            variant={"ghost"}
            leftIcon={<IconExternalLink size={15} />}
            onClick={openCivit}
            flexShrink={0}
          >
            {t("models.openOnCivitai")}
          </Button>
        )}
      </Flex>

      {loading ? (
        <Flex justify={"center"} align={"center"} flex={1}>
          <Spinner />
        </Flex>
      ) : !detail ? (
        <FallbackLocalInfo data={data} />
      ) : (
        <Box flex={1} minH={0} overflowY={"auto"} p={4} sx={hideScrollbarSx}>
          {/* Top row: cover + meta (left) | version list (right, contained) */}
          <Flex gap={4} align={"stretch"} wrap={"wrap"}>
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
                  alt={t("models.detail.coverAlt")}
                />
              )}
              <Text fontSize={"sm"} color={"gray.500"} mt={3}>
                {[detail.type, selectedVersion?.baseModel]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              {selectedVersion?.trainedWords?.length ? (
                <Box mt={3}>
                  <SectionLabel>{t("models.detail.triggerWords")}</SectionLabel>
                  <Wrap>
                    {selectedVersion.trainedWords.map((w, i) => (
                      <WrapItem key={i}>
                        <Tag
                          size={"md"}
                          borderRadius={"full"}
                          cursor={"pointer"}
                          onClick={() =>
                            copy(w, t("models.detail.triggerWordSingular"))
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

            {/* Versions - compact, self-scrolling so a long list stays small. */}
            <Box flex={1} minW={"280px"}>
              <SectionLabel>
                {t("models.detail.versions")}
                {versions.length ? ` (${versions.length})` : ""}
              </SectionLabel>
              <Box
                maxH={"320px"}
                overflowY={"auto"}
                border={"1px solid"}
                borderColor={"rowBorderColor"}
                borderRadius={"md"}
                sx={hideScrollbarSx}
              >
                <Stack spacing={0}>
                  {versions.map((v) => {
                    const active = v.id === selectedVersion?.id;
                    return (
                      <Flex
                        as={"button"}
                        key={v.id}
                        onClick={() => setSelectedVersionId(v.id)}
                        justify={"space-between"}
                        align={"center"}
                        gap={2}
                        px={3}
                        py={2}
                        borderLeft={"2px solid"}
                        borderColor={active ? "blue.400" : "transparent"}
                        bg={active ? "galleryActiveBg" : "transparent"}
                        _hover={{
                          bg: active ? "galleryActiveBg" : "rowHoverBg",
                        }}
                        textAlign={"left"}
                      >
                        <HStack gap={2} minW={0}>
                          <Text
                            fontWeight={500}
                            fontSize={"sm"}
                            noOfLines={1}
                          >
                            {v.name}
                          </Text>
                          {v.id === installedVid && (
                            <Badge
                              colorScheme={"green"}
                              variant={"subtle"}
                              borderRadius={"full"}
                              flexShrink={0}
                            >
                              {t("models.detail.installedBadge")}
                            </Badge>
                          )}
                        </HStack>
                        <HStack
                          gap={3}
                          flexShrink={0}
                          color={"gray.500"}
                          fontSize={"xs"}
                        >
                          {v.baseModel && <Text>{v.baseModel}</Text>}
                          {versionSize(v) && <Text>{versionSize(v)}</Text>}
                        </HStack>
                      </Flex>
                    );
                  })}
                </Stack>
              </Box>
            </Box>
          </Flex>

          {/* Description - its own contained, self-scrolling section. */}
          {descriptionText && (
            <Box mt={5}>
              <SectionLabel>{t("models.detail.description")}</SectionLabel>
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

          {/* Example images with generation meta (prompt on click). A single
              loading state avoids rendering one set and swapping to another. */}
          <Box mt={5}>
            <SectionLabel>{t("models.detail.exampleImages")}</SectionLabel>
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
                        alt={t("models.detail.exampleImageAlt")}
                      />
                      {open && <ImageMeta meta={img.meta} onCopy={copy} />}
                    </Box>
                  );
                })}
              </Flex>
            ) : (
              <Text fontSize={"sm"} color={"gray.500"}>
                {t("models.detail.noExampleImages")}
              </Text>
            )}
          </Box>
        </Box>
      )}
    </Flex>
  );
}

function FallbackLocalInfo({ data }: { data: ModelsListRespItem }) {
  const { t } = useT();
  return (
    <Box flex={1} minH={0} overflowY={"auto"} p={4}>
      <Flex gap={4} align={"flex-start"} wrap={"wrap"}>
        {data.preview && (
          <Image
            src={data.preview}
            w={"220px"}
            borderRadius={"md"}
            objectFit={"cover"}
            alt={t("models.detail.previewAlt")}
          />
        )}
        <Box>
          <Text fontSize={"sm"} color={"gray.500"} mb={3}>
            {t("models.detail.notFoundOnCivitai")}
          </Text>
          <Stack spacing={1} fontSize={"sm"}>
            <Text>
              <b>{t("models.detail.fileLabel")}</b>{" "}
              {data.model_name + data.model_extension}
            </Text>
            <Text>
              <b>{t("models.detail.typeLabel")}</b> {data.model_type}
            </Text>
            <Text>
              <b>{t("models.detail.modifiedLabel")}</b>{" "}
              {data.date.toLocaleDateString()}
            </Text>
          </Stack>
        </Box>
      </Flex>
    </Box>
  );
}
