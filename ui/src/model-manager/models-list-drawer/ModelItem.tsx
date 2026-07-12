import { Box, Flex, Image, Spinner, Text, Tooltip } from "@chakra-ui/react";
import { ModelsListRespItem } from "../types";
import { useEffect, useState } from "react";
import { indexdb } from "../../db-tables/indexdb";
import { Model } from "../../types/dbTypes";
import type { DragEvent } from "react";
import {
  fetchCivitModelFromHashKey,
  getCivitModelPageUrl,
} from "../../utils/civitUtils";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";

const NSFW_BLUR_FILTER = "blur(20px)";

interface Props {
  data: ModelsListRespItem;
}

const MODEL_TYPE_TO_NODE_MAPPING: Record<string, string> = {
  checkpoints: "CheckpointLoaderSimple",
  vae: "VAELoader",
  loras: "LoraLoader",
  controlnet: "ControlNetLoader",
  upscale_models: "UpscaleModelLoader",
};

export function ModelItem({ data }: Props) {
  const [url, setUrl] = useState(
    "https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/27fd7433-cb0a-4a87-88c1-21ccb2b1a842/width=450/00060-881622046.jpeg",
  );
  // Defaults to true (blur) until proven safe - see civitUtils.ts.
  const [isNsfw, setIsNsfw] = useState(true);
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
    const model = await indexdb.models.get(
      data.model_name + "@" + data.model_type,
    );
    if (model != null) {
      setModel(model);
      model.imageUrl?.length && setUrl(model.imageUrl);
      // A stale record from before this fix (or from the model-list bulk
      // scan) may lack this field entirely - treat that as unknown, not safe.
      setIsNsfw(model.imageIsNsfw ?? true);
    }
    if (!model?.imageUrl && data.file_hash != null) {
      try {
        const json = await fetchCivitModelFromHashKey(data.file_hash);
        const image_url = json.imageUrl;
        image_url && setUrl(image_url);
        setIsNsfw(json.imageIsNsfw ?? true);

        const newModel: Model = {
          id: data.model_name + "@" + data.model_type,
          fileHash: data.file_hash,
          fileFolder: data.model_type,
          fileName: data.model_name + data.model_extension,
          modelName: json.modelName ?? null,
          civitModelID: json.civitModelID,
          civitModelVersionID: json.civitModelVersionID,
          imageUrl: image_url ?? null,
          imageIsNsfw: json.imageIsNsfw ?? true,
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

  return (
    <Box>
      <Box
        position="relative"
        borderRadius="md"
        draggable
        onDragStart={handleDragStart}
      >
        {hashing ? (
          <Flex
            bg="rgba(0, 0, 0, 0.5)"
            height={180}
            justifyContent="center"
            alignItems="center"
          >
            <Spinner />
          </Flex>
        ) : (
          <Image
            src={url}
            draggable={false}
            boxSize="100%"
            height={180}
            objectFit="cover"
            borderRadius="md"
            filter={isNsfw && !showNsfw ? NSFW_BLUR_FILTER : undefined}
            cursor={model?.civitModelID != null ? "pointer" : "auto"}
            onClick={async () => {
              if (
                model?.civitModelID == null ||
                model?.civitModelVersionID == null
              ) {
                return;
              }
              const win = window.open();
              if (win) {
                win.location.href = await getCivitModelPageUrl(
                  model.civitModelID,
                  model.civitModelVersionID,
                );
              }
            }}
          />
        )}
        {!hashing && isNsfw && !showNsfw && (
          <Text
            position="absolute"
            bottom="0"
            left="0"
            right="0"
            bg="rgba(0, 0, 0, 0.6)"
            color="white"
            fontSize={12}
            textAlign="center"
            py={"1px"}
          >
            NSFW
          </Text>
        )}
      </Box>
      <Tooltip
        label={
          <span>
            {data.model_name + data.model_extension}
            <br />
            {data.date.toLocaleDateString()}
          </span>
        }
      >
        <Text textAlign="center" p="1" fontSize={14} noOfLines={2}>
          {data.model_name + data.model_extension}
        </Text>
      </Tooltip>
    </Box>
  );
}
