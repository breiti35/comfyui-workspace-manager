import { useContext } from "react";
import GalleryGridTile from "./GalleryGridTile";
import { Flex, Grid, Text } from "@chakra-ui/react";
import { IconPhotoOff } from "@tabler/icons-react";
import type { Media } from "../../types/dbTypes";
import { GalleryContext } from "../GalleryContext";
import { useT } from "../../i18n/LanguageContext";

export default function GalleryGridView({ medias }: { medias: Media[] }) {
  const { t } = useT();
  const { openDetail, removeMedia } = useContext(GalleryContext);

  if (medias.length === 0) {
    return (
      <Flex
        direction={"column"}
        align={"center"}
        justify={"center"}
        h={"100%"}
        gap={3}
        color={"gray.500"}
      >
        <IconPhotoOff size={44} stroke={1.2} />
        <Text>{t("gallery.emptyState")}</Text>
      </Flex>
    );
  }

  return (
    <Grid
      templateColumns={"repeat(auto-fill, minmax(160px, 1fr))"}
      gap={4}
      pb={2}
    >
      {/* Each tile lazily mounts its real content once scrolled near view
          (see GalleryGridTile) - keeps a large gallery from requesting every
          media file / mounting every hover-action subtree up front, without
          changing the grid's layout or scroll height. Keyed by media.id so
          a freshly generated image landing at the top of this
          createTime-desc-sorted, freshly-set list doesn't disturb the
          visibility state of tiles already scrolled into view. */}
      {medias.map((media) => (
        <GalleryGridTile
          key={media.id}
          media={media}
          onClickMedia={openDetail}
          onDeleted={() => removeMedia(media.id)}
        />
      ))}
    </Grid>
  );
}
