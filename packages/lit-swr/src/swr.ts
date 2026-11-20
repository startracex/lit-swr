import type { ReactiveControllerHost } from "@lit/reactive-element";

import { uCache } from "./cache/cache.js";
import { type FetcherType, type SWRConfig, SWRController } from "./controller.js";
import { serializeKey } from "./shared.js";

export interface SWRResult<T> {
  data: T | null;
  error: Error | null;
  isValidating: boolean;
  isLoading: boolean;
  mutate: (data?: T) => void;
}

const CONTROLLER = Symbol("lit-swr-controller");

type SWRGetter<T> = (() => SWRResult<T>) & {
  [CONTROLLER]?: SWRController<any, T>;
};

export function createSWR<K = any, T = any>(
  host: ReactiveControllerHost,
  key: K,
  fetcher?: FetcherType<K, T>,
  config?: Partial<SWRConfig>,
): () => SWRResult<T> {
  const controller = new SWRController<K, T>(host, key, fetcher, config);
  const getter: SWRGetter<T> = () => {
    controller.asyncFn();
    return {
      data: controller.data,
      error: controller.error,
      isValidating: controller.isValidating,
      isLoading: controller.isLoading,
      mutate: (data?: T) => controller.mutate(data),
    };
  };
  getter[CONTROLLER] = controller;
  return getter;
}

export function useSWR<K = any, T = any>(
  host: ReactiveControllerHost,
  key: K,
  fetcher: FetcherType<K, T>,
  config?: Partial<SWRConfig>,
): SWRResult<T> {
  const cacheKey = serializeKey(key);
  let hostCache = uCache.get(host) as Map<string, SWRGetter<T>> | undefined;
  if (!hostCache) {
    hostCache = new Map();
    uCache.set(host, hostCache);
  }

  let fn = hostCache.get(cacheKey);
  if (!fn) {
    fn = createSWR<K, T>(host, key, fetcher, config) as SWRGetter<T>;
    hostCache.set(cacheKey, fn);
  } else {
    const controller = fn[CONTROLLER];
    if (controller) {
      controller.key = key;
      controller.fetcher = fetcher;
      if (config) {
        controller.mergeConfig(config);
      }
    }
  }

  return fn();
}
