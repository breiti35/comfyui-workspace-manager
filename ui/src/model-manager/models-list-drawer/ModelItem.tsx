import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Image,
  Spinner,
  Text,
  Tooltip,
  useToast,
} from "@chakra-ui/react";
import { ModelsListRespItem } from "../types";
import { useEffect, useState } from "react";
import { indexdb } from "../../db-tables/indexdb";
import { Model } from "../../types/dbTypes";
import type { DragEvent, MouseEvent as ReactMouseEvent } from "react";
import {
  IconCopy,
  IconStar,
  IconStarFilled,
  IconWorld,
} from "@tabler/icons-react";
import {
  fetchCivitModelFromHashKey,
  getCivitModelPageUrl,
  isNsfwBlurEligibleCategory,
} from "../../utils/civitUtils";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";
import { useInView } from "../hooks/useInView";
import { isModelFavorite, toggleModelFavorite } from "./modelFavorites";

const NSFW_BLUR_FILTER = "blur(20px)";

interface Props {
  data: ModelsListRespItem;
  onOpenDetail: (data: ModelsListRespItem) => void;
}

const MODEL_TYPE_TO_NODE_MAPPING: Record<string, string> = {
  checkpoints: "CheckpointLoaderSimple",
  vae: "VAELoader",
  loras: "LoraLoader",
  controlnet: "ControlNetLoader",
  upscale_models: "UpscaleModelLoader",
};

// Short type badge (like the reference's "CKPT").
const TYPE_ABBR: Record<string, string> = {
  checkpoints: "CKPT",
  loras: "LORA",
  vae: "VAE",
  controlnet: "CN",
  upscale_models: "UPSC",
  embeddings: "EMB",
  hypernetworks: "HYP",
  clip: "CLIP",
  clip_vision: "CLIPV",
  unet: "UNET",
  diffusion_models: "DIFF",
};

function baseModelAbbr(b?: string): string | undefined {
  if (!b) return undefined;
  const rules: [RegExp, string][] = [
    [/xl/i, "XL"],
    [/pony/i, "Pony"],
    [/flux/i, "Flux"],
    [/sd\s*3/i, "SD3"],
    [/1\.5/, "SD1.5"],
    [/2\.\d/, "SD2"],
  ];
  for (const [re, label] of rules) if (re.test(b)) return label;
  return b.length > 8 ? b.slice(0, 8) : b;
}

export function ModelItem({ data, onOpenDetail }: Props) {
  const { ref, inView } = useInView<HTMLDivElement>("400px");
  const [url, setUrl] = useState<string>();
  const [isNsfw, setIsNsfw] = useState(false);
  const [showNsfw, setShowNsfw] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [hashing, setHashing] = useState(!data.file_hash);
  const [model, setModel] = useState<Model>();
  const [isFav, setIsFav] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setIsFav(isModelFavorite(data.model_name + "@" + data.model_type));
  }, [data.model_name, data.model_type]);

  // Defer the (possibly networked) thumbnail lookup until the card is near the
  // viewport, so a large grid doesn't hammer indexdb + Civitai up front.
  useEffect(() => {
    if (!inView) return;
    setHashing(!data.file_hash);
    getThumbnail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, data.file_hash]);

  useEffect(() => {
    const updateShowNsfw = () => {
      userSettingsTable?.getSetting("showNsfwModelThumbnail").then((res) => {
        setShowNsfw(res ?? false);
      });
    };
    updateShowNsfw();
    window.addEventListener("showNsfwModelThumbnail", updateShowNsfw);
    return () => {
      window.removeEventListener("showNsfwModelThumbnail", updateShowNsfw);
    };
  }, []);

  const getThumbnail = async () => {
    const nsfwEligible = isNsfwBlurEligibleCategory(data.model_type);
    const m = await indexdb.models.get(
      data.model_name + "@" + data.model_type,
    );
    if (m != null) {
      setModel(m);
      m.imageUrl?.length && setUrl(m.imageUrl);
      setIsNsfw(nsfwEligible && (m.imageIsNsfw ?? false));
    }
    if (!m?.imageUrl && data.file_hash != null) {
      try {
        const json = await fetchCivitModelFromHashKey(data.file_hash);
        const image_url = json.imageUrl;
        image_url && setUrl(image_url);
        const imageIsNsfw = nsfwEligible && (json.imageIsNsfw ?? false);
        setIsNsfw(imageIsNsfw);

        const newModel: Model = {
          id: data.model_name + "@" + data.model_type,
          fileHash: data.file_hash,
          fileFolder: data.model_type,
          fileName: data.model_name + data.model_extension,
          modelName: json.modelName ?? null,
          versionName: json.versionName,
          baseModel: json.baseModel,
          civitModelID: json.civitModelID,
          civitModelVersionID: json.civitModelVersionID,
          imageUrl: image_url ?? null,
          imageIsNsfw,
        };
        indexdb.models.put(newModel);
        setModel(newModel);
      } catch (e) {}
    }
    if (data.preview) setUrl(data.preview);
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    const nodeType = MODEL_TYPE_TO_NODE_MAPPING[data.model_type];
    if (!nodeType) return;
    e.dataTransfer.setData("eventName", "WorkspaceManagerAddNode");
    e.dataTransfer.setData(
      "modelRelativePath",
      data.model_name + data.model_extension,
    );
    e.dataTransfer.setData("nodeType", nodeType);
  };

  const openCivit = async (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (!model?.civitModelID) return;
    const win = window.open();
    if (win) {
      win.location.href = await getCivitModelPageUrl(
        model.civitModelID,
        model.civitModelVersionID,
      );
    }
  };

  const copyName = (e: ReactMouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(data.model_name + data.model_extension);
    toast({ title: "Dateiname kopiert", status: "success", duration: 1400 });
  };

  const toggleFav = (e: ReactMouseEvent) => {
    e.stopPropagation();
    setIsFav(toggleModelFavorite(data.model_name + "@" + data.model_type));
  };

  const versionChip = model?.versionName ?? undefined;
  const typeBadge =
    TYPE_ABBR[data.model_type] ?? data.model_type.slice(0, 4).toUpperCase();
  const baseBadge = baseModelAbbr(model?.baseModel);
  const blurred = isNsfw && !showNsfw && !revealed;

  const actionBtnProps = {
    size: "xs" as const,
    variant: "ghost" as const,
    color: "white",
    bg: "blackAlpha.500",
    _hover: { bg: "blackAlpha.700" },
    minW: "auto",
    h: "22px",
    w: "22px",
  };

  return (
    <Box
      ref={ref}
      role="group"
      position="relative"
      borderRadius="lg"
      overflow="hidden"
      sx={{ aspectRatio: "3 / 4" }}
      draggable
      onDragStart={handleDragStart}
      cursor="pointer"
      onClick={() => onOpenDetail(data)}
      border="1px solid"
      borderColor="rowBorderColor"
      _hover={{ borderColor: "blue.400" }}
      transition="border-color 0.12s ease"
      bg="blackAlpha.300"
    >
      {/* Cover */}
      {hashing || (inView && !url) ? (
        <Flex position="absolute" inset={0} justify="center" align="center">
          <Spinner size="sm" />
        </Flex>
      ) : url ? (
        <Image
          src={url}
          loading="lazy"
          draggable={false}
          position="absolute"
          inset={0}
          width="100%"
          height="100%"
          objectFit="cover"
          filter={blurred ? NSFW_BLUR_FILTER : undefined}
        />
      ) : null}

      {/* Top strip: type/base badges + hover actions */}
      <Flex
        position="absolute"
        top={0}
        left={0}
        right={0}
        p={1.5}
        gap={1}
        justify="space-between"
        align="flex-start"
        bgGradient="linear(to-b, blackAlpha.700, transparent)"
        pointerEvents="none"
      >
        <HStack gap={1} pointerEvents="none">
          <Badge
            colorScheme="blackAlpha"
            bg="blackAlpha.600"
            color="whiteAlpha.900"
            fontSize="9px"
            px={1}
          >
            {typeBadge}
          </Badge>
          {baseBadge && (
            <Badge
              colorScheme="blackAlpha"
              bg="blackAlpha.600"
              color="whiteAlpha.900"
              fontSize="9px"
              px={1}
            >
              {baseBadge}
            </Badge>
          )}
        </HStack>
        <HStack
          gap={1}
          opacity={0}
          _groupHover={{ opacity: 1 }}
          transition="opacity 0.12s ease"
          pointerEvents="auto"
        >
          <Tooltip label={isFav ? "Favorit entfernen" : "Favorit"}>
            <IconButton
              aria-label="favorite"
              icon={
                isFav ? (
                  <IconStarFilled size={13} />
                ) : (
                  <IconStar size={13} />
                )
              }
              onClick={toggleFav}
              {...actionBtnProps}
              color={isFav ? "yellow.300" : "white"}
            />
          </Tooltip>
          {model?.civitModelID && (
            <Tooltip label="Auf Civitai öffnen">
              <IconButton
                aria-label="open civitai"
                icon={<IconWorld size={13} />}
                onClick={openCivit}
                {...actionBtnProps}
              />
            </Tooltip>
          )}
          <Tooltip label="Dateiname kopieren">
            <IconButton
              aria-label="copy filename"
              icon={<IconCopy size={13} />}
              onClick={copyName}
              {...actionBtnProps}
            />
          </Tooltip>
        </HStack>
      </Flex>

      {/* NSFW reveal (per-card) */}
      {blurred && (
        <Flex
          position="absolute"
          inset={0}
          direction="column"
          justify="center"
          align="center"
          gap={2}
          bg="blackAlpha.400"
        >
          <Text color="white" fontSize="xs" fontWeight={600}>
            R-bewerteter Inhalt
          </Text>
          <Button
            size="xs"
            colorScheme="blue"
            onClick={(e) => {
              e.stopPropagation();
              setRevealed(true);
            }}
          >
            Anzeigen
          </Button>
        </Flex>
      )}

      {/* Bottom strip: name + version chip */}
      <Box
        position="absolute"
        bottom={0}
        left={0}
        right={0}
        px={2}
        pt={8}
        pb={2}
        bgGradient="linear(to-t, rgba(0,0,0,0.92), rgba(0,0,0,0.5) 55%, transparent)"
        pointerEvents="none"
      >
        <Tooltip label={data.model_name + data.model_extension}>
          <Text color="white" fontSize="sm" fontWeight={600} noOfLines={2}>
            {data.model_name}
          </Text>
        </Tooltip>
        {versionChip && (
          <Text color="whiteAlpha.800" fontSize="xs" noOfLines={1} mt={0.5}>
            {versionChip}
          </Text>
        )}
      </Box>
    </Box>
  );
}
