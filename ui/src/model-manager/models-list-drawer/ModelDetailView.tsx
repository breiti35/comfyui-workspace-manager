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
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  getCivitModelDetail,
  getCivitVersionImages,
  type CivitImageWithMeta,
} from "../api/civitDetailApi";
import { getCivitModelPageUrl } from "../../utils/civitUtils";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";
import { KBtoGB, hideScrollbarSx } from "../utils";

const NSFW_BLUR_FILTER = "blur(20px)";

interface Props {
  data: ModelsListRespItem;
  onBack: () => void;
}

// Civitai's numeric browsing level: 1=PG, 2=PG13, 4=R, 8=X, 16=XXX.
const NSFW_STRING_TO_LEVEL: Record<string, number> = {
  None: 1,
  Soft: 2,
  Mature: 4,
  X: 8,
};

export default function ModelDetailView({ data, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [dbModel, setDbModel] = useState<Model>();
  const [detail, setDetail] = useState<CivitiModel | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<number>();
  const [showNsfw, setShowNsfw] = useState(false);
  const [openMetaIdx, setOpenMetaIdx] = useState<number>();
  const [versionImages, setVersionImages] = useState<CivitImageWithMeta[]>([]);
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
  useEffect(() => {
    let cancelled = false;
    setOpenMetaIdx(undefined);
    setVersionImages([]);
    const vid = selectedVersion?.id;
    if (vid == null) return;
    getCivitVersionImages(vid).then((imgs) => {
      if (!cancelled) setVersionImages(imgs);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedVersion?.id]);

  // Prefer images-with-meta; fall back to the version's plain images (no meta).
  const galleryImages: CivitImageWithMeta[] = versionImages.length
    ? versionImages
    : (selectedVersion?.images ?? []).map((im) => ({
        url: im.url,
        meta: im.meta,
        nsfwLevel: im.nsfw ? NSFW_STRING_TO_LEVEL[im.nsfw] ?? 1 : 1,
      }));

  const isBlur = (nsfwLevel?: number) => (nsfwLevel ?? 1) >= 4 && !showNsfw;

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    toast({ title: `${label} kopiert`, status: "success", duration: 1400 });
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

  const cover = galleryImages[0];

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
        <Tooltip label={"Zurück zur Übersicht"}>
          <IconButton
            size={"sm"}
            variant={"ghost"}
            icon={<IconArrowLeft size={19} />}
            aria-label={"back to models"}
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
            Auf Civitai öffnen
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
                  src={cover.url}
                  loading={"lazy"}
                  w={"100%"}
                  borderRadius={"md"}
                  objectFit={"cover"}
                  maxH={"320px"}
                  filter={isBlur(cover.nsfwLevel) ? NSFW_BLUR_FILTER : undefined}
                  alt={"model cover"}
                />
              )}
              <Text fontSize={"sm"} color={"gray.500"} mt={3}>
                {[detail.type, selectedVersion?.baseModel]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              {selectedVersion?.trainedWords?.length ? (
                <Box mt={3}>
                  <SectionLabel>Trigger-Wörter</SectionLabel>
                  <Wrap>
                    {selectedVersion.trainedWords.map((w, i) => (
                      <WrapItem key={i}>
                        <Tag
                          size={"md"}
                          borderRadius={"full"}
                          cursor={"pointer"}
                          onClick={() => copy(w, "Trigger-Wort")}
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
                Versionen{versions.length ? ` (${versions.length})` : ""}
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
                              installiert
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
              <SectionLabel>Beschreibung</SectionLabel>
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

          {/* Example images with generation meta (prompt on click). */}
          {galleryImages.length ? (
            <Box mt={5}>
              <SectionLabel>Beispielbilder – zum Prompt anklicken</SectionLabel>
              <Flex wrap={"wrap"} gap={3} align={"flex-start"}>
                {galleryImages.map((img, idx) => {
                  const open = openMetaIdx === idx;
                  return (
                    <Box key={idx} w={"180px"}>
                      <Image
                        src={img.url}
                        loading={"lazy"}
                        w={"180px"}
                        h={"180px"}
                        objectFit={"cover"}
                        borderRadius={"md"}
                        cursor={"pointer"}
                        filter={
                          isBlur(img.nsfwLevel) ? NSFW_BLUR_FILTER : undefined
                        }
                        onClick={() =>
                          setOpenMetaIdx(open ? undefined : idx)
                        }
                        alt={"example"}
                      />
                      {open && <ImageMeta meta={img.meta} onCopy={copy} />}
                    </Box>
                  );
                })}
              </Flex>
            </Box>
          ) : null}
        </Box>
      )}
    </Flex>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text
      fontSize={"xs"}
      textTransform={"uppercase"}
      letterSpacing={"wider"}
      color={"gray.500"}
      mb={2}
    >
      {children}
    </Text>
  );
}

function ImageMeta({
  meta,
  onCopy,
}: {
  meta?: CivitImageWithMeta["meta"];
  onCopy: (text: string, label: string) => void;
}) {
  if (!meta || (!meta.prompt && !meta.sampler && meta.seed == null)) {
    return (
      <Text fontSize={"xs"} color={"gray.500"} mt={1}>
        Keine Prompt-Daten hinterlegt.
      </Text>
    );
  }
  return (
    <Box
      mt={1}
      p={2}
      borderRadius={"md"}
      border={"1px solid"}
      borderColor={"rowBorderColor"}
      fontSize={"xs"}
    >
      {meta.prompt && (
        <Box mb={2}>
          <HStack justify={"space-between"} mb={1}>
            <Text color={"gray.500"}>Prompt</Text>
            <IconButton
              size={"xs"}
              variant={"ghost"}
              aria-label={"copy prompt"}
              icon={<IconCopy size={13} />}
              onClick={() => onCopy(meta.prompt ?? "", "Prompt")}
            />
          </HStack>
          <Text noOfLines={4}>{meta.prompt}</Text>
        </Box>
      )}
      <Wrap spacing={2} color={"gray.500"}>
        {meta.sampler && <WrapItem>Sampler: {meta.sampler}</WrapItem>}
        {meta.steps != null && <WrapItem>Steps: {meta.steps}</WrapItem>}
        {meta.cfgScale != null && <WrapItem>CFG: {meta.cfgScale}</WrapItem>}
        {meta.seed != null && <WrapItem>Seed: {meta.seed}</WrapItem>}
      </Wrap>
    </Box>
  );
}

function FallbackLocalInfo({ data }: { data: ModelsListRespItem }) {
  return (
    <Box flex={1} minH={0} overflowY={"auto"} p={4}>
      <Flex gap={4} align={"flex-start"} wrap={"wrap"}>
        {data.preview && (
          <Image
            src={data.preview}
            w={"220px"}
            borderRadius={"md"}
            objectFit={"cover"}
            alt={"preview"}
          />
        )}
        <Box>
          <Text fontSize={"sm"} color={"gray.500"} mb={3}>
            Nicht auf Civitai gefunden – nur lokale Infos verfügbar.
          </Text>
          <Stack spacing={1} fontSize={"sm"}>
            <Text>
              <b>Datei:</b> {data.model_name + data.model_extension}
            </Text>
            <Text>
              <b>Typ:</b> {data.model_type}
            </Text>
            <Text>
              <b>Geändert:</b> {data.date.toLocaleDateString()}
            </Text>
          </Stack>
        </Box>
      </Flex>
    </Box>
  );
}
