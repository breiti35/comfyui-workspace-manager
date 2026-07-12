import {
  Badge,
  Box,
  Button,
  HStack,
  Text,
  Image,
  Stack,
  Tooltip,
  Card,
  Flex,
  Select,
} from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import { IconDownload } from "@tabler/icons-react";
import {
  FileEssential,
  apiResponse,
  getFileEssential,
  isCivitModel,
} from "./util/modelTypes";
import { KBtoGB } from "../utils";
import { findImageFromModel } from "../../utils/findSfwImage";
import { getCivitModelPageUrl } from "../../utils/civitUtils";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";
const IMAGE_SIZE = 280;
const NSFW_BLUR_FILTER = "blur(20px)";

interface ModelCardProps {
  model: apiResponse;
  onClickInstallModel: (file: FileEssential, model: apiResponse) => void;
  installing: string[];
}
export default function ModelCard({
  model,
  onClickInstallModel,
  installing,
}: ModelCardProps) {
  const [modelPhoto, setModelPhoto] = useState<string>();
  const [isNsfw, setIsNsfw] = useState(false);
  const [showNsfw, setShowNsfw] = useState(false);
  useEffect(() => {
    const picked = findImageFromModel(model, IMAGE_SIZE);
    setModelPhoto(picked.url);
    setIsNsfw(picked.isNsfw);
  }, [model]);
  useEffect(() => {
    const updateShowNsfw = () => {
      userSettingsTable?.getSetting("showNsfwModelThumbnail").then((res) => {
        setShowNsfw(res ?? false);
      });
    };
    updateShowNsfw();
    // Purely a local setting read (no Civitai call), so this can run on
    // every toggle without needing to re-fetch the photo itself.
    window.addEventListener("showNsfwModelThumbnail", updateShowNsfw);
    return () => {
      window.removeEventListener("showNsfwModelThumbnail", updateShowNsfw);
    };
  }, []);
  const versions = isCivitModel(model) ? model.modelVersions : model.versions;
  const [selectedFile, setSelectedFile] = useState<string>(
    versions?.[0]?.name ?? "",
  );
  const curFile = versions?.find(
    (versionFile) => versionFile?.name === selectedFile,
  );
  const onClickMedia = async () => {
    // Open the tab synchronously (on the click gesture) and navigate it once
    // the URL is resolved, so browser popup blockers don't kick in on the
    // await below.
    const win = window.open();
    if (win) win.location.href = await getCivitModelPageUrl(String(model.id));
  };
  const installHandler = useCallback(() => {
    if (curFile == null) {
      console.error("no file is find by name", selectedFile);
      return;
    }
    onClickInstallModel(getFileEssential(curFile, model.name), model);
  }, [selectedFile]);
  const sizeKB = getFileEssential(curFile)?.sizeKB;
  return (
    <Card width={IMAGE_SIZE} justifyContent={"space-between"} mb={2} gap={1}>
      <Box position="relative">
        <Image
          borderRadius="md"
          boxSize={IMAGE_SIZE + "px"}
          objectFit="cover"
          src={modelPhoto}
          alt={"model cover image"}
          cursor={"pointer"}
          filter={isNsfw && !showNsfw ? NSFW_BLUR_FILTER : undefined}
          onClick={() => onClickMedia()}
        />
        {isNsfw && !showNsfw && (
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
      <Stack p={1}>
        <Tooltip label={model.name}>
          <Text fontWeight={500} noOfLines={1}>
            {model.name}
          </Text>
        </Tooltip>
        <Flex justifyContent={"space-between"} alignItems={"center"} gap={2}>
          <Badge
            colorScheme={"gray"}
            borderRadius={"full"}
            px={2}
            maxWidth={"50%"}
            textTransform={"none"}
            overflow={"hidden"}
            textOverflow={"ellipsis"}
            whiteSpace={"nowrap"}
          >
            {model.type}
          </Badge>
          <Button
            leftIcon={<IconDownload size={18} />}
            iconSpacing={1}
            borderRadius={"md"}
            size={"sm"}
            py={1}
            colorScheme="blue"
            type="submit"
            onClick={() => installHandler()}
            isDisabled={Boolean(
              selectedFile && installing.includes(selectedFile),
            )}
          >
            Install
          </Button>
        </Flex>

        <HStack>
          <Select
            size={"md"}
            style={{ paddingLeft: 4 }}
            onChange={(e) => {
              setSelectedFile(e.target.value);
            }}
          >
            {versions?.map((versionFile) => {
              const filename = versionFile?.name;
              if (!filename) return null;
              return (
                <option
                  value={filename}
                  key={versionFile.id}
                  style={{ padding: 0 }}
                >
                  {filename}
                </option>
              );
            })}
          </Select>
          {sizeKB && (
            <Tooltip label={KBtoGB(sizeKB)}>
              <Text flexShrink={1} noOfLines={1} width={"40%"}>
                {KBtoGB(sizeKB)}
              </Text>
            </Tooltip>
          )}
        </HStack>
      </Stack>
    </Card>
  );
}
