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
import {
  Status,
  type StatusType,
  equal,
  isAbortError,
  serializeKey,
  timeExpired,
  toError,
} from "./shared.js";

export type FetcherType<K = string, T = any> = (key: K, init?: RequestInit) => T | Promise<T>;

export interface SWRConfig {
  /** Polling interval in ms. `0` or omitted disables polling. */
  refreshInterval: number;
  /** Freshness TTL. Fresh cache skips revalidation unless forced. `0` always revalidates. */
  maxAge: number;
  /** Skip starting a new request if the same key finished within this window (unless forced). */
  dedupingInterval: number;
  requestUpdate: () => void;
}

const DEFAULT_MAX_AGE = 5000;
/** Concurrent dedupe is always on via `inflightCache`; timestamp dedupe is opt-in. */
const DEFAULT_DEDUPING_INTERVAL = 0;

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
  config!: SWRConfig;

  data: T | null = null;
  error: Error | null = null;
  isValidating = false;
  isLoading = false;
  timestamp = 0;
  status: StatusType = Status.pending;

  private generation = 0;
  private disposed = false;
  private updateScheduled = false;

  constructor(
    host: ReactiveControllerHost,
    key: K,
    fetcher: FetcherType<K, T> = defaultFetcher as FetcherType<K, T>,
    config: Partial<SWRConfig> = {},
  ) {
    this.host = host;
    this.key = key;
    this.cacheKey = serializeKey(key);
    this.fetcher = fetcher;
    this.mergeConfig(config);
    this.hydrateFromCache();
    this.host.addController(this);
  }

  mergeConfig(config: Partial<SWRConfig>) {
    const refreshInterval =
      typeof config.refreshInterval === "number" && config.refreshInterval > 0
        ? config.refreshInterval
        : 0;
    const maxAge = config.maxAge ?? (refreshInterval || DEFAULT_MAX_AGE);
    const dedupingInterval = config.dedupingInterval ?? DEFAULT_DEDUPING_INTERVAL;

    this.config = {
      requestUpdate: () => this.host.requestUpdate(),
      ...config,
      refreshInterval,
      maxAge,
      dedupingInterval,
    };
  }

  hostConnected() {
    this.disposed = false;
    subscribe(this.cacheKey, this);
    refreshCache.get(this.host).register(this);
  }

  hostDisconnected() {
    this.disposed = true;
    this.generation++;
    this.isValidating = false;
    this.isLoading = false;
    unsubscribe(this.cacheKey, this);
    refreshCache.get(this.host).unregister(this);
  }

  /** Kick off revalidation from render. Safe to call every update. */
  asyncFn() {
    this.revalidate();
  }

  /**
   * Stale-while-revalidate:
   * 1. Serve cached data immediately when present
   * 2. Revalidate in the background when stale or `force`d
   */
  async revalidate(options: { force?: boolean } = {}) {
    if (this.disposed) {
      return;
    }

    const force = options.force === true;
    const cached = resultCache.get(this.cacheKey) as CacheEntry<T> | undefined;

    if (cached) {
      const changed =
        cached.timestamp !== this.timestamp ||
        cached.error !== this.error ||
        !equal(cached.data, this.data);
      if (changed) {
        this.applyEntry(cached);
        this.requestUpdate();
      }

      if (!force && !timeExpired(cached.timestamp, this.config.maxAge)) {
        return;
      }

      if (!force && !timeExpired(cached.timestamp, this.config.dedupingInterval)) {
        return;
      }
    }

    if (this.isValidating && !force) {
      return;
    }

    if (force && this.isValidating) {
      this.generation++;
      abortInflight(this.cacheKey);
      this.isValidating = false;
    }

    await this.startRequest();
  }

  /** Apply a shared cache write from another subscriber. */
  syncFromBroadcast(entry: CacheEntry) {
    if (this.disposed) {
      return;
    }
    const changed =
      entry.timestamp !== this.timestamp ||
      entry.error !== this.error ||
      !equal(entry.data, this.data);
    if (!changed) {
      return;
    }
    this.applyEntry(entry as CacheEntry<T>);
    this.isValidating = false;
    this.isLoading = false;
    this.requestUpdate();
  }

  private hydrateFromCache() {
    const cached = resultCache.get(this.cacheKey) as CacheEntry<T> | undefined;
    if (cached) {
      this.applyEntry(cached);
    }
  }

  private applyEntry(entry: CacheEntry<T>) {
    this.data = entry.data;
    this.error = entry.error;
    this.timestamp = entry.timestamp;
    if (entry.error) {
      this.status = Status.rejected;
    } else if (entry.timestamp > 0) {
      this.status = Status.fulfilled;
    }
  }

  private writeCache(entry: CacheEntry<T>) {
    resultCache.set(this.cacheKey, entry);
    broadcast(this.cacheKey, entry, this);
  }

  private async startRequest() {
    if (this.disposed) {
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

    this.isLoading = this.data === null && this.error === null;
    this.isValidating = true;
    this.requestUpdate();

    try {
      const data = await entry.promise;
      if (this.disposed || gen !== this.generation) {
        return;
      }

      this.data = data;
      this.error = null;
      this.status = Status.fulfilled;
      this.timestamp = Date.now();
      this.writeCache({
        data,
        error: null,
        timestamp: this.timestamp,
      });
    } catch (error) {
      if (this.disposed || gen !== this.generation) {
        return;
      }

      if (isAbortError(error)) {
        // Another subscriber restarted the key — join the new in-flight request.
        const latest = inflightCache.get(this.cacheKey) as InflightEntry<T> | undefined;
        if (latest && latest.promise !== entry.promise) {
          await this.startRequest();
        }
        return;
      }

      this.error = toError(error);
      this.status = Status.rejected;
      this.timestamp = Date.now();
      // Keep previous data on error (stale-if-error)
      this.writeCache({
        data: this.data,
        error: this.error,
        timestamp: this.timestamp,
      });
    } finally {
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

  mutate(data?: T) {
    if (data === undefined) {
      this.revalidate({ force: true });
      return;
    }

    this.generation++;
    abortInflight(this.cacheKey);

    this.data = data;
    this.error = null;
    this.status = Status.fulfilled;
    this.isValidating = false;
    this.isLoading = false;
    this.timestamp = Date.now();
    this.writeCache({
      data,
      error: null,
      timestamp: this.timestamp,
    });
    this.requestUpdate();
  }
}
