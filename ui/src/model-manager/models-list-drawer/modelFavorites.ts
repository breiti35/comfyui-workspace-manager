// Lightweight per-model favorites, keyed by the model's "name@type" id.
// Stored locally (no sync needed) so a star toggle is instant and survives
// reloads. Kept intentionally simple - just a string set in localStorage.
const KEY = "WORKSPACE_MODEL_FAVORITES";

function read(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export function isModelFavorite(id: string): boolean {
  return read().has(id);
}

export function toggleModelFavorite(id: string): boolean {
  const s = read();
  if (s.has(id)) {
    s.delete(id);
  } else {
    s.add(id);
  }
  localStorage.setItem(KEY, JSON.stringify([...s]));
  return s.has(id);
}
