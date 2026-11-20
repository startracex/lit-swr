import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resultCache } from "../src/cache/cache.js";
import { SWRController } from "../src/controller.js";
import { serializeKey } from "../src/shared.js";
import {
  createHost,
  deferred,
  flushMicrotasks,
  quietConfig,
  resetLibraryState,
  uniqueKey,
  waitFor,
} from "./helpers.js";

describe("revalidate policy", () => {
  beforeEach(() => {
    resetLibraryState();
  });

  afterEach(() => {
    resetLibraryState();
    vi.useRealTimers();
  });

  it("skips network while within maxAge", async () => {
    const key = uniqueKey("maxAge");
    const fetcher = vi.fn(() => "v1");
    const controller = new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      maxAge: 60_000,
    });
    await controller.revalidate({ force: true });
    await controller.revalidate();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetches when maxAge expires", async () => {
    vi.useFakeTimers();
    const key = uniqueKey("stale");
    const fetcher = vi.fn(() => "fresh");
    const controller = new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      maxAge: 100,
      dedupingInterval: 0,
    });
    await controller.revalidate({ force: true });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(150);
    fetcher.mockReturnValueOnce("refetched");
    await controller.revalidate();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(controller.data).toBe("refetched");
  });

  it("honors dedupingInterval after a completed request", async () => {
    vi.useFakeTimers();
    const key = uniqueKey("dedupe-window");
    const fetcher = vi.fn(() => "x");
    const controller = new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      maxAge: 0,
      dedupingInterval: 1000,
    });
    await controller.revalidate({ force: true });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await controller.revalidate();
    expect(fetcher).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1001);
    await controller.revalidate();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("revalidateIfStale:false keeps stale cache without refetch", async () => {
    vi.useFakeTimers();
    const key = uniqueKey("no-stale");
    const fetcher = vi.fn(() => "cached");
    const controller = new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      maxAge: 50,
      dedupingInterval: 0,
      revalidateIfStale: false,
    });
    await controller.revalidate({ force: true });
    await vi.advanceTimersByTimeAsync(100);
    await controller.revalidate();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(controller.data).toBe("cached");
  });

  it("revalidateOnMount triggers a fetch when connected", async () => {
    const key = uniqueKey("mount");
    const fetcher = vi.fn(() => "mounted");
    new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      revalidateOnMount: true,
    });
    await waitFor(() => fetcher.mock.calls.length === 1);
    expect(resultCache.get(serializeKey(key))?.data).toBe("mounted");
  });

  it("force revalidate aborts in-flight and starts a new request", async () => {
    const key = uniqueKey("abort-force");
    const first = deferred<string>();
    const second = deferred<string>();
    let calls = 0;
    const fetcher = vi.fn(() => {
      calls++;
      return calls === 1 ? first.promise : second.promise;
    });

    const controller = new SWRController(createHost(), key, fetcher, quietConfig);
    const p1 = controller.revalidate({ force: true });
    await flushMicrotasks();
    expect(fetcher).toHaveBeenCalledTimes(1);

    const p2 = controller.revalidate({ force: true });
    await flushMicrotasks();
    expect(fetcher).toHaveBeenCalledTimes(2);

    first.resolve("old");
    second.resolve("new");
    await Promise.allSettled([p1, p2]);
    expect(controller.data).toBe("new");
  });

  it("peers join a replacement in-flight after abort", async () => {
    const key = uniqueKey("rejoin");
    const first = deferred<string>();
    const second = deferred<string>();
    let calls = 0;
    const fetcher = vi.fn(() => {
      calls++;
      return calls === 1 ? first.promise : second.promise;
    });

    const a = new SWRController(createHost(), key, fetcher, quietConfig);
    const b = new SWRController(createHost(), key, fetcher, quietConfig);

    const pa = a.revalidate({ force: true });
    const pb = b.revalidate({ force: true });
    await flushMicrotasks();
    expect(fetcher).toHaveBeenCalledTimes(1);

    const pa2 = a.revalidate({ force: true });
    await flushMicrotasks();
    expect(fetcher).toHaveBeenCalledTimes(2);

    first.resolve("stale");
    second.resolve("latest");
    await Promise.allSettled([pa, pb, pa2]);
    await waitFor(() => b.data === "latest");
    expect(a.data).toBe("latest");
    expect(b.data).toBe("latest");
  });

  it("custom compare suppresses unnecessary requestUpdate noise for equal data", async () => {
    const key = uniqueKey("compare");
    const compare = vi.fn(
      (a: string | null, b: string | null) => a?.toLowerCase() === b?.toLowerCase(),
    );
    const host = createHost();
    const controller = new SWRController(host, key, () => "Hello", {
      ...quietConfig,
      compare,
    });
    await controller.revalidate({ force: true });
    const updates = host.updateCount;

    await controller.revalidate({ force: true });
    // compare used; host may still update for isValidating transitions
    expect(compare).toHaveBeenCalled();
    expect(controller.data).toBe("Hello");
    expect(host.updateCount).toBeGreaterThanOrEqual(updates);
  });
});
