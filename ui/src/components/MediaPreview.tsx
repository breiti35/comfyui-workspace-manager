import { Box, Image } from "@chakra-ui/react";
import { isImageFormat, isVideoFormat, viewMediaUrl } from "../utils";
import { useRef, useState } from "react";
import { IconPlayerPlayFilled } from "@tabler/icons-react";

type Props = {
  mediaLocalPath: string;
  size: number;
  autoPlay?: boolean;
  onBrokenLink?: () => void;
  hideBrokenImage?: boolean;
  objectFit?: "cover" | "contain";
  // Fill the parent instead of a fixed square - used by the rich gallery tile.
  fill?: boolean;
};
export default function MediaPreview({
  mediaLocalPath,
  size,
  autoPlay,
  hideBrokenImage,
  objectFit,
  fill,
  onBrokenLink,
}: Props) {
  const [isVisible, setIsVisible] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  // A missing/renamed file surfaces through the media element's own onError.
  // onError also fires for network blips and server errors, and onBrokenLink
  // removes the DB entry - so only a confirmed 404 counts as "gone".
  const handleBrokenLink = async () => {
    try {
      const res = await fetch(viewMediaUrl(mediaLocalPath), { method: "HEAD" });
      if (res.status !== 404) return;
    } catch {
      return;
    }
    setIsVisible(false);
    onBrokenLink?.();
  };

  // Grid tiles (no autoPlay) are still frames until hovered: play muted on
  // enter, pause and rewind on leave so the tile always resets to its poster
  // frame. The detail view (autoPlay) skips this - it already plays on its own.
  const handleMouseEnter = () => {
    videoRef.current?.play().catch(() => {
      // Some embedding contexts still reject programmatic play(); the tile
      // just stays on its current frame, which is a harmless fallback.
    });
  };
  const handleMouseLeave = () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
  };

  if (!isVisible) return null;

  if (isImageFormat(mediaLocalPath)) {
    return (
      <Image
        borderRadius={fill ? 0 : 3}
        {...(fill ? { w: "100%", h: "100%" } : { boxSize: `${size}px` })}
        objectFit={objectFit ?? "cover"}
        loading={"lazy"}
        src={viewMediaUrl(mediaLocalPath)}
        onError={hideBrokenImage ? handleBrokenLink : undefined}
        alt="workflow image renamed or moved from output folder"
      />
    );
  }

  if (isVideoFormat(mediaLocalPath)) {
    return (
      <Box
        position={"relative"}
        borderRadius={fill ? 0 : 3}
        overflow={"hidden"}
        {...(fill ? { w: "100%", h: "100%" } : { boxSize: `${size}px` })}
      >
        <video
          ref={videoRef}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            objectFit: objectFit ?? "cover",
          }}
          src={viewMediaUrl(mediaLocalPath)}
          aria-label="workflow video renamed or moved from output folder"
          preload={"metadata"}
          muted
          playsInline
          loop
          controls={autoPlay}
          autoPlay={autoPlay}
          onMouseEnter={autoPlay ? undefined : handleMouseEnter}
          onMouseLeave={autoPlay ? undefined : handleMouseLeave}
          onError={hideBrokenImage ? handleBrokenLink : undefined}
        >
          <track kind="captions" />
        </video>
        {/* Subtle corner badge so a still tile reads as "video" rather than a
            broken/blank image. Only on tiles, the detail view already has
            native controls. pointerEvents none so hover play/pause on the
            video underneath keeps working under the badge area too. */}
        {!autoPlay && (
          <Box
            aria-hidden
            pointerEvents={"none"}
            position={"absolute"}
            bottom={1}
            right={1}
            display={"flex"}
            alignItems={"center"}
            justifyContent={"center"}
            boxSize={"18px"}
            borderRadius={"full"}
            bg={"blackAlpha.600"}
            color={"whiteAlpha.900"}
          >
            <IconPlayerPlayFilled size={10} />
          </Box>
        )}
      </Box>
    );
  }

  return null;
}
