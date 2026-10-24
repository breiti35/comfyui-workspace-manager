// Pure helpers for the gallery multi-select mode.

/** Toggle `id` in the selection; returns a new Set. */
export function toggleSelection(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Ids of `visibleIds` that are currently selected (hidden selections are ignored). */
export function selectedVisibleIds(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): string[] {
  return visibleIds.filter((id) => selected.has(id));
}

/** True if every visible id is selected (and there is at least one). */
export function allSelected(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): boolean {
  return visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
}
