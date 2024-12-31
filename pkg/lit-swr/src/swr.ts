import type { ReactiveControllerHost } from "@lit/reactive-element";

import { controllerCache } from "./cache/cache.js";
import { type FetcherType, SWRController } from "./controller.js";

type SWRResult<T> = {
  isValidating: boolean;
  isLoading: boolean;
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
    } as SWRResult<T>;
  };
}

export function useSWR<K = any, T = any>(
  host: ReactiveControllerHost,
  key: K,
  fetcher: FetcherType<K, T>,
  config?: Partial<SWRController["config"]>,
): SWRResult<T> {
  let hostCache = controllerCache.get(host) as Map<K, () => SWRResult<T>>;
  if (!hostCache) {
    hostCache = new Map();
    controllerCache.set(host, hostCache);
  }

  let fn = hostCache.get(key);
  if (!fn) {
    fn = createSWR<K, T>(host, key, fetcher, config);
    hostCache.set(key, fn);
  }

  return fn();
}
