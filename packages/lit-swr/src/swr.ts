import type { ReactiveControllerHost } from "@lit/reactive-element";

import { uCache } from "./cache/cache.js";
import { type FetcherType, type SWRConfig, SWRController } from "./controller.js";

export interface SWRResult<T> {
  data: T | null;
  error: Error | null;
  isValidating: boolean;
  isLoading: boolean;
  mutate: (data?: T) => void;
}

export function createSWR<K = any, T = any>(
  host: ReactiveControllerHost,
  key: K,
  fetcher?: FetcherType<K, T>,
  config?: Partial<SWRConfig>,
): () => SWRResult<T> {
  const controller = new SWRController<K, T>(host, key, fetcher, config);
  return () => {
    controller.asyncFn();
    return {
      data: controller.data,
      error: controller.error,
      isValidating: controller.isValidating,
      isLoading: controller.isLoading,
      mutate: (data?: T) => controller.mutate(data),
    };
  };
}

export function useSWR<K = any, T = any>(
  host: ReactiveControllerHost,
  key: K,
  fetcher: FetcherType<K, T>,
  config?: Partial<SWRConfig>,
): SWRResult<T> {
  let hostCache = uCache.get(host) as Map<K, () => SWRResult<T>> | undefined;
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
