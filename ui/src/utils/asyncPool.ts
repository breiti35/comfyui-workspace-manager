/**
 * Maps `items` through the async `worker` with at most `limit` calls in
 * flight at once, preserving input order in the result. Used for Civitai
 * hash lookups: firing one request per model at once (hundreds on a big
 * install) trips Civitai's rate limit and saturates the slow RunPod proxy.
 *
 * `shouldStop` is checked before each new item is started; once it returns
 * true no further items start and the pool resolves with `undefined` for the
 * skipped slots (callers that stop are expected to discard the result).
 * A rejected worker rejects the whole pool, like Promise.all.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  shouldStop?: () => boolean,
): Promise<(R | undefined)[]> {
  const results: (R | undefined)[] = new Array(items.length);
  let next = 0;
  const lanes = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));

  const runLane = async () => {
    while (next < items.length) {
      if (shouldStop?.()) return;
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: lanes }, runLane));
  return results;
}
