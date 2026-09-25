import { MetaData } from "../utils.ts";
import { Media } from "../../types/dbTypes.ts";
import {
  Button,
  Flex,
  IconButton,
  Link,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import {
  IconDownload,
  IconPin,
  IconPinFilled,
  IconTrash,
} from "@tabler/icons-react";
import { formatTimestamp } from "../../utils.ts";
import { mediaTable, workflowsTable } from "../../db-tables/WorkspaceDB.ts";
import { useContext, useEffect, useState } from "react";
import { GalleryContext } from "../GalleryContext.ts";
import { WorkspaceContext } from "../../WorkspaceContext.ts";
import { useDialog } from "../../components/AlertDialogProvider.tsx";
import { useT } from "../../i18n/LanguageContext";

export type MediaWithMetaData = Media & {
  metaData?: MetaData;
};
export const GalleryRightColHeaderButtons = ({
  media,
}: {
  media?: MediaWithMetaData;
}) => {
  const { t } = useT();
  const [isCover, setIsCover] = useState(false);
  const { removeMedia } = useContext(GalleryContext);
  const { loadFilePath } = useContext(WorkspaceContext);
  const { showDialog } = useDialog();

  useEffect(() => {
    setIsCover(
      media?.localPath != null &&
        workflowsTable?.curWorkflow?.coverMediaPath === media?.localPath,
    );
  }, [media]);
  if (!media) return null;
  return (
    <Flex flexWrap={"wrap"} gap={3}>
      <Flex alignItems={"center"} gap={2}>
        {media.localPath && (
          <>
            <Text noOfLines={1}>{media?.localPath}</Text>
            <Tooltip label={t("gallery.download")}>
              <Link
                href={`/workspace/view_media?filename=${media?.localPath}`}
                download={media?.localPath}
              >
                <IconButton
                  size={"sm"}
                  icon={<IconDownload size={19} />}
                  aria-label="Bild herunterladen"
                />
              </Link>
            </Tooltip>
          </>
        )}
      </Flex>
      <Flex gap={1} alignItems={"center"} color={"GrayText"}>
        {!!media?.createTime && (
          <Text>{formatTimestamp(media?.createTime ?? 0, true)}</Text>
        )}
      </Flex>

      <Tooltip label={t("gallery.removeFromGallery")}>
        <IconButton
          size={"sm"}
          variant={"ghost"}
          icon={<IconTrash size={19} />}
          aria-label="Bild aus Galerie entfernen"
          colorScheme="red"
          onClick={() =>
            showDialog(t("gallery.removeMediaDialog.text"), [
              {
                label: t("gallery.removeMediaDialog.confirm"),
                colorScheme: "red",
                onClick: async () => {
                  await mediaTable?.delete(media.id);
                  removeMedia(media.id);
                },
              },
            ])
          }
        />
      </Tooltip>
      {workflowsTable?.curWorkflow?.id && (
        <Tooltip label={t("gallery.setCover")}>
          <IconButton
            size={"sm"}
            variant={"ghost"}
            icon={isCover ? <IconPinFilled size={19} /> : <IconPin size={19} />}
            aria-label="set as cover"
            onClick={async () => {
              await workflowsTable?.updateMetaInfo(
                workflowsTable!.curWorkflow!.id,
                {
                  coverMediaPath: isCover ? undefined : media.localPath,
                },
              );
              setIsCover(!isCover);
            }}
          />
        </Tooltip>
      )}
      <Button
        onClick={() =>
          showDialog(t("gallery.loadWorkflowDialog.title"), [
            {
              label: t("gallery.loadWorkflowDialog.newWorkflow"),
              onClick: () => {
                loadFilePath(media.localPath);
              },
              colorScheme: "blue",
            },
            {
              label: t("gallery.loadWorkflowDialog.overwrite"),
              onClick: () => loadFilePath(media.localPath, true),
              colorScheme: "red",
            },
          ])
        }
        size={"sm"}
      >
        {t("gallery.load")}
      </Button>
    </Flex>
  );
};
