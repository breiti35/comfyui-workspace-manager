import type { Table } from "./db-tables/WorkspaceDB";
import type { ModelsListRespItem } from "./model-manager/types";
import { api } from "./utils/comfyapp";

export function fetchApi(
  route: string,
  options?: RequestInit,
): Promise<Response> {
  if (api == null) {
    console.error("api is null!");
    throw new Error("api is null!");
  }
  return api.fetchApi(route, options);
}

export async function getDB(table: Table): Promise<string | undefined> {
  console.warn("[workspace deprecated] getDB is deprecated", table);
  try {
    const response = await fetchApi(`/workspace/get_db?table=${table}`);
    if (!response.ok) {
      return undefined;
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching workspace:", error);
    return undefined;
  }
}

export async function saveDB(table: Table, jsonData: string) {
  try {
    const response = await fetchApi("/workspace/save_db", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ table, json: jsonData }),
    });
    const result = await response.text();
    return result;
  } catch (error) {
    console.error("Error saving workspace:", error);
  }
}

export async function updateFile(file_path: string, jsonData: string) {
  try {
    const response = await fetchApi("/workspace/update_file", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file_path: file_path,
        json_str: jsonData,
      }),
    });
    const result = await response.text();
    return result;
  } catch (error) {
    alert("Error saving workflow .json file: " + error);
    console.error("Error saving workspace:", error);
  }
}

export async function deleteFile(file_path: string, deleteEmptyFolder = false) {
  try {
    const response = await fetchApi("/workspace/delete_file", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file_path: file_path,
        deleteEmptyFolder,
      }),
    });
    const result = await response.text();
    return result;
  } catch (error) {
    console.error("Error deleting file:", error);
  }
}

export async function getSystemDir(root?: string) {
  try {
    const response = await fetchApi("/workspace/get_system_dir", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        absolute_dir: root ?? "",
      }),
    });
    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Error getting workflows dir:", error);
  }
}

export async function openWorkflowsFolder() {
  try {
    const response = await fetchApi("/workspace/open_workflow_file_browser", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Error open workflows folder:", error);
  }
}

export async function fetchMyWorkflowsDir() {
  const resp = await fetchApi("/workspace/get_my_workflows_dir");
  const res = (await resp.json()) as {
    path?: string;
    error?: string;
    os: "win32" | "darwin" | "linux";
  };
  if (res.error) {
    alert(`Failed to fetch my workflows path: ${res.error}`);
  }
  return res;
}

// fresh=true makes the backend rescan before answering (the "Aktualisieren"
// action); otherwise it answers with its last scan and pushes a newer one
// via the model_list websocket event.
export async function getAllModelsList(
  fresh = false,
): Promise<Array<ModelsListRespItem & { date: number }>> {
  // Throws on network errors, non-2xx answers and malformed bodies, so the
  // models panel can show an error instead of spinning forever.
  const url = "/model_manager/get_model_list" + (fresh ? "?fresh=1" : "");
  const response = await fetchApi(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`get_model_list failed: HTTP ${response.status}`);
  }
  const result = await response.json();
  if (!Array.isArray(result)) {
    throw new Error("get_model_list returned no list");
  }
  return result as Array<ModelsListRespItem & { date: number }>;
}

// folder key -> absolute download target (null = backend can't resolve it,
// e.g. an older backend without the route). Session-lifetime cache: the
// mapping only changes with extra_model_paths.yaml, i.e. a ComfyUI restart.
const resolvedFolderCache = new Map<string, string | null>();

/**
 * Absolute directory a download into `folder` (a model folder key like
 * "loras") ends up in, via GET /model_manager/resolve_folder. Returns null
 * when the route is missing (404) or fails - callers then show the key.
 */
export async function resolveModelFolder(
  folder: string,
): Promise<string | null> {
  if (resolvedFolderCache.has(folder)) {
    return resolvedFolderCache.get(folder) ?? null;
  }
  try {
    const response = await fetchApi(
      `/model_manager/resolve_folder?folder=${encodeURIComponent(folder)}`,
    );
    if (!response.ok) {
      // A 404 won't change during this session - remember it. Other errors
      // (proxy hiccup) are retried on the next call.
      if (response.status === 404) resolvedFolderCache.set(folder, null);
      return null;
    }
    const result = (await response.json()) as { path?: string };
    const path = typeof result?.path === "string" && result.path ? result.path : null;
    resolvedFolderCache.set(folder, path);
    return path;
  } catch (error) {
    return null;
  }
}

export async function getAllFoldersList() {
  try {
    const response = await fetchApi("/model_manager/get_folder_list", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    const result = await response.json();
    return result as Record<string, string[]>;
  } catch (error) {
    console.error("Error get all models list:", error);
  }
}

export async function deleteLocalDiskFolder(folderPath: string) {
  try {
    const response = await fetchApi("/workspace/delete_folder", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        folder_path: folderPath,
      }),
    });
    const result = await response.text();
    return result;
  } catch (error) {
    console.error("Error move file:", error);
  }
}

// Deletes an installed model (file, preview images, hash entry). Throws with
// the backend's message on failure; the refreshed list follows as model_list.
export async function deleteModel(item: {
  model_type: string;
  model_name: string;
  model_extension: string;
}): Promise<void> {
  const response = await fetchApi("/model_manager/delete_model", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model_type: item.model_type,
      model_name: item.model_name,
      model_extension: item.model_extension,
    }),
  });
  if (!response.ok) {
    let msg = `HTTP ${response.status}`;
    try {
      msg = (await response.json()).error ?? msg;
    } catch {
      // keep the status text
    }
    throw new Error(msg);
  }
}

// Server-side free-text notes per installed model, keyed
// "<model_type>/<model_name><model_extension>".
export function modelNoteKey(item: {
  model_type: string;
  model_name: string;
  model_extension: string;
}): string {
  return `${item.model_type}/${item.model_name}${item.model_extension}`;
}

export async function fetchModelNotes(): Promise<Record<string, string>> {
  const response = await fetchApi("/model_manager/model_notes");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

// An empty note deletes the entry. Throws with the backend's message.
export async function saveModelNote(
  item: { model_type: string; model_name: string; model_extension: string },
  note: string,
): Promise<void> {
  const response = await fetchApi("/model_manager/model_note", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model_type: item.model_type,
      model_name: item.model_name,
      model_extension: item.model_extension,
      note,
    }),
  });
  if (!response.ok) {
    let msg = `HTTP ${response.status}`;
    try {
      msg = (await response.json()).error ?? msg;
    } catch {
      // keep the status text
    }
    throw new Error(msg);
  }
}

export async function cancelDownload(savePath: string) {
  try {
    const response = await fetchApi("/model_manager/cancel_installation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        save_path: savePath,
      }),
    });
    const result = await response.text();
    return result;
  } catch (error) {
    console.error("Error canceling download:", error);
  }
}

export async function copyFlowsToNewDirectory(
  sourceDir: string,
  dstDir: string,
) {
  try {
    const response = await fetchApi("/workspace/copy_json_files", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        src: sourceDir,
        dst: dstDir,
      }),
    });
    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Error copy flows to new directory:", error);
  }
}
