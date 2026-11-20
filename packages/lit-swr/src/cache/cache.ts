import type { ReactiveControllerHost } from "@lit/reactive-element";

import type { SWRController } from "../controller.js";
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

export const resultCache = new LRU<string, CacheEntry>(256);

export const inflightCache = new Map<string, InflightEntry>();

const subscribers = new Map<string, Set<SWRController>>();

export const abortInflight = (cacheKey: string) => {
  const entry = inflightCache.get(cacheKey);
  if (!entry) {
    return;
  }
  inflightCache.delete(cacheKey);
  entry.abort.abort();
};

export const subscribe = (cacheKey: string, controller: SWRController) => {
  let set = subscribers.get(cacheKey);
  if (!set) {
    set = new Set();
    subscribers.set(cacheKey, set);
  }
  set.add(controller);
};

export const unsubscribe = (cacheKey: string, controller: SWRController) => {
  const set = subscribers.get(cacheKey);
  if (!set) {
    return;
  }
  set.delete(controller);
  if (!set.size) {
    subscribers.delete(cacheKey);
  }
};

export const getSubscribers = (cacheKey: string): ReadonlySet<SWRController> =>
  subscribers.get(cacheKey) ?? emptySubscribers;

const emptySubscribers: ReadonlySet<SWRController> = new Set();

/** Push a cache write to every subscriber of this key except `except`. */
export const broadcast = (cacheKey: string, entry: CacheEntry, except?: SWRController) => {
  const set = subscribers.get(cacheKey);
  if (!set) {
    return;
  }
  for (const controller of set) {
    if (controller !== except) {
      controller.syncFromBroadcast(entry);
    }
  }
};

/** Ask every subscriber of this key to revalidate. */
export const revalidateSubscribers = (cacheKey: string, force = true) => {
  for (const controller of getSubscribers(cacheKey)) {
    controller.revalidate({ force });
  }
};

export const uCache = new WeakMap<
  ReactiveControllerHost,
  Map<
    string,
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
