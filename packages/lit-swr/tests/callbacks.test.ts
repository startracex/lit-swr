import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SWRController } from "../src/controller.js";
import {
  advanceAndFlush,
  createHost,
  deferred,
  flushMicrotasks,
  quietConfig,
  resetLibraryState,
  uniqueKey,
  waitFor,
} from "./helpers.js";

describe("lifecycle callbacks", () => {
  beforeEach(() => {
    resetLibraryState();
  });

  afterEach(() => {
    resetLibraryState();
    vi.useRealTimers();
  });

  it("calls onSuccess after a successful fetch", async () => {
    const key = uniqueKey("success");
    const onSuccess = vi.fn();
    const controller = new SWRController(createHost(), key, () => ({ ok: true }), {
      ...quietConfig,
      onSuccess,
    });
    await controller.revalidate({ force: true });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess.mock.calls[0]?.[0]).toEqual({ ok: true });
    expect(onSuccess.mock.calls[0]?.[1]).toBe(key);
  });

  it("calls onError after a failed fetch", async () => {
    const key = uniqueKey("error");
    const onError = vi.fn();
    const controller = new SWRController(
      createHost(),
      key,
      () => {
        throw new Error("boom");
      },
      {
        ...quietConfig,
        onError,
      },
    );
    await controller.revalidate({ force: true });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0]?.[0].message).toBe("boom");
  });

  it("fires onLoadingSlow when request exceeds loadingTimeout", async () => {
    vi.useFakeTimers();
    const key = uniqueKey("slow");
    const pending = deferred<string>();
    const onLoadingSlow = vi.fn();
    const controller = new SWRController(createHost(), key, () => pending.promise, {
      ...quietConfig,
      loadingTimeout: 50,
      onLoadingSlow,
    });

    const req = controller.revalidate({ force: true });
    await vi.advanceTimersByTimeAsync(50);
    expect(onLoadingSlow).toHaveBeenCalledTimes(1);
    expect(onLoadingSlow.mock.calls[0]?.[0]).toBe(key);

    pending.resolve("done");
    await req;
  });

  it("uses onErrorRetry instead of default retry timer when provided", async () => {
    const key = uniqueKey("custom-retry");
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("temp");
      })
      .mockImplementationOnce(() => "ok");
    const onErrorRetry = vi.fn((_err, _key, _config, revalidate) => {
      revalidate({ force: true });
    });

    const controller = new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      shouldRetryOnError: true,
      onErrorRetry,
    });

    await controller.revalidate({ force: true });
    expect(onErrorRetry).toHaveBeenCalledTimes(1);
    await waitFor(() => controller.data === "ok");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("stops retrying after errorRetryCount", async () => {
    vi.useFakeTimers();
    const key = uniqueKey("retry-count");
    const fetcher = vi.fn(() => {
      throw new Error("always");
    });
    const controller = new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      shouldRetryOnError: true,
      errorRetryInterval: 10,
      errorRetryCount: 2,
      maxAge: 0,
      dedupingInterval: 0,
    });

    await controller.revalidate({ force: true });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // retry #1 after errorRetryInterval * 1
    await advanceAndFlush(10);
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2);

    // retry #2 after errorRetryInterval * 2
    await advanceAndFlush(20);
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(3);

    const calls = fetcher.mock.calls.length;
    await advanceAndFlush(100);
    expect(fetcher.mock.calls.length).toBe(calls);
  });
});
