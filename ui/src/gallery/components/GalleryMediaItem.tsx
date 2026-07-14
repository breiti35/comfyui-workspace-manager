import { useContext } from "react";
import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Link,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { IconDownload, IconTrash } from "@tabler/icons-react";
import { Media } from "../../types/dbTypes";
import { mediaTable } from "../../db-tables/WorkspaceDB";
import { WorkspaceContext } from "../../WorkspaceContext";
import { useDialog } from "../../components/AlertDialogProvider";
import MediaPreview from "../../components/MediaPreview";

interface GalleryMediaItemProps {
  media: Media;
  onClickMedia: (media: Media) => void;
  onDeleted?: () => void;
}

// Rich gallery tile: image fills a rounded, house-style cell; the actions
// (Laden / Herunterladen / Entfernen) reveal on hover instead of a permanent
// button row. Click opens the detail view.
export default function GalleryMediaItem({
  media,
  onClickMedia,
  onDeleted,
}: GalleryMediaItemProps) {
  const { curFlowID, loadFilePath } = useContext(WorkspaceContext);
  const { showDialog } = useDialog();
  if (media.localPath == null || curFlowID == null) {
    return null;
  }

  const localPath = media.localPath;

  const onLoad = () =>
    showDialog("Wie möchtest du diesen Workflow laden?", [
      {
        label: "In neuem Workflow laden",
        onClick: () => loadFilePath(localPath),
        colorScheme: "teal",
      },
      {
        label: "Aktuellen Workflow überschreiben",
        onClick: () => loadFilePath(localPath, true),
        colorScheme: "red",
      },
    ]);

  const onDelete = () =>
    showDialog(
      "Dieses Bild aus der Galerie entfernen? (Die Datei auf der Festplatte bleibt erhalten.)",
      [
        {
          label: "Entfernen",
          colorScheme: "red",
          onClick: async () => {
            await mediaTable?.delete(media.id);
            onDeleted?.();
          },
        },
      ],
    );

  return (
    <Box
      role={"group"}
      position={"relative"}
      w={"100%"}
      sx={{ aspectRatio: "1 / 1" }}
      borderRadius={"lg"}
      overflow={"hidden"}
      bg={"galleryPanelBg"}
      cursor={"pointer"}
      onClick={() => onClickMedia(media)}
    >
      <MediaPreview
        mediaLocalPath={localPath}
        size={0}
        fill
        objectFit={"cover"}
        hideBrokenImage
        onBrokenLink={() => {
          mediaTable?.delete(media.id);
          onDeleted?.();
        }}
      />

      {/* Aktionen oben rechts, erscheinen beim Hover */}
      <HStack
        position={"absolute"}
        top={2}
        right={2}
        gap={1}
        opacity={0}
        _groupHover={{ opacity: 1 }}
        transition={"opacity 0.12s"}
        onClick={(e) => e.stopPropagation()}
      >
        <Tooltip label={"Herunterladen"}>
          <Link
            href={`/workspace/view_media?filename=${localPath}`}
            download={localPath}
          >
            <IconButton
              aria-label={"Bild herunterladen"}
              size={"sm"}
              icon={<IconDownload size={16} />}
              bg={"blackAlpha.600"}
              color={"whiteAlpha.900"}
              _hover={{ bg: "blackAlpha.800", color: "white" }}
            />
          </Link>
        </Tooltip>
        <Tooltip label={"Aus Galerie entfernen"}>
          <IconButton
            aria-label={"Bild aus Galerie entfernen"}
            size={"sm"}
            icon={<IconTrash size={16} />}
            bg={"rgba(245, 101, 101, 0.5)"}
            color={"white"}
            _hover={{ bg: "rgba(245, 101, 101, 0.85)" }}
            onClick={onDelete}
          />
        </Tooltip>
      </HStack>

      {/* Dateiname + „Laden" unten, auf Hover */}
      <Flex
        position={"absolute"}
        bottom={0}
        left={0}
        right={0}
        direction={"column"}
        gap={1}
        p={2}
        bgGradient={"linear(to-t, blackAlpha.800, transparent)"}
        opacity={0}
        _groupHover={{ opacity: 1 }}
        transition={"opacity 0.12s"}
      >
        <Tooltip label={localPath}>
          <Text color={"white"} fontSize={"xs"} noOfLines={1}>
            {localPath}
          </Text>
        </Tooltip>
        <Button
          alignSelf={"flex-start"}
          size={"xs"}
          colorScheme={"blue"}
          onClick={(e) => {
            e.stopPropagation();
            onLoad();
          }}
        >
          Laden
        </Button>
      </Flex>
    </Box>
  );
}
