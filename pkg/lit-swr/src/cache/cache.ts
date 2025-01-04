import type { ReactiveControllerHost } from "@lit/reactive-element";

import { LRU } from "./lru.js";
import { RefreshScheduler } from "./refresh-scheduler.js";

export const resultCache = new LRU<
  unknown,
  {
    data: any;
    error: Error | null;
    timestamp: number;
  }
>(256);

export const uCache = new WeakMap<
  ReactiveControllerHost,
  Map<
    any,
    () => {
      data: any;
      error: Error | null;
      isValidating: boolean;
      isLoading: boolean;
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
