import { ESortTypes } from "./RecentFilesDrawer/types";
import { userSettingsTable } from "./db-tables/WorkspaceDB";
import { EShortcutKeys } from "./types/dbTypes";
import type { Workflow, SortableItem } from "./types/dbTypes";
import { app } from "./utils/comfyapp";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare let LiteGraph: any, LGraph: any, LGraphCanvas: any;

// copied from app.js
function sanitizeNodeName(string: string): string {
  const entityMap: Record<string, string> = {
    "&": "",
    "<": "",
    ">": "",
    '"': "",
    "'": "",
    "`": "",
    "=": "",
  };
  return String(string).replace(/[&<>"'`=]/g, function fromEntityMap(s) {
    return entityMap[s];
  });
}
export function findMissingNodes(): string[] {
  const missingNodeTypes = [];
  for (const n of app.graph._nodes) {
    // Patch T2IAdapterLoader to ControlNetLoader since they are the same node now
    if (n.type == "T2IAdapterLoader") n.type = "ControlNetLoader";
    if (n.type == "ConditioningAverage ") n.type = "ConditioningAverage"; //typo fix
    if (n.type == "SDV_img2vid_Conditioning")
      n.type = "SVD_img2vid_Conditioning"; //typo fix
    // Find missing node types
    if (!(n.type in LiteGraph.registered_node_types)) {
      n.type = sanitizeNodeName(n.type);
      missingNodeTypes.push(n.type);
    }
  }
  return missingNodeTypes;
}

export function formatTimestamp(
  unixTimestamp: number,
  showHourMinue: boolean = true,
  showSec: boolean = false,
  splitChar: string = "-",
) {
  // Create a new Date object from the UNIX timestamp
  const date = new Date(unixTimestamp);

  // Get the day, month, year, hours, and minutes from the Date object
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0"); // Month is 0-indexed
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  // Format the date and time string
  const res = `${month}${splitChar}${day}${splitChar}${year}`;
  if (showHourMinue) {
    return res + ` ${hours}:${minutes}`;
  }
  if (showSec) {
    return res + `:${seconds}`;
  }
  return res;
}

/**
 * Sort workspace list data
 * @param flows Data that needs to be sorted
 * @param sortType The type of sorting
 * @returns sorted data
 */
export function sortFlows(
  flows: Workflow[] = [],
  sortType: ESortTypes = ESortTypes.RECENTLY_MODIFIED,
) {
  const copyFlows = [...flows];
  if (copyFlows.length) {
    switch (sortType) {
      case ESortTypes.AZ:
        copyFlows.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case ESortTypes.ZA:
        copyFlows.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case ESortTypes.RECENTLY_MODIFIED:
        copyFlows.sort((a, b) => b.updateTime - a.updateTime);
        break;
      case ESortTypes.OLDEST_MODIFIED:
        copyFlows.sort((a, b) => a.updateTime - b.updateTime);
        break;
    }
  }

  return copyFlows;
}

export const sortFileItem = <T extends SortableItem>(
  items: T[],
  sortType: ESortTypes = ESortTypes.RECENTLY_MODIFIED,
): T[] => {
  const copyFlows = [...items];
  switch (sortType) {
    case ESortTypes.AZ:
      copyFlows.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case ESortTypes.ZA:
      copyFlows.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case ESortTypes.RECENTLY_MODIFIED:
      copyFlows.sort((a, b) => b.updateTime - a.updateTime);
      break;
    case ESortTypes.OLDEST_MODIFIED:
      copyFlows.sort((a, b) => a.updateTime - b.updateTime);
      break;
    case ESortTypes.RECENTLY_OPENED:
      copyFlows.sort(
        (a, b) => (b.lastOpenedTime ?? 0) - (a.lastOpenedTime ?? 0),
      );
      break;
  }
  return copyFlows;
};

export function json2ClipboardString(graphData: any) {
  const nodes = graphData.nodes;
  const links = new Array();
  const relative_id_map = new Map();
  const exist_link_ids = new Array();
  for (let i = 0; i < graphData.nodes.length; ++i) {
    const node = graphData.nodes[i];
    if (node.inputs) {
      for (const input of node.inputs) {
        if (input.link) {
          exist_link_ids.push(input.link);
          input.link = null;
        }
      }
    }
    if (node.outputs) {
      for (const output of node.outputs) {
        if (output.links) {
          exist_link_ids.concat(output.links);
          output.links = [];
        }
      }
    }
    relative_id_map.set(node.id, i);
  }
  for (const link of graphData.links) {
    if (!exist_link_ids.includes(link[0])) {
      continue;
    }
    links.push([
      relative_id_map.get(link[1]),
      link[2],
      relative_id_map.get(link[3]),
      link[4],
      link[1],
    ]);
  }
  return JSON.stringify({ nodes, links });
}

export function insertWorkflowToCanvas(json: string, insertPos?: number[]) {
  let graphData = JSON.parse(json);
  if (!graphData || !graphData.nodes || graphData.nodes.length == 0) return;

  const prevClipboard = localStorage.getItem("litegrapheditor_clipboard");

  localStorage.setItem(
    "litegrapheditor_clipboard",
    json2ClipboardString(graphData),
  );

  const priorPos = app.canvas.graph_mouse;
  if (insertPos) {
    insertPos[0] -= 15;
    insertPos[1] -= 15;
    app.canvas.graph_mouse = insertPos;
  }
  app.canvas.pasteFromClipboard();
  app.canvas.graph_mouse = priorPos;
  if (prevClipboard) {
    localStorage.setItem("litegrapheditor_clipboard", prevClipboard);
  }
}

export const matchShortcut = (event: KeyboardEvent) => {
  /**
   * Where matchShortcut is used, the browser's default behavior needs to be prevented.
   * So here you cannot get the shortcut keys by await userSettingsTable?.getSetting("shortcuts")
   * Because the async await function will cause the browser's default behavior to fail;
   */

  const shortcuts = userSettingsTable?.settings?.shortcuts;

  if (!shortcuts) return false;

  for (const shortcutType in shortcuts) {
    const shortcutString = shortcuts[shortcutType as EShortcutKeys];
    const keys = shortcutString.split("+");
    const pressedKeys: Record<string, boolean> = {
      Control: event.ctrlKey,
      Shift: event.shiftKey,
      Alt: event.altKey,
      Command: event.metaKey,
      [event.key.toUpperCase()]: true,
    };
    for (const key in pressedKeys) {
      if (!pressedKeys[key]) {
        delete pressedKeys[key];
      }
    }
    if (
      keys.length === Object.keys(pressedKeys).length &&
      keys.every((key) => pressedKeys[key])
    ) {
      return shortcutType as EShortcutKeys;
    }
  }
};

export function isImageFormat(fileName: string) {
  const imageExtensions = ["png", "jpg", "jpeg", "gif", "bmp", "webp"];
  const extension = fileName.split(".").pop();
  return extension != null && imageExtensions.includes(extension);
}
// Intentionally narrower than the backend's video_extensions (which also
// serves .mov/.avi/.mkv with a matching content-type). Those containers are
// unreliable or unsupported in HTML5 <video> across mainstream browsers, and
// a decode failure surfaces through the same onError path used for actually
// missing files - so misclassifying them as playable would silently wipe
// legitimate gallery entries whenever hideBrokenImage is set. Keep this list
// to formats that reliably play so onError stays a trustworthy "broken" signal.
export function isVideoFormat(fileName: string) {
  const videoExtensions = ["mp4", "webm", "ogg"];
  const extension = fileName.split(".").pop();
  return extension != null && videoExtensions.includes(extension);
}

export function getFileUrl(relativePath: string) {
  return viewMediaUrl(relativePath);
}

export function getWorkflowIdInUrlHash() {
  const hashArr = window.location.hash.slice(1).split("/");
  const workspaceId = hashArr.find((h) => h.includes("workspaceId@"));
  return workspaceId ? workspaceId.split("@")[1] : null;
}

/**
 * Generate url hash containing workflowId;
 * If workspaceId@ exists, replace it, if it does not exist, append it.
 * This operation will not damage the original hash.
 */
export function generateUrlHashWithFlowId(id: string) {
  const hashArr = window.location.hash.slice(1).split("/");
  const workspaceIdIndex = hashArr.findIndex((h) => h.includes("workspaceId@"));
  const newWorkflowId = `workspaceId@${id}`;
  if (workspaceIdIndex >= 0) {
    hashArr[workspaceIdIndex] = newWorkflowId;
  } else {
    hashArr.push(newWorkflowId);
  }
  return `${hashArr.join("/")}`;
}

export const openWorkflowInNewTab = (workflowID: string) => {
  const newHash = generateUrlHashWithFlowId(workflowID);
  window.open(`${window.location.origin}/#${newHash}`);
};

// Media paths can contain '#', '&', '+' or '%' - without encoding the server
// receives a different (or truncated) filename and answers 404.
export function viewMediaUrl(path: string): string {
  return `/workspace/view_media?filename=${encodeURIComponent(path)}`;
}
