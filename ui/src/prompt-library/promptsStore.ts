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

let cache: PromptRecipe[] | null = null;

export async function listPrompts(force = false): Promise<PromptRecipe[]> {
  if (cache && !force) return cache;
  try {
    const resp = await fetchApi(`/workspace/get_db?table=${TABLE}`);
    if (!resp.ok) {
      cache = [];
      return cache;
    }
    // save_db stores the JSON string we send, so get_db hands it back as a
    // string (null when the file doesn't exist yet).
    const raw = await resp.json();
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    cache = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    cache = [];
  }
  return cache;
}

async function persist(list: PromptRecipe[]): Promise<void> {
  cache = list;
  try {
    await fetchApi("/workspace/save_db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: TABLE, json: JSON.stringify(list) }),
    });
  } catch (e) {
    console.error("Error saving prompt library:", e);
  }
  window.dispatchEvent(new Event(PROMPTS_CHANGED_EVENT));
}

export async function addPrompt(
  item: Omit<PromptRecipe, "id" | "createTime">,
): Promise<PromptRecipe> {
  const list = [...(await listPrompts())];
  const created: PromptRecipe = {
    ...item,
    id: nanoid(),
    createTime: Date.now(),
  };
  list.unshift(created);
  await persist(list);
  return created;
}

export async function updatePrompt(
  id: string,
  changes: Partial<PromptRecipe>,
): Promise<void> {
  const list = (await listPrompts()).map((p) =>
    p.id === id ? { ...p, ...changes, updateTime: Date.now() } : p,
  );
  await persist(list);
}

export async function deletePrompt(id: string): Promise<void> {
  const list = (await listPrompts()).filter((p) => p.id !== id);
  await persist(list);
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
