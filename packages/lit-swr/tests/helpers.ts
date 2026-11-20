import type { ReactiveController, ReactiveControllerHost } from "@lit/reactive-element";
import { vi } from "vitest";

import { clearCaches } from "../src/cache/cache.js";
import { type SWRConfig, resetSWRConfig } from "../src/config.js";
import { resetFocusEvents } from "../src/events.js";

export interface TestHost extends ReactiveControllerHost {
  isConnected: boolean;
  updateCount: number;
  controllers: ReactiveController[];
}

export const quietConfig = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateOnMount: false,
  shouldRetryOnError: false,
  dedupingInterval: 0,
  maxAge: 5000,
  refreshInterval: 0,
} as const satisfies Partial<SWRConfig>;

export const createHost = (): TestHost => {
  const host: TestHost = {
    isConnected: true,
    updateCount: 0,
    controllers: [],
    updateComplete: Promise.resolve(true),
    addController(controller) {
      host.controllers.push(controller);
      controller.hostConnected?.();
    },
    removeController(controller) {
      host.controllers = host.controllers.filter((c) => c !== controller);
      controller.hostDisconnected?.();
    },
    requestUpdate() {
      host.updateCount++;
    },
  };
  return host;
};

export const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

/**
 * Polyfill EventTarget methods on globalThis for Node so focus/online
 * listeners in events.ts can register and be dispatched in tests.
 */
export const installGlobalEventTarget = () => {
  const target = new EventTarget();
  vi.stubGlobal("addEventListener", target.addEventListener.bind(target));
  vi.stubGlobal("removeEventListener", target.removeEventListener.bind(target));
  vi.stubGlobal("dispatchEvent", target.dispatchEvent.bind(target));
  return target;
};

export const waitFor = async (
  predicate: () => boolean,
  { timeout = 1000, interval = 5 }: { timeout?: number; interval?: number } = {},
) => {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeout) {
      throw new Error("waitFor timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
};

/** Drain microtasks after advancing fake timers (revalidate / retry / poll). */
export const advanceAndFlush = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
  await flushMicrotasks();
};

export const resetLibraryState = () => {
  clearCaches();
  resetSWRConfig();
  resetFocusEvents();
};

let keySeq = 0;
export const uniqueKey = (prefix = "key") => `${prefix}-${++keySeq}-${Date.now()}`;

export const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
