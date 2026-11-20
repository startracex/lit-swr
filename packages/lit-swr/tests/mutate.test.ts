import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resultCache } from "../src/cache/cache.js";
import { SWRController } from "../src/controller.js";
import { mutate } from "../src/mutate.js";
import { serializeKey } from "../src/shared.js";
import {
  createHost,
  flushMicrotasks,
  quietConfig,
  resetLibraryState,
  uniqueKey,
  waitFor,
} from "./helpers.js";

describe("global mutate", () => {
  beforeEach(() => {
    resetLibraryState();
  });

  afterEach(() => {
    resetLibraryState();
  });

  it("writes cache and notifies subscribers", async () => {
    const key = uniqueKey("gmutate");
    const fetcher = vi.fn(() => "network");
    const controller = new SWRController(createHost(), key, fetcher, quietConfig);
    await controller.revalidate({ force: true });

    await mutate(key, "patched", { revalidate: false });
    await flushMicrotasks();

    expect(controller.data).toBe("patched");
    expect(resultCache.get(serializeKey(key))?.data).toBe("patched");
  });

  it("supports functional updater", async () => {
    const key = uniqueKey("fn");
    await mutate(key, 1, { revalidate: false });
    await mutate<number>(key, (current) => (current ?? 0) + 1, { revalidate: false });
    expect(resultCache.get(serializeKey(key))?.data).toBe(2);
  });

  it("mutate(key) forces subscriber revalidation", async () => {
    const key = uniqueKey("force");
    const fetcher = vi.fn(() => "v1");
    const controller = new SWRController(createHost(), key, fetcher, quietConfig);
    await controller.revalidate({ force: true });
    fetcher.mockResolvedValueOnce("v2");

    await mutate(key);
    await waitFor(() => controller.data === "v2");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("applies optimisticData and rolls back on error", async () => {
    const key = uniqueKey("g-opt");
    await mutate(key, "base", { revalidate: false });

    const result = mutate<string>(key, () => Promise.reject(new Error("x")), {
      optimisticData: "optimistic",
      revalidate: false,
      throwOnError: false,
    });
    expect(resultCache.get(serializeKey(key))?.data).toBe("optimistic");
    await result;
    expect(resultCache.get(serializeKey(key))?.data).toBe("base");
  });

  it("populateCache function transforms global writes", async () => {
    const key = uniqueKey("g-pop");
    await mutate(key, { n: 1 }, { revalidate: false });
    await mutate(
      key,
      { n: 2 },
      {
        revalidate: false,
        populateCache: (result, current) => ({ n: (current?.n ?? 0) + result.n }),
      },
    );
    expect(resultCache.get(serializeKey(key))?.data).toEqual({ n: 3 });
  });

  it("throwOnError:true rethrows", async () => {
    const key = uniqueKey("g-throw");
    await expect(
      mutate<string>(key, () => Promise.reject(new Error("bad")), {
        revalidate: false,
        throwOnError: true,
      }),
    ).rejects.toThrow("bad");
  });
});
