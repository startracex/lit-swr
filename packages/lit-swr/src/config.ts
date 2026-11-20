import { equal } from "./shared.js";

export type FetcherType<K = string, T = any> = (key: K, init?: RequestInit) => T | Promise<T>;

export interface SWRConfig<Data = any, ErrorType = Error> {
  /** Polling interval in ms. `0` disables polling. */
  refreshInterval: number;
  /** Freshness TTL. Fresh cache skips revalidation unless forced. `0` always revalidates. */
  maxAge: number;
  /** Skip starting a new request if the same key finished within this window (unless forced). */
  dedupingInterval: number;
  /** Revalidate when window gains focus. */
  revalidateOnFocus: boolean;
  /** Revalidate when browser comes back online. */
  revalidateOnReconnect: boolean;
  /** Revalidate on mount even if cache exists. */
  revalidateOnMount: boolean;
  /** When true, revalidate automatically if cache is stale (past maxAge). */
  revalidateIfStale: boolean;
  /** Keep polling while document is hidden. */
  refreshWhenHidden: boolean;
  /** Keep polling while offline. */
  refreshWhenOffline: boolean;
  /** Retry fetcher errors automatically. */
  shouldRetryOnError: boolean;
  /** Delay between error retries. */
  errorRetryInterval: number;
  /** Max error retry attempts. `undefined` = unlimited. */
  errorRetryCount?: number;
  /** Only revalidate on focus once per this window. */
  focusThrottleInterval: number;
  /** Fire onLoadingSlow after this many ms. */
  loadingTimeout: number;
  /** Initial data when cache is empty. */
  fallbackData?: Data;
  /** Keep showing previous key's data while the new key loads. */
  keepPreviousData: boolean;
  /** Compare data to avoid unnecessary updates. */
  compare: (a: Data | null, b: Data | null) => boolean;
  /** When true, skip fetching and ignore results. */
  isPaused: () => boolean;
  requestUpdate: () => void;
  onSuccess?: (data: Data, key: any, config: SWRConfig<Data, ErrorType>) => void;
  onError?: (err: ErrorType, key: any, config: SWRConfig<Data, ErrorType>) => void;
  onErrorRetry?: (
    err: ErrorType,
    key: any,
    config: SWRConfig<Data, ErrorType>,
    revalidate: (opts?: { force?: boolean }) => void,
    opts: { retryCount: number },
  ) => void;
  onLoadingSlow?: (key: any, config: SWRConfig<Data, ErrorType>) => void;
}

const baseDefaults: Omit<SWRConfig, "requestUpdate"> = {
  refreshInterval: 0,
  maxAge: 5000,
  dedupingInterval: 2000,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  revalidateOnMount: true,
  revalidateIfStale: true,
  refreshWhenHidden: false,
  refreshWhenOffline: false,
  shouldRetryOnError: true,
  errorRetryInterval: 5000,
  focusThrottleInterval: 5000,
  loadingTimeout: 3000,
  keepPreviousData: false,
  compare: equal,
  isPaused: () => false,
};

let globalOverrides: Partial<SWRConfig> = {};

export const configureSWR = (config: Partial<SWRConfig>) => {
  globalOverrides = { ...globalOverrides, ...config };
};

export const getDefaultConfig = (): Omit<SWRConfig, "requestUpdate"> => ({
  ...baseDefaults,
  ...globalOverrides,
});

export const isDisabledKey = (key: unknown): boolean =>
  key === null || key === undefined || key === false;
