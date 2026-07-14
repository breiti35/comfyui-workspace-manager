import { useContext } from "react";
import GalleryMediaItem from "./GalleryMediaItem";
import { Flex, Grid, Text } from "@chakra-ui/react";
import { IconPhotoOff } from "@tabler/icons-react";
import type { Media } from "../../types/dbTypes";
import { GalleryContext } from "../GalleryContext";

export default function GalleryGridView({ medias }: { medias: Media[] }) {
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
        <Text>Keine Bilder gefunden</Text>
      </Flex>
    );
  }

  return (
    <Grid
      templateColumns={"repeat(auto-fill, minmax(160px, 1fr))"}
      gap={4}
      pb={2}
    >
      {medias.map((media) => (
        <GalleryMediaItem
          key={media.id}
          media={media}
          onClickMedia={openDetail}
          onDeleted={() => removeMedia(media.id)}
        />
      ))}
    </Grid>
  );
}
