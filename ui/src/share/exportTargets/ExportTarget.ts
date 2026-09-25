import type { ComponentType } from "react";
import type { Workflow } from "../../types/dbTypes";

/**
 * Options a caller can pass to influence what an ExportTarget includes.
 * Individual targets are free to ignore options they don't support.
 */
export type ExportWorkflowOptions = {
  /** Include a preview/cover image alongside the workflow, if one exists. */
  includePreviewImage?: boolean;
  /** Include resolved model/node dependency metadata (see handleDownloadSpaceJson). */
  includeDependencies?: boolean;
};

export type ExportResult =
  | { success: true; message?: string }
  | { success: false; error: string };

/**
 * A destination a workflow can be exported/shared to. LocalFileExport is the
 * only implementation today; a future GoogleDriveExport (or any other
 * destination) just needs to implement this same interface and be added to
 * the EXPORT_TARGETS list in ./index.ts - nothing else in the UI needs to
 * know about it.
 */
export interface ExportTarget {
  /** Stable, unique identifier (used as React key and for logging). */
  id: string;
  /** Short label shown in the UI, e.g. "Save as file". */
  label: string;
  /** One-line explanation shown under the label. */
  description: string;
  icon: ComponentType<{ size?: number }>;
  exportWorkflow(
    workflow: Workflow,
    options?: ExportWorkflowOptions,
  ): Promise<ExportResult>;
}
