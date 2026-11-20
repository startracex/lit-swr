import { type CacheEntry, broadcast, revalidateSubscribers, resultCache } from "./cache/cache.js";
import { serializeKey } from "./shared.js";

export type MutatorCallback<Data = any> = (
  current: Data | null,
) => Data | null | Promise<Data | null>;

export interface MutatorOptions<Data = any> {
  /** Immediately show this data (or derive from current). */
  optimisticData?: Data | ((current: Data | null) => Data | null);
  /** Revalidate after mutation. Default true when data is omitted / async settles. */
  revalidate?: boolean;
  /** Write mutation result into cache. Default true. */
  populateCache?: boolean | ((result: Data, current: Data | null) => Data);
  /** Roll back optimistic update on error. Default true. */
  rollbackOnError?: boolean | ((error: unknown) => boolean);
  /** Rethrow mutation errors. Default true for async mutators. */
  throwOnError?: boolean;
}

const resolveData = <Data>(
  data: Data | null | MutatorCallback<Data> | undefined,
  current: Data | null,
): Data | null | undefined | Promise<Data | null> => {
  if (typeof data === "function") {
    return (data as MutatorCallback<Data>)(current);
  }
  return data;
};

const resolveOptimistic = <Data>(
  optimistic: MutatorOptions<Data>["optimisticData"],
  current: Data | null,
): Data | null | undefined => {
  if (optimistic === undefined) {
    return undefined;
  }
  if (typeof optimistic === "function") {
    return (optimistic as (current: Data | null) => Data | null)(current);
  }
  return optimistic;
};

const writeEntry = <Data>(cacheKey: string, data: Data | null, error: Error | null = null) => {
  const entry: CacheEntry<Data> = {
    data,
    error,
    timestamp: Date.now(),
  };
  resultCache.set(cacheKey, entry);
  broadcast(cacheKey, entry);
  return entry;
};

/**
 * Globally mutate cached data for a key.
 * - `mutate(key)` → force revalidate subscribers
 * - `mutate(key, data)` → write cache (+ optional revalidate)
 * - `mutate(key, updater)` → functional update
 */
export async function mutate<Data = any>(
  key: unknown,
  data?: Data | null | MutatorCallback<Data>,
  opts: MutatorOptions<Data> = {},
): Promise<Data | null | undefined> {
  const cacheKey = serializeKey(key);
  const current = (resultCache.get(cacheKey) as CacheEntry<Data> | undefined)?.data ?? null;

  const {
    optimisticData,
    revalidate = data === undefined,
    populateCache = true,
    rollbackOnError = true,
    throwOnError = true,
  } = opts;

  const optimistic = resolveOptimistic(optimisticData, current);
  if (optimistic !== undefined) {
    writeEntry(cacheKey, optimistic);
  }

  if (data === undefined && optimistic === undefined) {
    revalidateSubscribers(cacheKey, true);
    return current;
  }

  try {
    const next = await resolveData(data, current);
    if (next !== undefined && populateCache !== false) {
      const written =
        typeof populateCache === "function" ? populateCache(next as Data, current) : next;
      writeEntry(cacheKey, written);
    }
    if (revalidate) {
      revalidateSubscribers(cacheKey, true);
    }
    return next === undefined ? current : next;
  } catch (error) {
    const shouldRollback =
      typeof rollbackOnError === "function" ? rollbackOnError(error) : rollbackOnError;
    if (shouldRollback && optimistic !== undefined) {
      writeEntry(cacheKey, current);
    }
    if (throwOnError) {
      throw error;
    }
    return current;
  }
}
