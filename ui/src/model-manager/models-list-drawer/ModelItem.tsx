import { Box, Flex, Image, Spinner, Text, Tooltip } from "@chakra-ui/react";
import { ModelsListRespItem } from "../types";
import { useEffect, useState } from "react";
import { indexdb } from "../../db-tables/indexdb";
import { Model } from "../../types/dbTypes";
import type { DragEvent } from "react";
import {
  fetchCivitModelFromHashKey,
  isNsfwBlurEligibleCategory,
} from "../../utils/civitUtils";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";

const NSFW_BLUR_FILTER = "blur(20px)";
const CARD_IMAGE_HEIGHT = 220;

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

export function ModelItem({ data, onOpenDetail }: Props) {
  const [url, setUrl] = useState(
    "https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/27fd7433-cb0a-4a87-88c1-21ccb2b1a842/width=450/00060-881622046.jpeg",
  );
  // Only true for checkpoints/loras on a confirmed Civitai NSFW hit -
  // see civitUtils.ts.
  const [isNsfw, setIsNsfw] = useState(false);
  const [showNsfw, setShowNsfw] = useState(false);
  const [hashing, setHashing] = useState(!data.file_hash);
  const [model, setModel] = useState<Model>();

  useEffect(() => {
    setHashing(!data.file_hash);
    getThumbnail();
  }, [data.file_hash]);

  useEffect(() => {
    const updateShowNsfw = () => {
      userSettingsTable?.getSetting("showNsfwModelThumbnail").then((res) => {
        setShowNsfw(res ?? false);
      });
    };
    updateShowNsfw();
    // Purely a local setting read (no Civitai call), so this can run on
    // every toggle without needing to re-fetch the thumbnail itself.
    window.addEventListener("showNsfwModelThumbnail", updateShowNsfw);
    return () => {
      window.removeEventListener("showNsfwModelThumbnail", updateShowNsfw);
    };
  }, []);

  const getThumbnail = async () => {
    // vae/upscale_models/ultralytics_*/sams/etc. never generate images
    // themselves, so blurring them makes no sense regardless of what a
    // hash lookup (or a stale cached record) says.
    const nsfwEligible = isNsfwBlurEligibleCategory(data.model_type);
    const model = await indexdb.models.get(
      data.model_name + "@" + data.model_type,
    );
    if (model != null) {
      setModel(model);
      model.imageUrl?.length && setUrl(model.imageUrl);
      setIsNsfw(nsfwEligible && (model.imageIsNsfw ?? false));
    }
    if (!model?.imageUrl && data.file_hash != null) {
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
    if (!nodeType) {
      return;
    }
    e.dataTransfer.setData("eventName", "WorkspaceManagerAddNode");
    e.dataTransfer.setData(
      "modelRelativePath",
      data.model_name + data.model_extension,
    );
    e.dataTransfer.setData("nodeType", nodeType);
  };

  const versionChip = model?.versionName ?? model?.baseModel ?? undefined;

  return (
    <Box
      position="relative"
      borderRadius="md"
      overflow="hidden"
      draggable
      onDragStart={handleDragStart}
      cursor="pointer"
      onClick={() => onOpenDetail(data)}
      role="group"
      border="1px solid"
      borderColor="rowBorderColor"
      _hover={{ borderColor: "blue.400" }}
      transition="border-color 0.12s ease"
    >
      {hashing ? (
        <Flex
          bg="rgba(0, 0, 0, 0.5)"
          height={CARD_IMAGE_HEIGHT}
          justifyContent="center"
          alignItems="center"
        >
          <Spinner />
        </Flex>
      ) : (
        <Image
          src={url}
          draggable={false}
          width="100%"
          height={CARD_IMAGE_HEIGHT}
          objectFit="cover"
          filter={isNsfw && !showNsfw ? NSFW_BLUR_FILTER : undefined}
        />
      )}

      {!hashing && isNsfw && !showNsfw && (
        <Text
          position="absolute"
          top={1}
          left={1}
          bg="rgba(0, 0, 0, 0.65)"
          color="white"
          fontSize={11}
          borderRadius="sm"
          px={1.5}
          py={"1px"}
        >
          NSFW
        </Text>
      )}

      {/* Name + version chip overlaid on the bottom of the cover. */}
      <Box
        position="absolute"
        bottom={0}
        left={0}
        right={0}
        px={2}
        pt={8}
        pb={2}
        bgGradient="linear(to-t, rgba(0,0,0,0.9), rgba(0,0,0,0.55) 55%, transparent)"
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
