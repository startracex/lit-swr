import type { ReactiveController, ReactiveControllerHost } from "@lit/reactive-element";

import {
  type CacheEntry,
  type InflightEntry,
  abortInflight,
  broadcast,
  inflightCache,
  refreshCache,
  resultCache,
  subscribe,
  unsubscribe,
} from "./cache/cache.js";
import { type FetcherType, type SWRConfig, getDefaultConfig, isDisabledKey } from "./config.js";
import { registerFocusEvents, unregisterFocusEvents } from "./events.js";
import { type MutatorCallback, type MutatorOptions } from "./mutate.js";
import {
  Status,
  type StatusType,
  isAbortError,
  serializeKey,
  timeExpired,
  toError,
} from "./shared.js";

const defaultFetcher = async (key: string, init?: RequestInit) => {
  const res = await fetch(key, init);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const contentType = res.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res.text();
};

export class SWRController<K = any, T = any> implements ReactiveController {
  host: ReactiveControllerHost;
  key: K;
  /** Stable key used for shared caches / dedupe / subscribers. */
  cacheKey: string;
  fetcher: FetcherType<K, T>;
  config!: SWRConfig<T>;

  data: T | null = null;
  error: Error | null = null;
  isValidating = false;
  isLoading = false;
  timestamp = 0;
  status: StatusType = Status.pending;
  enabled = true;

  private generation = 0;
  private disposed = false;
  private updateScheduled = false;
  private mounted = false;
  private errorRetryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private loadingTimer: ReturnType<typeof setTimeout> | undefined;
  private previousData: T | null = null;

  constructor(
    host: ReactiveControllerHost,
    key: K,
    fetcher: FetcherType<K, T> = defaultFetcher as FetcherType<K, T>,
    config: Partial<SWRConfig<T>> = {},
  ) {
    this.host = host;
    this.key = key;
    this.cacheKey = serializeKey(key);
    this.fetcher = fetcher;
    this.enabled = !isDisabledKey(key);
    this.mergeConfig(config);
    this.hydrateInitial();
    this.host.addController(this);
  }

  mergeConfig(config: Partial<SWRConfig<T>>) {
    const defaults = getDefaultConfig();
    const refreshInterval =
      typeof config.refreshInterval === "number" && config.refreshInterval > 0
        ? config.refreshInterval
        : typeof defaults.refreshInterval === "number" && defaults.refreshInterval > 0
          ? defaults.refreshInterval
          : 0;
    const maxAge = config.maxAge ?? defaults.maxAge ?? (refreshInterval || 5000);
    const dedupingInterval = config.dedupingInterval ?? defaults.dedupingInterval ?? 2000;

    this.config = {
      ...defaults,
      requestUpdate: () => this.host.requestUpdate(),
      ...config,
      refreshInterval,
      maxAge,
      dedupingInterval,
    } as SWRConfig<T>;
  }

  /** Swap key (used by useSWR when keepPreviousData / key changes). */
  setKey(key: K, previousData?: T | null) {
    if (serializeKey(key) === this.cacheKey && key === this.key) {
      return;
    }

    const wasEnabled = this.enabled;
    if (wasEnabled) {
      unsubscribe(this.cacheKey, this);
      unregisterFocusEvents(this);
      refreshCache.get(this.host).unregister(this);
    }

    if (previousData !== undefined) {
      this.previousData = previousData;
    } else if (this.config.keepPreviousData && this.data !== null) {
      this.previousData = this.data;
    }

    this.generation++;
    abortInflight(this.cacheKey);
    this.clearRetry();
    this.clearLoadingTimer();

    this.key = key;
    this.cacheKey = serializeKey(key);
    this.enabled = !isDisabledKey(key);
    this.error = null;
    this.isValidating = false;
    this.isLoading = false;
    this.timestamp = 0;
    this.status = Status.pending;
    this.errorRetryCount = 0;

    this.hydrateInitial();

    if (this.config.keepPreviousData && this.data === null && this.previousData !== null) {
      this.data = this.previousData;
    }

    if (!this.disposed && this.mounted && this.enabled) {
      subscribe(this.cacheKey, this);
      registerFocusEvents(this);
      refreshCache.get(this.host).register(this);
    }

    this.requestUpdate();
  }

  hostConnected() {
    this.disposed = false;
    this.mounted = true;
    if (!this.enabled) {
      return;
    }
    subscribe(this.cacheKey, this);
    registerFocusEvents(this);
    refreshCache.get(this.host).register(this);

    if (this.config.revalidateOnMount) {
      this.revalidate({ force: !this.hasLoadedData() });
    }
  }

  hostDisconnected() {
    this.disposed = true;
    this.mounted = false;
    this.generation++;
    this.isValidating = false;
    this.isLoading = false;
    this.clearRetry();
    this.clearLoadingTimer();
    if (this.enabled) {
      unsubscribe(this.cacheKey, this);
      unregisterFocusEvents(this);
      refreshCache.get(this.host).unregister(this);
    }
  }

  /** Kick off revalidation from render. Safe to call every update. */
  asyncFn() {
    if (!this.enabled) {
      return;
    }
    this.revalidate();
  }

  /**
   * Stale-while-revalidate:
   * 1. Serve cached data immediately when present
   * 2. Revalidate in the background when stale or forced
   */
  async revalidate(options: { force?: boolean } = {}) {
    if (this.disposed || !this.enabled) {
      return;
    }
    if (this.config.isPaused()) {
      return;
    }

    const force = options.force === true;
    const cached = resultCache.get(this.cacheKey) as CacheEntry<T> | undefined;

    if (cached) {
      const changed =
        cached.timestamp !== this.timestamp ||
        cached.error !== this.error ||
        !this.config.compare(cached.data, this.data);
      if (changed) {
        this.applyEntry(cached);
        this.requestUpdate();
      }

      const fresh = !timeExpired(cached.timestamp, this.config.maxAge);
      if (!force && fresh) {
        return;
      }

      if (!force && !this.config.revalidateIfStale && cached.timestamp > 0) {
        return;
      }

      if (!force && !timeExpired(cached.timestamp, this.config.dedupingInterval)) {
        return;
      }
    } else if (!force && this.hasLoadedData() && !this.config.revalidateIfStale) {
      return;
    }

    if (this.isValidating && !force) {
      return;
    }

    if (force && this.isValidating) {
      this.generation++;
      abortInflight(this.cacheKey);
      this.isValidating = false;
      this.clearRetry();
    }

    await this.startRequest();
  }

  /** Apply a shared cache write from another subscriber. */
  syncFromBroadcast(entry: CacheEntry) {
    if (this.disposed || !this.enabled) {
      return;
    }
    const changed =
      entry.timestamp !== this.timestamp ||
      entry.error !== this.error ||
      !this.config.compare(entry.data, this.data);
    if (!changed) {
      return;
    }
    this.applyEntry(entry as CacheEntry<T>);
    this.isValidating = false;
    this.isLoading = false;
    if (entry.data !== null) {
      this.previousData = null;
    }
    this.requestUpdate();
  }

  private hasLoadedData() {
    return this.data !== null || (this.config.fallbackData !== undefined && this.error === null);
  }

  private hydrateInitial() {
    if (!this.enabled) {
      this.data = this.config.fallbackData ?? null;
      return;
    }
    const cached = resultCache.get(this.cacheKey) as CacheEntry<T> | undefined;
    if (cached) {
      this.applyEntry(cached);
      return;
    }
    if (this.config.fallbackData !== undefined) {
      this.data = this.config.fallbackData;
      this.error = null;
      this.status = Status.fulfilled;
    }
  }

  private applyEntry(entry: CacheEntry<T>) {
    this.data = entry.data;
    this.error = entry.error;
    this.timestamp = entry.timestamp;
    if (entry.error) {
      this.status = Status.rejected;
    } else if (entry.timestamp > 0 || entry.data !== null) {
      this.status = Status.fulfilled;
    }
  }

  private writeCache(entry: CacheEntry<T>) {
    resultCache.set(this.cacheKey, entry);
    broadcast(this.cacheKey, entry, this);
  }

  private clearRetry() {
    if (this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  private clearLoadingTimer() {
    if (this.loadingTimer !== undefined) {
      clearTimeout(this.loadingTimer);
      this.loadingTimer = undefined;
    }
  }

  private scheduleErrorRetry(error: Error) {
    if (!this.config.shouldRetryOnError) {
      return;
    }
    const max = this.config.errorRetryCount;
    if (max !== undefined && this.errorRetryCount >= max) {
      return;
    }

    const retryCount = this.errorRetryCount + 1;
    const revalidate = (opts?: { force?: boolean }) => {
      this.errorRetryCount = retryCount;
      this.revalidate({ force: opts?.force ?? true });
    };

    if (this.config.onErrorRetry) {
      this.config.onErrorRetry(error, this.key, this.config, revalidate, { retryCount });
      return;
    }

    this.clearRetry();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      revalidate({ force: true });
    }, this.config.errorRetryInterval * retryCount);
  }

  private async startRequest() {
    if (this.disposed || !this.enabled) {
      return;
    }
    if (this.config.isPaused()) {
      return;
    }

    const gen = this.generation;
    let entry = inflightCache.get(this.cacheKey) as InflightEntry<T> | undefined;

    if (!entry) {
      const abort = new AbortController();
      const promise = Promise.resolve()
        .then(() => this.fetcher(this.key, { signal: abort.signal }))
        .finally(() => {
          if (inflightCache.get(this.cacheKey)?.promise === promise) {
            inflightCache.delete(this.cacheKey);
          }
        });
      entry = { promise, abort };
      inflightCache.set(this.cacheKey, entry);
    }

    this.isLoading =
      this.data === null && this.error === null && this.config.fallbackData === undefined;
    this.isValidating = true;
    this.requestUpdate();

    this.clearLoadingTimer();
    this.loadingTimer = setTimeout(() => {
      this.loadingTimer = undefined;
      if (!this.disposed && gen === this.generation && this.isValidating) {
        this.config.onLoadingSlow?.(this.key, this.config);
      }
    }, this.config.loadingTimeout);

    try {
      const data = await entry.promise;
      if (this.disposed || gen !== this.generation) {
        return;
      }
      if (this.config.isPaused()) {
        return;
      }

      this.data = data;
      this.error = null;
      this.status = Status.fulfilled;
      this.timestamp = Date.now();
      this.errorRetryCount = 0;
      this.previousData = null;
      this.writeCache({
        data,
        error: null,
        timestamp: this.timestamp,
      });
      this.config.onSuccess?.(data, this.key, this.config);
    } catch (error) {
      if (this.disposed || gen !== this.generation) {
        return;
      }

      if (isAbortError(error)) {
        const latest = inflightCache.get(this.cacheKey) as InflightEntry<T> | undefined;
        if (latest && latest.promise !== entry.promise) {
          await this.startRequest();
        }
        return;
      }

      if (this.config.isPaused()) {
        return;
      }

      this.error = toError(error);
      this.status = Status.rejected;
      this.timestamp = Date.now();
      this.writeCache({
        data: this.data,
        error: this.error,
        timestamp: this.timestamp,
      });
      this.config.onError?.(this.error, this.key, this.config);
      this.scheduleErrorRetry(this.error);
    } finally {
      this.clearLoadingTimer();
      if (!this.disposed && gen === this.generation) {
        this.isValidating = false;
        this.isLoading = false;
        this.requestUpdate();
      }
    }
  }

  /** Schedule host update asynchronously to avoid sync updates during render. */
  requestUpdate() {
    if (this.updateScheduled || this.disposed) {
      return;
    }
    this.updateScheduled = true;
    queueMicrotask(() => {
      this.updateScheduled = false;
      if (!this.disposed) {
        this.config.requestUpdate();
      }
    });
  }

  async mutate(
    data?: T | null | MutatorCallback<T>,
    opts: MutatorOptions<T> = {},
  ): Promise<T | null | undefined> {
    if (!this.enabled) {
      return this.data;
    }

    const current = this.data;
    const {
      optimisticData,
      revalidate = data === undefined,
      populateCache = true,
      rollbackOnError = true,
      throwOnError = true,
    } = opts;

    const applyOptimistic = () => {
      if (optimisticData === undefined) {
        return undefined as T | null | undefined;
      }
      const next =
        typeof optimisticData === "function"
          ? (optimisticData as (c: T | null) => T | null)(current)
          : optimisticData;
      this.generation++;
      abortInflight(this.cacheKey);
      this.clearRetry();
      this.data = next;
      this.error = null;
      this.status = Status.fulfilled;
      this.isValidating = false;
      this.isLoading = false;
      this.timestamp = Date.now();
      this.writeCache({
        data: next,
        error: null,
        timestamp: this.timestamp,
      });
      this.requestUpdate();
      return next;
    };

    applyOptimistic();

    if (data === undefined && optimisticData === undefined) {
      await this.revalidate({ force: true });
      return this.data;
    }

    try {
      const resolved =
        typeof data === "function" ? await (data as MutatorCallback<T>)(current) : data;

      if (resolved !== undefined && populateCache !== false) {
        const written =
          typeof populateCache === "function"
            ? populateCache(resolved as T, current)
            : (resolved as T | null);
        this.generation++;
        abortInflight(this.cacheKey);
        this.data = written;
        this.error = null;
        this.status = Status.fulfilled;
        this.isValidating = false;
        this.isLoading = false;
        this.timestamp = Date.now();
        this.writeCache({
          data: written,
          error: null,
          timestamp: this.timestamp,
        });
        this.requestUpdate();
      }

      if (revalidate) {
        await this.revalidate({ force: true });
      }
      return resolved === undefined ? this.data : resolved;
    } catch (error) {
      const shouldRollback =
        typeof rollbackOnError === "function" ? rollbackOnError(error) : rollbackOnError;
      if (shouldRollback && optimisticData !== undefined) {
        this.data = current;
        this.timestamp = Date.now();
        this.writeCache({
          data: current,
          error: null,
          timestamp: this.timestamp,
        });
        this.requestUpdate();
      }
      if (throwOnError) {
        throw error;
      }
      return current;
    }
  }
}
