import { nanoid } from "nanoid";
import { fetchApi } from "../Api";

/**
 * A saved "recipe": the prompts plus everything needed to reproduce a result
 * (model, LoRAs, sampler settings). Stored server-side as db/prompts.json via
 * the generic /workspace/save_db + /workspace/get_db routes, so the library
 * survives clearing browser data and moves with the ComfyUI install - unlike
 * the IndexedDB-only tables (TableBase's disk backup is disabled).
 */
export interface PromptRecipe {
  id: string;
  name: string;
  positive: string;
  negative: string;
  model?: string;
  loras?: string[];
  sampler?: string;
  scheduler?: string;
  steps?: string;
  cfg?: string;
  seed?: string;
  size?: string;
  denoise?: string;
  tags: string[];
  /** Media localPath of the image this was saved from (for the card preview). */
  thumbnail?: string;
  createTime: number;
  updateTime?: number;
}

const TABLE = "prompts";
export const PROMPTS_CHANGED_EVENT = "promptLibraryChanged";

/**
 * Thrown when the library could not be read ("load") or written ("save").
 * Callers show a toast / error state instead of an empty library, so the user
 * doesn't mistake a network hiccup (slow RunPod proxy) for lost prompts.
 */
export class PromptLibraryError extends Error {
  constructor(
    public readonly kind: "load" | "save",
    message: string,
  ) {
    super(message);
    this.name = "PromptLibraryError";
  }
}

/**
 * Last successfully loaded list. Stays null until a load succeeded - a failed
 * load must NOT be cached as [], otherwise the next addPrompt() would persist
 * a one-element list and overwrite the whole library on disk.
 */
let cache: PromptRecipe[] | null = null;

/**
 * All reads that hit the server and all mutations run one after another
 * through this queue. Two quick edits (or an edit racing a forced reload)
 * would otherwise both start from the same snapshot and the later write would
 * silently drop the earlier change.
 */
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  // Keep the chain alive after a failed task; the caller still sees the error.
  queue = run.catch(() => undefined);
  return run;
}

async function loadFromServer(): Promise<PromptRecipe[]> {
  let resp: Response;
  try {
    resp = await fetchApi(`/workspace/get_db?table=${TABLE}`);
  } catch (e) {
    throw new PromptLibraryError("load", String(e));
  }
  if (!resp.ok) {
    throw new PromptLibraryError("load", `HTTP ${resp.status}`);
  }
  let parsed: unknown;
  try {
    // save_db stores the JSON string we send, so get_db hands it back as a
    // string (null when the file doesn't exist yet).
    const raw = await resp.json();
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    // A corrupt file is treated as a load failure, not as an empty library:
    // writing on top of it would destroy whatever is still recoverable.
    throw new PromptLibraryError("load", `invalid prompts.json: ${e}`);
  }
  if (parsed == null) {
    // File doesn't exist yet - a genuinely empty library.
    cache = [];
  } else if (Array.isArray(parsed)) {
    cache = parsed as PromptRecipe[];
  } else {
    throw new PromptLibraryError("load", "prompts.json is not a list");
  }
  return cache;
}

/**
 * Returns the library. Throws a PromptLibraryError when it can't be loaded;
 * the cache then stays empty (null) so no mutation can run on a bogus list.
 */
export async function listPrompts(force = false): Promise<PromptRecipe[]> {
  if (cache && !force) return cache;
  return serialize(loadFromServer);
}

/** Runs one mutation on the freshly loaded list and persists the result. */
function mutate<T>(
  change: (list: PromptRecipe[]) => { list: PromptRecipe[]; result: T },
): Promise<T> {
  return serialize(async () => {
    // Refuse to write unless we hold a successfully loaded list. Loading here
    // (inside the queue) instead of via listPrompts() avoids waiting on
    // ourselves.
    const current = cache ?? (await loadFromServer());
    const { list, result } = change([...current]);
    await persist(list);
    return result;
  });
}

async function persist(list: PromptRecipe[]): Promise<void> {
  let resp: Response;
  try {
    resp = await fetchApi("/workspace/save_db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: TABLE, json: JSON.stringify(list) }),
    });
  } catch (e) {
    console.error("Error saving prompt library:", e);
    throw new PromptLibraryError("save", String(e));
  }
  if (!resp.ok) {
    throw new PromptLibraryError("save", `HTTP ${resp.status}`);
  }
  // Only a confirmed write updates the cache and notifies the UI - otherwise
  // the panel would show an entry that isn't on disk.
  cache = list;
  window.dispatchEvent(new Event(PROMPTS_CHANGED_EVENT));
}

export async function addPrompt(
  item: Omit<PromptRecipe, "id" | "createTime">,
): Promise<PromptRecipe> {
  return mutate((list) => {
    const created: PromptRecipe = {
      ...item,
      id: nanoid(),
      createTime: Date.now(),
    };
    list.unshift(created);
    return { list, result: created };
  });
}

export async function updatePrompt(
  id: string,
  changes: Partial<PromptRecipe>,
): Promise<void> {
  return mutate((list) => ({
    list: list.map((p) =>
      p.id === id ? { ...p, ...changes, updateTime: Date.now() } : p,
    ),
    result: undefined,
  }));
}

export async function deletePrompt(id: string): Promise<void> {
  return mutate((list) => ({
    list: list.filter((p) => p.id !== id),
    result: undefined,
  }));
}

/** Auto-title from the positive prompt, so one-click saving needs no dialog. */
export function autoName(positive: string): string {
  const clean = positive.replace(/\s+/g, " ").trim();
  if (!clean) return "Prompt";
  return clean.length > 48 ? clean.slice(0, 48) + "…" : clean;
}

/** All tags currently in use, for the filter row. */
export function collectTags(list: PromptRecipe[]): string[] {
  const set = new Set<string>();
  list.forEach((p) => p.tags?.forEach((tag) => tag && set.add(tag)));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
