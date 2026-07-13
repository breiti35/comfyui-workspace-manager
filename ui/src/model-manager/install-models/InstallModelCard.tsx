import {
  Badge,
  Box,
  Button,
  CircularProgress,
  Flex,
  HStack,
  Image,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { IconCheck, IconDownload, IconHeart } from "@tabler/icons-react";
import type { CivitiModel } from "../types";
import { findImageFromModel } from "../../utils/findSfwImage";
import { civitThumbUrl } from "../api/civitDetailApi";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";
import { useInView } from "../hooks/useInView";
import { formatCount } from "../utils";
import { NSFW_BLUR_FILTER } from "../components/CivitDetailShared";

interface InstallModelCardProps {
  model: CivitiModel;
  installed: boolean;
  progress?: number;
  installing: boolean;
  onQuickInstall: (model: CivitiModel) => void;
  onOpenDetail: (model: CivitiModel) => void;
}

export default function InstallModelCard({
  model,
  installed,
  progress,
  installing,
  onQuickInstall,
  onOpenDetail,
}: InstallModelCardProps) {
  const { ref, inView } = useInView<HTMLDivElement>("400px");
  const [showNsfw, setShowNsfw] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const picked = useMemo(() => findImageFromModel(model, 450), [model]);
  const baseModel = model.modelVersions?.[0]?.baseModel;
  const blurred = picked.isNsfw && !showNsfw && !revealed;
  const downloading = progress != null || installing;

  useEffect(() => {
    const update = () => {
      userSettingsTable
        ?.getSetting("showNsfwModelThumbnail")
        .then((r) => setShowNsfw(r ?? false));
    };
    update();
    window.addEventListener("showNsfwModelThumbnail", update);
    return () => window.removeEventListener("showNsfwModelThumbnail", update);
  }, []);

  return (
    <Box
      ref={ref}
      role={"group"}
      position={"relative"}
      w={"100%"}
      sx={{ aspectRatio: "3 / 4" }}
      borderRadius={"lg"}
      overflow={"hidden"}
      bg={"galleryPanelBg"}
      cursor={"pointer"}
      onClick={() => onOpenDetail(model)}
    >
      {inView && picked.url ? (
        <Image
          src={civitThumbUrl(picked.url, 450)}
          loading={"lazy"}
          alt={model.name ?? "model"}
          w={"100%"}
          h={"100%"}
          objectFit={"cover"}
          filter={blurred ? NSFW_BLUR_FILTER : undefined}
        />
      ) : (
        <Box w={"100%"} h={"100%"} />
      )}

      {/* Top: Typ/Basismodell links, Stats rechts */}
      <Flex
        position={"absolute"}
        top={0}
        left={0}
        right={0}
        p={2}
        gap={1}
        justify={"space-between"}
        align={"flex-start"}
        bgGradient={"linear(to-b, blackAlpha.700, transparent)"}
      >
        <HStack gap={1} flexWrap={"wrap"}>
          {model.type && (
            <Badge
              colorScheme={"blackAlpha"}
              bg={"blackAlpha.600"}
              color={"whiteAlpha.900"}
              borderRadius={"full"}
              textTransform={"none"}
              fontSize={"10px"}
              px={2}
            >
              {model.type}
            </Badge>
          )}
          {baseModel && (
            <Badge
              bg={"blackAlpha.600"}
              color={"whiteAlpha.900"}
              borderRadius={"full"}
              textTransform={"none"}
              fontSize={"10px"}
              px={2}
            >
              {baseModel}
            </Badge>
          )}
        </HStack>
        <HStack gap={2} color={"whiteAlpha.900"} fontSize={"11px"} flexShrink={0}>
          <HStack gap={0.5}>
            <IconDownload size={12} />
            <Text>{formatCount(model.stats?.downloadCount)}</Text>
          </HStack>
          <HStack gap={0.5}>
            <IconHeart size={12} />
            <Text>{formatCount(model.stats?.favoriteCount)}</Text>
          </HStack>
        </HStack>
      </Flex>

      {/* NSFW-Reveal */}
      {blurred && (
        <Button
          position={"absolute"}
          top={"50%"}
          left={"50%"}
          transform={"translate(-50%, -50%)"}
          size={"sm"}
          bg={"rgba(237,100,166,0.16)"}
          color={"pink.100"}
          _hover={{ bg: "rgba(237,100,166,0.3)" }}
          onClick={(e) => {
            e.stopPropagation();
            setRevealed(true);
          }}
        >
          Anzeigen
        </Button>
      )}

      {/* Bottom: Name + Install/Installiert */}
      <Flex
        position={"absolute"}
        bottom={0}
        left={0}
        right={0}
        direction={"column"}
        gap={1}
        p={2}
        bgGradient={"linear(to-t, blackAlpha.800, transparent)"}
      >
        <Text color={"white"} fontWeight={600} fontSize={"sm"} noOfLines={1}>
          {model.name}
        </Text>
        {installed ? (
          <Badge
            alignSelf={"flex-start"}
            colorScheme={"green"}
            variant={"subtle"}
            borderRadius={"full"}
            display={"flex"}
            alignItems={"center"}
            gap={1}
            px={2}
          >
            <IconCheck size={12} /> Installiert
          </Badge>
        ) : (
          <Button
            alignSelf={"flex-start"}
            size={"xs"}
            colorScheme={"blue"}
            leftIcon={<IconDownload size={14} />}
            isDisabled={downloading}
            opacity={0}
            _groupHover={{ opacity: 1 }}
            transition={"opacity 0.12s"}
            onClick={(e) => {
              e.stopPropagation();
              onQuickInstall(model);
            }}
          >
            Installieren
          </Button>
        )}
      </Flex>

      {/* Download-Fortschritt auf der Karte */}
      {downloading && (
        <Flex
          position={"absolute"}
          inset={0}
          bg={"blackAlpha.700"}
          direction={"column"}
          align={"center"}
          justify={"center"}
          gap={2}
        >
          {progress != null ? (
            <>
              <CircularProgress
                value={progress}
                color={"blue.400"}
                size={"48px"}
              />
              <Text color={"white"} fontSize={"sm"}>
                {progress.toFixed(0)}%
              </Text>
            </>
          ) : (
            <Spinner color={"blue.400"} />
          )}
        </Flex>
      )}
    </Box>
  );
}
