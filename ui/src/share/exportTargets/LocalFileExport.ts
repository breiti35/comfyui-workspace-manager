import JSZip from "JSZip";
import { IconFileExport } from "@tabler/icons-react";
import type { Workflow } from "../../types/dbTypes";
import { app } from "../../utils/comfyapp";
import { COMFYSPACE_TRACKING_FIELD_NAME } from "../../const";
import { extractAndFetchFileNames } from "../../spacejson/handleDownloadSpaceJson";
import { downloadJsonFile } from "../../utils/downloadJsonFile";
import type { ExportTarget, ExportWorkflowOptions, ExportResult } from "./ExportTarget";

async function buildExportJson(
  options: ExportWorkflowOptions,
): Promise<string> {
  const graph = app.graph.serialize();
  if (options.includeDependencies !== false) {
    try {
      const deps = await extractAndFetchFileNames(graph.nodes ?? []);
      graph.extra ||= {};
      graph.extra[COMFYSPACE_TRACKING_FIELD_NAME] ||= {};
      graph.extra[COMFYSPACE_TRACKING_FIELD_NAME].deps = deps;
    } catch (e) {
      // Missing/unreachable dependency info shouldn't block the export itself.
      console.error("Failed to collect model/node dependencies for export", e);
    }
  }
  return JSON.stringify(graph, null, 2);
}

async function fetchPreviewImage(
  workflow: Workflow,
): Promise<{ blob: Blob; extension: string } | null> {
  const path = workflow.coverMediaPath ?? workflow.latestImage;
  if (!path) return null;
  try {
    const res = await fetch(`/workspace/view_media?filename=${encodeURIComponent(path)}`);
    if (!res.ok) return null;
    return { blob: await res.blob(), extension: path.split(".").pop() || "jpg" };
  } catch (e) {
    console.error("Failed to fetch preview image for export", e);
    return null;
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export const LocalFileExport: ExportTarget = {
  id: "local-file",
  label: "Save as file",
  description:
    "Download the workflow to your computer as a .json file (or a .zip with its preview image), ready to back up or upload anywhere yourself.",
  icon: IconFileExport,

  async exportWorkflow(workflow, options = {}): Promise<ExportResult> {
    try {
      const json = await buildExportJson(options);
      const wantsPreview = options.includePreviewImage !== false;
      const preview = wantsPreview ? await fetchPreviewImage(workflow) : null;

      if (!preview) {
        downloadJsonFile(json, workflow.name);
        return { success: true, message: `Saved ${workflow.name}.json` };
      }

      const zip = new JSZip();
      zip.file(`${workflow.name}.json`, json);
      zip.file(`${workflow.name}.preview.${preview.extension}`, preview.blob);
      const content = await zip.generateAsync({ type: "blob" });
      downloadBlob(content, `${workflow.name}.zip`);
      return { success: true, message: `Saved ${workflow.name}.zip` };
    } catch (e: any) {
      return { success: false, error: e?.message ?? String(e) };
    }
  },
};
