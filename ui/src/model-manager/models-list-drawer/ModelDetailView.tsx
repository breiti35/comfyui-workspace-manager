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
import { useEffect, useState } from "react";
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
} from "../api/civitDetailApi";
import { getCivitModelPageUrl } from "../../utils/civitUtils";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";
import { KBtoGB } from "../utils";

const NSFW_BLUR_FILTER = "blur(20px)";

interface Props {
  data: ModelsListRespItem;
  onBack: () => void;
}

const isImgNsfw = (nsfw?: string) => nsfw === "Mature" || nsfw === "X";

export default function ModelDetailView({ data, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [dbModel, setDbModel] = useState<Model>();
  const [detail, setDetail] = useState<CivitiModel | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<number>();
  const [showNsfw, setShowNsfw] = useState(false);
  const [openMetaId, setOpenMetaId] = useState<number>();
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
      setOpenMetaId(undefined);
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

  const cover = selectedVersion?.images?.find((i) => i.url) ?? undefined;
  const coverBlur = isImgNsfw(cover?.nsfw) && !showNsfw;

  return (
    <Flex direction={"column"} h={"100%"} minH={0}>
      <HStack mb={3} gap={2} flexShrink={0}>
        <Tooltip label={"Zurück zur Übersicht"}>
          <IconButton
            size={"sm"}
            variant={"ghost"}
            icon={<IconArrowLeft size={19} />}
            aria-label={"back to models"}
            onClick={onBack}
          />
        </Tooltip>
        <Heading size={"md"} noOfLines={1}>
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
      </HStack>

      {loading ? (
        <Flex justify={"center"} align={"center"} flex={1}>
          <Spinner />
        </Flex>
      ) : !detail ? (
        <FallbackLocalInfo data={data} />
      ) : (
        <Box flex={1} minH={0} overflowY={"auto"} pr={2}>
          {/* Cover + description + trigger words */}
          <Flex gap={4} align={"flex-start"} wrap={"wrap"}>
            {cover?.url && (
              <Image
                src={cover.url}
                w={"260px"}
                maxW={"100%"}
                borderRadius={"md"}
                objectFit={"cover"}
                filter={coverBlur ? NSFW_BLUR_FILTER : undefined}
                alt={"model cover"}
              />
            )}
            <Box flex={1} minW={"280px"}>
              <Text fontSize={"sm"} color={"gray.500"} mb={3}>
                {[detail.type, selectedVersion?.baseModel]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>

              {selectedVersion?.trainedWords?.length ? (
                <Box mb={4}>
                  <Text
                    fontSize={"xs"}
                    textTransform={"uppercase"}
                    letterSpacing={"wider"}
                    color={"gray.500"}
                    mb={2}
                  >
                    Trigger-Wörter
                  </Text>
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

              {civitDescriptionToText(detail.description) && (
                <Text fontSize={"sm"} whiteSpace={"pre-wrap"}>
                  {civitDescriptionToText(detail.description)}
                </Text>
              )}
            </Box>
          </Flex>

          {/* Version list */}
          {versions.length > 0 && (
            <Box mt={6}>
              <Text
                fontSize={"xs"}
                textTransform={"uppercase"}
                letterSpacing={"wider"}
                color={"gray.500"}
                mb={2}
              >
                Versionen
              </Text>
              <Stack spacing={1}>
                {versions.map((v) => {
                  const active = v.id === selectedVersion?.id;
                  return (
                    <Flex
                      as={"button"}
                      key={v.id}
                      onClick={() => {
                        setSelectedVersionId(v.id);
                        setOpenMetaId(undefined);
                      }}
                      justify={"space-between"}
                      align={"center"}
                      gap={2}
                      px={3}
                      py={2}
                      borderRadius={"md"}
                      borderLeft={"2px solid"}
                      borderColor={active ? "blue.400" : "transparent"}
                      bg={active ? "galleryActiveBg" : "transparent"}
                      _hover={{ bg: active ? "galleryActiveBg" : "rowHoverBg" }}
                      textAlign={"left"}
                    >
                      <HStack gap={2} minW={0}>
                        <Text fontWeight={500} fontSize={"sm"} noOfLines={1}>
                          {v.name}
                        </Text>
                        {v.id === installedVid && (
                          <Badge
                            colorScheme={"green"}
                            borderRadius={"full"}
                            flexShrink={0}
                          >
                            installiert
                          </Badge>
                        )}
                      </HStack>
                      <HStack gap={3} flexShrink={0} color={"gray.500"}>
                        {v.baseModel && (
                          <Text fontSize={"xs"}>{v.baseModel}</Text>
                        )}
                        {versionSize(v) && (
                          <Text fontSize={"xs"}>{versionSize(v)}</Text>
                        )}
                      </HStack>
                    </Flex>
                  );
                })}
              </Stack>
            </Box>
          )}

          {/* Example images with generation meta */}
          {selectedVersion?.images?.length ? (
            <Box mt={6}>
              <Text
                fontSize={"xs"}
                textTransform={"uppercase"}
                letterSpacing={"wider"}
                color={"gray.500"}
                mb={2}
              >
                Beispielbilder – zum Prompt anklicken
              </Text>
              <Flex wrap={"wrap"} gap={3} align={"flex-start"}>
                {selectedVersion.images.map((img) => {
                  const blur = isImgNsfw(img.nsfw) && !showNsfw;
                  const open = openMetaId === img.id;
                  return (
                    <Box key={img.id} w={"180px"}>
                      <Image
                        src={img.url}
                        w={"180px"}
                        h={"180px"}
                        objectFit={"cover"}
                        borderRadius={"md"}
                        cursor={"pointer"}
                        filter={blur ? NSFW_BLUR_FILTER : undefined}
                        onClick={() =>
                          setOpenMetaId(open ? undefined : img.id)
                        }
                        alt={"example"}
                      />
                      {open && (
                        <ImageMeta meta={img.meta} onCopy={copy} />
                      )}
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

function ImageMeta({
  meta,
  onCopy,
}: {
  meta?: {
    prompt?: string;
    negativePrompt?: string;
    sampler?: string;
    steps?: number;
    cfgScale?: number;
    seed?: number;
  };
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
    <Box flex={1} minH={0} overflowY={"auto"}>
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
