import type { ReactiveControllerHost } from "@lit/reactive-element";
import { refreshCache, resultCache } from "./cache/cache.js";

import { Status, equal, isAbortError, timeExpired } from "./shared.js";

export type FetcherType<K = string, T = any> = (key: K, init?: RequestInit) => T | Promise<T>;

const initialMaxAge = 5000;

const defaultFetcher = async (key: string) =>
  fetch(key).then((res) => (res.headers.get("Content-Type") === "application/json" ? res.json() : res.text()));

export class SWRController<K = any, T = any> {
  host: ReactiveControllerHost;
  key: K;
  fetcher: FetcherType<K, T>;
  config: {
    refreshInterval?: number;
    maxAge?: number;
    requestUpdate?: () => void;
  };

  data: T | null = null;
  error: Error | null = null;
  isValidating = false;
  isLoading = false;
  timestamp = 0;

  status: (typeof Status)[keyof typeof Status] = Status.pending;
  abortController: AbortController = new AbortController();

  constructor(
    host: ReactiveControllerHost,
    key: K,
    fetcher: FetcherType<K, T> = defaultFetcher as FetcherType<K, T>,
    config: SWRController["config"] = {},
  ) {
    this.host = host;
    this.key = key;
    this.fetcher = fetcher;
    this.mergeConfig(config);
    this.host.addController(this);
  }

  protected mergeConfig(config: SWRController["config"]) {
    const refreshInterval = config.refreshInterval > 0 ? config.refreshInterval : 0;
    const maxAge = config.maxAge || refreshInterval || initialMaxAge;
    this.config = Object.assign({ requestUpdate: () => this.host.requestUpdate() }, config, {
      refreshInterval,
      maxAge,
    });
  }

  hostConnected() {
    refreshCache.get(this.host).register(this);
  }

  hostDisconnected() {
    refreshCache.delete(this.host);
  }

  async asyncFn() {
    if (this.isValidating) {
      return;
    }

    const cacheItem = resultCache.get(this.key);

    if (cacheItem && !timeExpired(cacheItem.timestamp, this.config.maxAge)) {
      this.data = cacheItem.data;
      this.error = cacheItem.error;
      this.timestamp = cacheItem.timestamp;
      this.status = cacheItem.error ? Status.rejected : Status.fulfilled;
      this.requestUpdate();
      return;
    }

    if (this.status === Status.rejected) {
      this.abortController = new AbortController();
    }

    this.isLoading = this.status === Status.pending;
    this.status = Status.pending;

    try {
      this.isValidating = true;
      const { signal } = this.abortController;
      const data: any = await this.fetcher(this.key, { signal });
      if (equal(this.data, data)) {
        return;
      }
      this.data = data;
      this.error = null;
      this.status = Status.fulfilled;
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      this.status = Status.rejected;
      this.data = null;
      this.error = error;
    } finally {
      this.timestamp = Date.now();
      this.isValidating = false;
      this.isLoading = false;
      resultCache.set(this.key, {
        data: this.data,
        error: this.error,
        maxAge: this.config.maxAge,
        timestamp: this.timestamp,
      });
      this.requestUpdate();
    }
  }

  requestUpdate() {
    this.config.requestUpdate();
  }
}
