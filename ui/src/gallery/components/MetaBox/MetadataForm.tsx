import { getMetadataFromUrl } from "../../utils.ts";
import { Media } from "../../../types/dbTypes.ts";
import { useEffect, useState } from "react";
import {
  calcInputListRecursive,
  ImagePrompt,
  PromptNodeInputItem,
} from "./utils.ts";
import { app } from "../../../utils/comfyapp.ts";
import GalleryParams from "../GalleryParams.tsx";

// Loads an image's generation parameters (from its embedded metadata, or the
// live graph when no image is selected) and renders them read-only.
export default function MetadataForm({ media }: { media: Media | null }) {
  const [calcInputList, setCalcInputList] = useState<PromptNodeInputItem[]>([]);
  const [imagePrompt, setImagePrompt] = useState<ImagePrompt>();

  useEffect(() => {
    if (media) {
      getMetadataFromUrl(
        `/workspace/view_media?filename=${media.localPath}`,
      ).then((data) => {
        setImagePrompt(data.prompt);
      });
    } else {
      app
        .graphToPrompt(app.graph)
        .then((data: { output: any; workflow: any }) => {
          setImagePrompt(data.output);
        });
    }
  }, [media]);

  useEffect(() => {
    if (!imagePrompt) {
      setCalcInputList([]);
      return;
    }
    setCalcInputList(calcInputListRecursive(imagePrompt));
  }, [imagePrompt]);

  return <GalleryParams inputList={calcInputList} media={media} />;
}
