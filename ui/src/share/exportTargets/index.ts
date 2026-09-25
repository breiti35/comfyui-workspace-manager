import type { ExportTarget } from "./ExportTarget";
import { LocalFileExport } from "./LocalFileExport";

/**
 * All export targets offered in the "Share" dialog, in display order.
 * Adding a new destination (e.g. Google Drive) means implementing
 * ExportTarget and pushing it in here - ShareDialog.tsx renders this
 * list generically and needs no changes.
 */
export const EXPORT_TARGETS: ExportTarget[] = [LocalFileExport];

export * from "./ExportTarget";
