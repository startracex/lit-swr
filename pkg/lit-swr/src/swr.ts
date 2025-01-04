import type { ReactiveControllerHost } from "@lit/reactive-element";

import { uCache } from "./cache/cache.js";
import { type FetcherType, SWRController } from "./controller.js";

export type SWRResult<T> = {
  isValidating: boolean;
  isLoading: boolean;
  mutate: (data?: T) => void;
} & (
  | {
      data: T;
      error: null;
    }
  | {
      data: null;
      error: Error;
    }
);

export function createSWR<K = any, T = any>(
  host: ReactiveControllerHost,
  key: K,
  fetcher?: FetcherType<K, T>,
  config?: Partial<SWRController["config"]>,
): () => SWRResult<T> {
  const controller = new SWRController<K, T>(host, key, fetcher, config);
  return () => {
    controller.asyncFn();
    return {
      data: controller.data,
      error: controller.error,
      isValidating: controller.isValidating,
      isLoading: controller.isLoading,
      mutate: controller.mutate.bind(controller),
    } as SWRResult<T>;
  };
}

export function useSWR<K = any, T = any>(
  host: ReactiveControllerHost,
  key: K,
  fetcher: FetcherType<K, T>,
  config?: Partial<SWRController["config"]>,
): SWRResult<T> {
  let hostCache = uCache.get(host) as Map<K, () => SWRResult<T>>;
  if (!hostCache) {
    hostCache = new Map();
    uCache.set(host, hostCache);
  }

  let fn = hostCache.get(key);
  if (!fn) {
    fn = createSWR<K, T>(host, key, fetcher, config);
    hostCache.set(key, fn);
  }

  return fn();
}
