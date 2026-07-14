import { Image } from "@chakra-ui/react";
import { isImageFormat } from "../utils";
import { useEffect, useState } from "react";

type Props = {
  mediaLocalPath: string;
  size: number;
  autoPlay?: boolean;
  onBrokenLink?: () => void;
  hideBrokenImage?: boolean;
  isPreview?: boolean;
  objectFit?: "cover" | "contain";
  // Fill the parent instead of a fixed square - used by the rich gallery tile.
  fill?: boolean;
};
export default function MediaPreview({
  mediaLocalPath,
  size,
  isPreview,
  autoPlay,
  hideBrokenImage,
  objectFit,
  fill,
  onBrokenLink,
}: Props) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const checkMediaExists = async () => {
      try {
        const response = await fetch(
          isPreview
            ? `/workspace/preview_media?filename=${mediaLocalPath}`
            : `/workspace/view_media?filename=${mediaLocalPath}`,
        );
        if (response.status == 404) {
          setIsVisible(false);
          onBrokenLink?.();
          return;
        }
      } catch (error) {
        console.error("Error checking media exists", error);
      }
    };

    hideBrokenImage && checkMediaExists();
  }, []);

  if (!isVisible) return null;
  return isImageFormat(mediaLocalPath) ? (
    <Image
      borderRadius={fill ? 0 : 3}
      {...(fill ? { w: "100%", h: "100%" } : { boxSize: `${size}px` })}
      objectFit={objectFit ?? "cover"}
      loading={"lazy"}
      src={`/workspace/view_media?filename=${mediaLocalPath}`}
      onError={hideBrokenImage ? () => onBrokenLink?.() : undefined}
      alt="workflow image renamed or moved from output folder"
    />
  ) : null;
}
