import type { ReactiveControllerHost } from "@lit/reactive-element";

import { uCache } from "./cache/cache.js";
import { type FetcherType, type SWRConfig, isDisabledKey } from "./config.js";
import { SWRController } from "./controller.js";
import { type MutatorCallback, type MutatorOptions } from "./mutate.js";
import { serializeKey } from "./shared.js";

export interface SWRResult<T> {
  data: T | null;
  error: Error | null;
  isValidating: boolean;
  isLoading: boolean;
  mutate: (
    data?: T | null | MutatorCallback<T>,
    opts?: MutatorOptions<T>,
  ) => Promise<T | null | undefined>;
}

export const CONTROLLER = Symbol("lit-swr-controller");

export type SWRGetter<T> = (() => SWRResult<T>) & {
  [CONTROLLER]?: SWRController<any, T>;
};

const PREV_KEY = "__lit-swr-prev-getter__";

const toResult = <T>(controller: SWRController<any, T>): SWRResult<T> => ({
  data: controller.data,
  error: controller.error,
  isValidating: controller.isValidating,
  isLoading: controller.isLoading,
  mutate: (data?, opts?) => controller.mutate(data, opts),
});

export function createSWR<K = any, T = any>(
  host: ReactiveControllerHost,
  key: K,
  fetcher?: FetcherType<K, T>,
  config?: Partial<SWRConfig<T>>,
): SWRGetter<T> {
  const controller = new SWRController<K, T>(host, key, fetcher, config);
  const getter: SWRGetter<T> = () => {
    controller.asyncFn();
    return toResult(controller);
  };
  getter[CONTROLLER] = controller;
  return getter;
}

export function useSWR<K = any, T = any>(
  host: ReactiveControllerHost,
  key: K,
  fetcher: FetcherType<K, T>,
  config?: Partial<SWRConfig<T>>,
): SWRResult<T> {
  const cacheKey = serializeKey(key);
  let hostCache = uCache.get(host) as Map<string, SWRGetter<T>> | undefined;
  if (!hostCache) {
    hostCache = new Map();
    uCache.set(host, hostCache);
  }

  const prevGetter = hostCache.get(PREV_KEY);
  let fn = hostCache.get(cacheKey);

  if (!fn) {
    fn = createSWR<K, T>(host, key, fetcher, config) as SWRGetter<T>;
    hostCache.set(cacheKey, fn);

    const keepPrevious = config?.keepPreviousData === true;
    const controller = fn[CONTROLLER];
    const prevData = prevGetter?.[CONTROLLER]?.data ?? null;
    if (
      keepPrevious &&
      controller &&
      !isDisabledKey(key) &&
      controller.data === null &&
      prevData !== null
    ) {
      controller.data = prevData;
    }
  } else {
    const controller = fn[CONTROLLER];
    if (controller) {
      if (controller.key !== key) {
        const previousData = config?.keepPreviousData ? controller.data : undefined;
        controller.setKey(key, previousData);
      }
      controller.fetcher = fetcher;
      if (config) {
        controller.mergeConfig(config);
      }
    }
  }

  if (!isDisabledKey(key)) {
    hostCache.set(PREV_KEY, fn);
  }

  return fn();
}
