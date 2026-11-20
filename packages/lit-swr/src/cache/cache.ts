import type { ReactiveControllerHost } from "@lit/reactive-element";

import { LRU } from "./lru.js";
import { RefreshScheduler } from "./refresh-scheduler.js";

export interface CacheEntry<T = any> {
  data: T | null;
  error: Error | null;
  timestamp: number;
}

export interface InflightEntry<T = any> {
  promise: Promise<T>;
  abort: AbortController;
}

export const resultCache = new LRU<unknown, CacheEntry>(256);

export const inflightCache = new Map<unknown, InflightEntry>();

export const abortInflight = (key: unknown) => {
  const entry = inflightCache.get(key);
  if (!entry) {
    return;
  }
  inflightCache.delete(key);
  entry.abort.abort();
};

export const uCache = new WeakMap<
  ReactiveControllerHost,
  Map<
    any,
    () => {
      data: any;
      error: Error | null;
      isValidating: boolean;
      isLoading: boolean;
      mutate: (data?: any) => void;
    }
  >
>();

export const refreshCache = {
  schedulers: new WeakMap<ReactiveControllerHost, RefreshScheduler>(),

  get(host: ReactiveControllerHost): RefreshScheduler {
    let scheduler = this.schedulers.get(host);
    if (!scheduler) {
      scheduler = new RefreshScheduler();
      this.schedulers.set(host, scheduler);
    }
    return scheduler;
  },

  delete(host: ReactiveControllerHost) {
    const scheduler = this.schedulers.get(host);
    if (scheduler) {
      scheduler.disconnect(host);
      this.schedulers.delete(host);
    }
  },
};
