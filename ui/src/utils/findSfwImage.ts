import type { SearchHit } from "../model-manager/civitSearchTypes";
import { isCivitModel } from "../model-manager/install-models/util/modelTypes";
import type { CivitiModel } from "../model-manager/types";

interface ImageLike {
  url?: string;
  nsfw?: "None" | "Soft" | "Mature" | "X";
  nsfwLevel?: number;
  type?: string;
}

function isSfw(image: ImageLike): boolean {
  return image.nsfw === "None" || image.nsfwLevel === 1;
}

// Civitai example media can be a video (type "video" / .mp4/.webm URL). Those
// don't render in an <img>, so a video first-image leaves the card blank -
// prefer a real image for the cover.
function isVideo(image: ImageLike): boolean {
  return image.type === "video" || /\.(mp4|webm)$/i.test(image.url ?? "");
}

export interface PickedImage {
  url?: string;
  isNsfw: boolean;
}

/**
 * Picks the best image to show for a list of Civitai images - prefers an
 * explicitly SFW-tagged one, otherwise falls back to the first image and
 * flags it as NSFW. Whether to show it clearly or blurred is a
 * display-time decision (see ModelCard.tsx), not baked in here.
 */
export function findSfwImage<T extends ImageLike>(
  images?: T[],
): PickedImage {
  if (!images || images.length === 0) {
    return { isNsfw: false };
  }
  // Prefer real images over videos for the cover; only fall back to videos if
  // there is nothing else.
  const notVideo = images.filter((im) => !isVideo(im));
  const pool = notVideo.length ? notVideo : images;
  const sfw = pool.find(isSfw);
  const chosen = sfw ?? pool[0];
  return { url: chosen?.url, isNsfw: !isSfw(chosen) };
}

export function findImageFromModel(
  model: CivitiModel | SearchHit,
  IMAGE_SIZE = 280,
): PickedImage {
  if (!model) {
    return { isNsfw: false };
  }
  if (model.images) {
    const picked = findSfwImage(model.images);
    if (!picked.url) return { isNsfw: false };
    return {
      url: `https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/${picked.url}/width=${IMAGE_SIZE}/`,
      isNsfw: picked.isNsfw,
    };
  } else if (isCivitModel(model)) {
    return findSfwImage(model.modelVersions?.at(0)?.images);
  }
  return { isNsfw: false };
}
