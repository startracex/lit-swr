import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resultCache } from "../src/cache/cache.js";
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

describe("SWRController", () => {
  beforeEach(() => {
    resetLibraryState();
  });

  afterEach(() => {
    resetLibraryState();
  });

  it("fetches and exposes data (stale-while-revalidate happy path)", async () => {
    const host = createHost();
    const key = uniqueKey("user");
    const fetcher = vi.fn(() => ({ id: 1, name: "Ada" }));

    const controller = new SWRController(host, key, fetcher, quietConfig);
    expect(controller.isLoading).toBe(false);

    await controller.revalidate();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(controller.data).toEqual({ id: 1, name: "Ada" });
    expect(controller.error).toBeNull();
    expect(controller.isValidating).toBe(false);
    expect(controller.isLoading).toBe(false);
  });

  it("serves cache immediately and skips network while fresh", async () => {
    const host = createHost();
    const key = uniqueKey("fresh");
    const fetcher = vi.fn(() => "ok");

    const a = new SWRController(host, key, fetcher, quietConfig);
    await a.revalidate();
    expect(fetcher).toHaveBeenCalledTimes(1);

    const b = new SWRController(createHost(), key, fetcher, quietConfig);
    expect(b.data).toBe("ok");
    await b.revalidate();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent requests for the same key", async () => {
    const key = uniqueKey("dedupe");
    const { promise, resolve } = deferred<string>();
    const fetcher = vi.fn(() => promise);

    const a = new SWRController(createHost(), key, fetcher, quietConfig);
    const b = new SWRController(createHost(), key, fetcher, quietConfig);

    const p1 = a.revalidate({ force: true });
    const p2 = b.revalidate({ force: true });
    await flushMicrotasks();
    expect(fetcher).toHaveBeenCalledTimes(1);

    resolve("shared");
    await Promise.all([p1, p2]);
    expect(a.data).toBe("shared");
    expect(b.data).toBe("shared");
  });

  it("keeps previous data on error (stale-if-error)", async () => {
    const key = uniqueKey("err");
    let shouldFail = false;
    const fetcher = vi.fn(() => {
      if (shouldFail) {
        throw new Error("fail");
      }
      return "good";
    });

    const controller = new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      maxAge: 0,
      dedupingInterval: 0,
    });
    await controller.revalidate({ force: true });
    expect(controller.data).toBe("good");

    shouldFail = true;
    await controller.revalidate({ force: true });
    expect(controller.data).toBe("good");
    expect(controller.error?.message).toBe("fail");
  });

  it("supports fallbackData before fetch completes", async () => {
    const key = uniqueKey("fallback");
    const { promise, resolve } = deferred<string>();

    const controller = new SWRController(createHost(), key, () => promise, {
      ...quietConfig,
      fallbackData: "fallback",
    });

    expect(controller.data).toBe("fallback");
    const pending = controller.revalidate({ force: true });
    expect(controller.isLoading).toBe(false);
    expect(controller.isValidating).toBe(true);

    resolve("live");
    await pending;
    expect(controller.data).toBe("live");
  });

  it("does not fetch when key is disabled", async () => {
    const fetcher = vi.fn(() => "x");
    const controller = new SWRController(createHost(), null as never, fetcher, quietConfig);
    expect(controller.enabled).toBe(false);
    await controller.revalidate({ force: true });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("mutate(data) writes cache and broadcasts to peers", async () => {
    const key = uniqueKey("mutate");
    const fetcher = vi.fn(() => "from-network");
    const a = new SWRController(createHost(), key, fetcher, quietConfig);
    const b = new SWRController(createHost(), key, fetcher, quietConfig);
    await a.revalidate({ force: true });

    await a.mutate("local");
    await flushMicrotasks();

    expect(a.data).toBe("local");
    expect(b.data).toBe("local");
    expect(resultCache.get(a.cacheKey)?.data).toBe("local");
  });

  it("mutate() forces revalidation", async () => {
    const key = uniqueKey("revalidate");
    const fetcher = vi.fn(() => "v1");
    const controller = new SWRController(createHost(), key, fetcher, quietConfig);
    await controller.revalidate({ force: true });
    fetcher.mockResolvedValueOnce("v2");

    await controller.mutate();
    await waitFor(() => controller.data === "v2");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("respects isPaused", async () => {
    const key = uniqueKey("paused");
    const fetcher = vi.fn(() => "x");
    const controller = new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      isPaused: () => true,
    });
    await controller.revalidate({ force: true });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("disconnect clears validating state and ignores late results", async () => {
    const key = uniqueKey("disconnect");
    const { promise, resolve } = deferred<string>();
    const host = createHost();
    const controller = new SWRController(host, key, () => promise, quietConfig);
    const pending = controller.revalidate({ force: true });
    host.removeController(controller);
    resolve("late");
    await pending;
    expect(controller.isValidating).toBe(false);
    expect(controller.data).toBeNull();
  });

  it("retries on error when enabled", async () => {
    vi.useFakeTimers();
    const key = uniqueKey("retry");
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("temp"))
      .mockResolvedValueOnce("recovered");

    const controller = new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      shouldRetryOnError: true,
      errorRetryInterval: 100,
      errorRetryCount: 1,
      maxAge: 0,
      dedupingInterval: 0,
    });

    await controller.revalidate({ force: true });
    expect(controller.error?.message).toBe("temp");

    await advanceAndFlush(100);
    expect(controller.data).toBe("recovered");
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
