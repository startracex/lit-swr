import type { ReactiveControllerHost } from "@lit/reactive-element";

import { type CacheEntry, broadcast, revalidateSubscribers, resultCache } from "./cache/cache.js";
import { type MutatorOptions } from "./mutate.js";
import { serializeKey, toError } from "./shared.js";

export type MutationFetcher<Arg, Data, Key = any> = (
  key: Key,
  options: { arg: Arg; signal?: AbortSignal },
) => Data | Promise<Data>;

export interface SWRMutationConfig<Data = any, ErrorType = Error, Arg = any> {
  onSuccess?: (data: Data, key: any, arg: Arg) => void;
  onError?: (err: ErrorType, key: any, arg: Arg) => void;
  populateCache?: boolean | ((result: Data, current: Data | null) => Data);
  optimisticData?: Data | ((current: Data | null, arg: Arg) => Data | null);
  rollbackOnError?: boolean | ((error: unknown) => boolean);
  throwOnError?: boolean;
  revalidate?: boolean;
}

export interface SWRMutationResult<Data, ErrorType, Arg> {
  data: Data | undefined;
  error: ErrorType | undefined;
  isMutating: boolean;
  trigger: (
    arg: Arg,
    opts?: MutatorOptions<Data> & SWRMutationConfig<Data, ErrorType, Arg>,
  ) => Promise<Data | undefined>;
  reset: () => void;
}

class MutationController<Key, Arg, Data, ErrorType extends Error = Error> {
  host: ReactiveControllerHost;
  key: Key;
  cacheKey: string;
  fetcher: MutationFetcher<Arg, Data, Key>;
  config: SWRMutationConfig<Data, ErrorType, Arg>;

  data: Data | undefined;
  error: ErrorType | undefined;
  isMutating = false;

  private abort: AbortController | null = null;
  private updateScheduled = false;

  constructor(
    host: ReactiveControllerHost,
    key: Key,
    fetcher: MutationFetcher<Arg, Data, Key>,
    config: SWRMutationConfig<Data, ErrorType, Arg> = {},
  ) {
    this.host = host;
    this.key = key;
    this.cacheKey = serializeKey(key);
    this.fetcher = fetcher;
    this.config = config;
  }

  private requestUpdate() {
    if (this.updateScheduled) {
      return;
    }
    this.updateScheduled = true;
    queueMicrotask(() => {
      this.updateScheduled = false;
      this.host.requestUpdate();
    });
  }

  reset() {
    this.abort?.abort();
    this.abort = null;
    this.data = undefined;
    this.error = undefined;
    this.isMutating = false;
    this.requestUpdate();
  }

  async trigger(
    arg: Arg,
    opts: MutatorOptions<Data> & SWRMutationConfig<Data, ErrorType, Arg> = {},
  ): Promise<Data | undefined> {
    const config = { ...this.config, ...opts };
    const {
      populateCache = false,
      optimisticData,
      rollbackOnError = true,
      throwOnError = true,
      revalidate = true,
    } = config;

    const current = (resultCache.get(this.cacheKey) as CacheEntry<Data> | undefined)?.data ?? null;
    const snapshot = current;

    this.abort?.abort();
    this.abort = new AbortController();
    const { signal } = this.abort;

    this.isMutating = true;
    this.error = undefined;
    this.requestUpdate();

    if (optimisticData !== undefined) {
      const next =
        typeof optimisticData === "function"
          ? (optimisticData as (c: Data | null, a: Arg) => Data | null)(current, arg)
          : optimisticData;
      const entry: CacheEntry<Data> = { data: next, error: null, timestamp: Date.now() };
      resultCache.set(this.cacheKey, entry);
      broadcast(this.cacheKey, entry);
    }

    try {
      const data = await this.fetcher(this.key, { arg, signal });
      if (signal.aborted) {
        return undefined;
      }

      this.data = data;
      this.error = undefined;
      this.isMutating = false;

      if (populateCache !== false && populateCache !== undefined) {
        const written = typeof populateCache === "function" ? populateCache(data, snapshot) : data;
        const entry: CacheEntry<Data> = {
          data: written as Data,
          error: null,
          timestamp: Date.now(),
        };
        resultCache.set(this.cacheKey, entry);
        broadcast(this.cacheKey, entry);
      }

      if (revalidate) {
        revalidateSubscribers(this.cacheKey, true);
      }

      config.onSuccess?.(data, this.key, arg);
      this.requestUpdate();
      return data;
    } catch (error) {
      if (signal.aborted) {
        return undefined;
      }

      const err = toError(error) as ErrorType;
      this.error = err;
      this.isMutating = false;

      const shouldRollback =
        typeof rollbackOnError === "function" ? rollbackOnError(error) : rollbackOnError;
      if (shouldRollback && optimisticData !== undefined) {
        const entry: CacheEntry<Data> = {
          data: snapshot,
          error: null,
          timestamp: Date.now(),
        };
        resultCache.set(this.cacheKey, entry);
        broadcast(this.cacheKey, entry);
      }

      config.onError?.(err, this.key, arg);
      this.requestUpdate();

      if (throwOnError) {
        throw err;
      }
      return undefined;
    }
  }
}

const mutationCache = new WeakMap<
  ReactiveControllerHost,
  Map<string, MutationController<any, any, any, any>>
>();

export function createSWRMutation<
  Key = any,
  Arg = any,
  Data = any,
  ErrorType extends Error = Error,
>(
  host: ReactiveControllerHost,
  key: Key,
  fetcher: MutationFetcher<Arg, Data, Key>,
  config?: SWRMutationConfig<Data, ErrorType, Arg>,
): () => SWRMutationResult<Data, ErrorType, Arg> {
  const controller = new MutationController<Key, Arg, Data, ErrorType>(host, key, fetcher, config);
  return () => ({
    data: controller.data,
    error: controller.error,
    isMutating: controller.isMutating,
    trigger: (arg, opts) => controller.trigger(arg, opts),
    reset: () => controller.reset(),
  });
}

export function useSWRMutation<Key = any, Arg = any, Data = any, ErrorType extends Error = Error>(
  host: ReactiveControllerHost,
  key: Key,
  fetcher: MutationFetcher<Arg, Data, Key>,
  config?: SWRMutationConfig<Data, ErrorType, Arg>,
): SWRMutationResult<Data, ErrorType, Arg> {
  const cacheKey = serializeKey(key);
  let hostCache = mutationCache.get(host);
  if (!hostCache) {
    hostCache = new Map();
    mutationCache.set(host, hostCache);
  }

  let controller = hostCache.get(cacheKey) as
    | MutationController<Key, Arg, Data, ErrorType>
    | undefined;
  if (!controller) {
    controller = new MutationController<Key, Arg, Data, ErrorType>(host, key, fetcher, config);
    hostCache.set(cacheKey, controller as MutationController<any, any, any, any>);
  } else {
    controller.key = key;
    controller.fetcher = fetcher;
    if (config) {
      controller.config = { ...controller.config, ...config };
    }
  }

  return {
    data: controller.data,
    error: controller.error,
    isMutating: controller.isMutating,
    trigger: (arg, opts) => controller!.trigger(arg, opts),
    reset: () => controller!.reset(),
  };
}
