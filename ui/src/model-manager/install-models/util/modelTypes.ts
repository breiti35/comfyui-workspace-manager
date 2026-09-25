// `import type`: both are used purely as types below (never as runtime
// values). Matters for more than style here - Node's native type-stripping
// (used by the test runner, see tests/frontend/ts-resolver.mjs) erases
// annotations per-statement without cross-module analysis, so a plain
// `import` of a type-only export throws at module load instead of just
// getting elided like a bundler would.
import type { SearchHit, SearchModelVersion } from "../../civitSearchTypes";
import type { CivitiModel, CivitiModelVersion } from "../../types";

export const ALL_MODEL_TYPES = [
  "Checkpoint",
  "TextualInversion",
  "Hypernetwork",
  "LORA",
  // LyCORIS variants. Civitai lists them as separate types, but ComfyUI loads
  // them from the same "loras" folder with the regular LoRA loader.
  "LoCon",
  "DoRA",
  "Controlnet",
  "Upscaler",
  "VAE",
  // "Poses",
  // "MotionModule",
  // "AestheticGradient",
  // "Wildcards",
] as const; // `as const` makes the array readonly and its elements literal types

export const CACHE_EXPIRY_DAYS = 2;

// Infer MODEL_TYPE from the ALL_MODEL_TYPES array
export type MODEL_TYPE = (typeof ALL_MODEL_TYPES)[number];
export const MODEL_TYPE_TO_FOLDER_MAPPING: Record<MODEL_TYPE, string> = {
  Checkpoint: "checkpoints",
  TextualInversion: "embeddings",
  Hypernetwork: "hypernetworks",
  LORA: "loras",
  LoCon: "loras",
  DoRA: "loras",
  Controlnet: "controlnet",
  Upscaler: "upscale_models",
  VAE: "vae",
};

/**
 * Civitai types that share their folder with a more common "primary" type
 * (LoCon/DoRA live in "loras" next to LORA). The reverse lookup below never
 * returns them - "loras" must keep mapping to LORA, the tab users expect.
 */
export const SECONDARY_MODEL_TYPES: ReadonlySet<MODEL_TYPE> = new Set<MODEL_TYPE>([
  "LoCon",
  "DoRA",
]);

// Reverse lookup, derived from MODEL_TYPE_TO_FOLDER_MAPPING instead of a
// second hand-maintained table that could drift out of sync with it. Several
// types can share one folder; only the primary type is used for the reverse
// direction.
const FOLDER_TO_MODEL_TYPE: Record<string, MODEL_TYPE> = Object.fromEntries(
  Object.entries(MODEL_TYPE_TO_FOLDER_MAPPING)
    .filter(([modelType]) => !SECONDARY_MODEL_TYPES.has(modelType as MODEL_TYPE))
    .map(([modelType, folder]) => [folder.toLowerCase(), modelType as MODEL_TYPE]),
);

/**
 * Civitai type for a ComfyUI folder name (e.g. "loras" -> "LORA"), or
 * undefined when the folder has no Civitai equivalent (clip, clip_vision,
 * unet, diffusion_models - folders that exist only from the backend's
 * directory scan). Case-insensitive and trims surrounding whitespace since
 * the folder name comes from that scan, not from a typed value.
 */
export function folderToModelType(folder: string): MODEL_TYPE | undefined {
  return FOLDER_TO_MODEL_TYPE[folder.trim().toLowerCase()];
}

export type FileEssential = {
  id: number;
  name?: string;
  SHA256?: string;
  sizeKB?: number;
};

export type apiResponse = CivitiModel | SearchHit;

export function isCivitModel(
  model: CivitiModel | SearchHit,
): model is CivitiModel {
  return (model as CivitiModel).modelVersions !== undefined;
}

export function isCivitVersion(
  version: CivitiModelVersion | SearchModelVersion,
): version is CivitiModelVersion {
  return (version as CivitiModelVersion).files?.[0] !== undefined;
}

/** The file Civitai serves for a version download: primary, else the first. */
export function pickPrimaryFile<T extends { primary?: boolean }>(
  files?: T[],
): T | undefined {
  if (!files?.length) return undefined;
  return files.find((f) => f.primary) ?? files[0];
}

export function getFileEssential(
  version: CivitiModelVersion | SearchModelVersion,
  modelName?: string,
): FileEssential;
export function getFileEssential(
  version?: CivitiModelVersion | SearchModelVersion,
  modelName?: string,
): FileEssential | undefined;

export function getFileEssential(
  version?: CivitiModelVersion | SearchModelVersion,
  modelName?: string,
): FileEssential | undefined {
  if (!version) return;
  let fileData: FileEssential;
  if (isCivitVersion(version)) {
    // The download endpoint (/api/download/models/<versionId>) serves the
    // version's PRIMARY file. files[0] is often a training-data zip or a
    // pickle variant instead, so name/hash/size must come from the primary
    // file or the "installed"/progress matching looks for the wrong name.
    const file = pickPrimaryFile(version.files);
    fileData = {
      id: version.id,
      SHA256: file?.hashes?.SHA256,
      name: file?.name,
      sizeKB: file?.sizeKB,
    };
  } else {
    fileData = {
      id: version.id,
      SHA256: version.hashes?.[2],
      name: `${modelName} ${version.name}`,
    };
  }

  return fileData;
}
