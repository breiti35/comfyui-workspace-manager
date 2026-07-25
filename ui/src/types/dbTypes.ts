import type { MODEL_TYPE } from "../model-manager/install-models/util/modelTypes";
import { TopFieldType } from "../gallery/components/MetaBox/MetadataForm.tsx";

export interface SortableItem {
  name: string;
  updateTime: number;
  lastOpenedTime?: number;
}

export interface Workflow extends SortableItem {
  id: string;
  json: string;
  name: string;
  coverMediaPath?: string | null;
  saveLock?: boolean;
  cloudID?: string | null;
  createTime: number;

  // will be deprecated
  privacy?: WorkflowPrivacy;
  tags?: string[];
  parentFolderID?: string | null; //TODO remove undefined, use null only
  cloudOrigin?: string;
  latestImage?: string;
  topFieldsConfig?: TopFieldType[];
}

export interface TableBaseModel {
  id?: string;
  name?: string;
  createTime?: number;
}

export type Tags = {
  [name: string]: Tag;
};
export type Tag = {
  name: string;
  workflowIDs: string[];
  updateTime: number;
};
export type CacheKey = string;
export type LocalCache = {
  id: CacheKey;
  value: string;
};

export type Model = {
  id: string;
  fileName: string;
  fileFolder: string;
  fileHash: string | null; // files are not guaranteed to finish hashing
  modelName: string | null;
  // Matched Civitai version name + base model (e.g. "v6" / "SDXL 1.0"), used
  // for the card's version chip. Populated from the hash lookup.
  versionName?: string;
  baseModel?: string;
  civitModelID?: string;
  downloadUrl?: string;
  civitModelVersionID?: string;
  imageUrl?: string | null;
  // Whether imageUrl should be blurred unless the user opted into "Show
  // NSFW" (see ModelItem.tsx). Only true when Civitai flags the model itself
  // as adult (model.nsfw === true) on a blur-eligible category
  // (checkpoints/loras, see isNsfwBlurEligibleCategory in civitUtils.ts) -
  // a failed/unknown lookup or a non-image-generating category (vae,
  // upscale_models, etc.) is never blurred.
  imageIsNsfw?: boolean;
};

export interface ModelManagerPosition {
  top: number;
  right: number;
}
export type WorkflowVersion = {
  id: string;
  name: string;
  workflowID: string;
  json: string;
  createTime?: number;
  createdAt?: string;
  created_at?: string;
  authorID?: string;
  nodeDefs?: string; //for cloud workflow version
};

export enum EShortcutKeys {
  SAVE = "save",
  SAVE_AS = "saveAs",
  openSpotlightSearch = "openSpotlightSearch",
}

export enum EOtherKeys {
  ArrowUp = "ArrowUp",
  ArrowDown = "ArrowDown",
  Enter = "Enter",
}

export type UserSettings = {
  id: string;
  myWorkflowsDir: string;
  topBarStyle: PanelPosition;
  shortcuts: Record<EShortcutKeys, string>;
  autoSave?: boolean;
  autoSaveDuration?: number; //every X seconds to save
  twoWaySync?: boolean;
  foldersOnTop?: boolean;
  showNsfwModelThumbnail?: boolean;
  /**
   * When true, model search/hash-lookup/page-links use civitai.red (which
   * shows SFW + adult content) instead of civitai.com (SFW-only since
   * Civitai's April 2026 domain split). Defaults to SFW-only.
   */
  civitaiIncludeAdultContent?: boolean;
  // Civitai API key (login token) for downloading gated models. Stored here
  // (server-side, db/settings.json) rather than browser localStorage so it
  // survives ComfyUI restarts and moves with the install.
  civitaiApiKey?: string;
  defaultFolders: Record<MODEL_TYPE, string>;
  maximumChangelogNumber: number;
  hideCoverImage: boolean;
  disableUnsavedWarning: boolean;
  // UI language. Defaults to English when unset.
  language?: "de" | "en";
};

export interface PanelPosition {
  top: number;
  left: number;
}

export interface Folder extends SortableItem {
  id: string;
  name: string;
  parentFolderID: string | null; // if null, it is in the root folder
  createTime: number;
  type: "folder";
  isCollapse?: boolean;
}

export type Changelog = {
  id: string;
  workflowID: string;
  createTime: number;
  json: string;
  isAutoSave?: boolean;
};

export type Media = {
  id: string;
  workflowID: string;
  workflowJSON?: string;
  createTime: number;
  localPath: string;
};

/**
 * When deleting a folder, how files in the folder and files in nested folders are handled
 */
export enum EFlowOperationType {
  /**
   * Move to root directory
   */
  MOVE_TO_ROOT_FOLDER = "moveToRootFolder",
  /**
   * Delete
   */
  DELETE = "delete",
}

export type WorkflowPrivacy = "PUBLIC" | "PRIVATE" | "UNLISTED";

export enum EWorkflowPrivacy {
  PRIVATE = "PRIVATE",
  PUBLIC = "PUBLIC",
  UNLISTED = "UNLISTED",
}

export const WORKSPACE_INDEXDB_NAME = "comfyui_workspace_db";

export type RecentlyOpenedFile = {
  id: string;
  name: string;
  type: "workflow" | "model";
  updateTime: number;
};
