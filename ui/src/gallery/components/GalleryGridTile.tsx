import { Box } from "@chakra-ui/react";
import type { Media } from "../../types/dbTypes";
import { useInView } from "../../customHooks/useInView";
import GalleryMediaItem from "./GalleryMediaItem";

interface GalleryGridTileProps {
  media: Media;
  onClickMedia: (media: Media) => void;
  onDeleted: () => void;
}

// One grid cell of the gallery. The outer Box always reserves the tile's
// square footprint via the same aspect-ratio the real tile uses, so the
// grid's overall shape/scroll height never depends on what's loaded -
// swapping the placeholder for the real content never shifts layout or
// scroll position. Only once the tile has scrolled near the (possibly
// nested/scrollable) viewport do we mount the real, heavier
// GalleryMediaItem (image request + hover actions); until then we render a
// cheap, static placeholder box. That's what keeps a several-hundred/
// thousand-image gallery from requesting every media file and mounting every
// hover-action subtree at once.
//
// Same dependency-free IntersectionObserver pattern the model manager uses for
// its per-card lazy loading (ModelItem.tsx), via the shared useInView hook.
export default function GalleryGridTile({
  media,
  onClickMedia,
  onDeleted,
}: GalleryGridTileProps) {
  const { ref, inView } = useInView<HTMLDivElement>("800px");

  return (
    <Box ref={ref} w={"100%"} sx={{ aspectRatio: "1 / 1" }}>
      {inView ? (
        <GalleryMediaItem
          media={media}
          onClickMedia={onClickMedia}
          onDeleted={onDeleted}
        />
      ) : (
        <Box w={"100%"} h={"100%"} borderRadius={"lg"} bg={"galleryPanelBg"} />
      )}
    </Box>
  );
}
