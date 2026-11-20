import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resultCache } from "../src/cache/cache.js";
import { SWRController } from "../src/controller.js";
import {
  createHost,
  deferred,
  flushMicrotasks,
  quietConfig,
  resetLibraryState,
  uniqueKey,
  waitFor,
} from "./helpers.js";

describe("bound mutate options", () => {
  beforeEach(() => {
    resetLibraryState();
  });

  afterEach(() => {
    resetLibraryState();
  });

  it("supports functional updater", async () => {
    const key = uniqueKey("fn-mutate");
    const controller = new SWRController(createHost(), key, () => 1, quietConfig);
    await controller.revalidate({ force: true });
    await controller.mutate((current) => (current ?? 0) + 5, { revalidate: false });
    expect(controller.data).toBe(6);
  });

  it("applies optimisticData then final value", async () => {
    const key = uniqueKey("opt");
    const pending = deferred<string>();
    const controller = new SWRController(createHost(), key, () => "base", quietConfig);
    await controller.revalidate({ force: true });

    const mutation = controller.mutate(() => pending.promise, {
      optimisticData: "optimistic",
      revalidate: false,
    });
    expect(controller.data).toBe("optimistic");

    pending.resolve("final");
    await mutation;
    expect(controller.data).toBe("final");
  });

  it("rolls back optimisticData when mutator throws", async () => {
    const key = uniqueKey("rollback");
    const controller = new SWRController(createHost(), key, () => "base", quietConfig);
    await controller.revalidate({ force: true });

    await controller.mutate(() => Promise.reject(new Error("fail")), {
      optimisticData: "optimistic",
      revalidate: false,
      throwOnError: false,
    });
    expect(controller.data).toBe("base");
  });

  it("populateCache:false leaves cache unchanged after mutator result", async () => {
    const key = uniqueKey("no-populate");
    const controller = new SWRController(createHost(), key, () => "base", quietConfig);
    await controller.revalidate({ force: true });

    await controller.mutate(() => "ignored", {
      populateCache: false,
      revalidate: false,
    });
    expect(controller.data).toBe("base");
    expect(resultCache.get(controller.cacheKey)?.data).toBe("base");
  });

  it("populateCache as function transforms written value", async () => {
    const key = uniqueKey("populate-fn");
    const controller = new SWRController(createHost(), key, () => ({ n: 1 }), quietConfig);
    await controller.revalidate({ force: true });

    await controller.mutate(() => ({ n: 2 }), {
      populateCache: (result, current) => ({ n: (current?.n ?? 0) + result.n }),
      revalidate: false,
    });
    expect(controller.data).toEqual({ n: 3 });
  });

  it("revalidate:true after mutate triggers a network refresh", async () => {
    const key = uniqueKey("mutate-revalidate");
    const fetcher = vi.fn(() => "v1");
    const controller = new SWRController(createHost(), key, fetcher, quietConfig);
    await controller.revalidate({ force: true });
    fetcher.mockReturnValueOnce("v2");

    await controller.mutate("temp", { revalidate: true });
    await waitFor(() => controller.data === "v2");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("throwOnError:true propagates mutator failures", async () => {
    const key = uniqueKey("throw");
    const controller = new SWRController(createHost(), key, () => "base", quietConfig);
    await controller.revalidate({ force: true });

    await expect(
      controller.mutate(() => Promise.reject(new Error("nope")), {
        revalidate: false,
        throwOnError: true,
      }),
    ).rejects.toThrow("nope");
  });

  it("broadcasts mutate to other subscribers", async () => {
    const key = uniqueKey("broadcast-mutate");
    const a = new SWRController(createHost(), key, () => "a", quietConfig);
    const b = new SWRController(createHost(), key, () => "b", quietConfig);
    await a.revalidate({ force: true });

    await a.mutate("shared", { revalidate: false });
    await flushMicrotasks();
    expect(b.data).toBe("shared");
  });
});
