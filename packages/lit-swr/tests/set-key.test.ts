import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SWRController } from "../src/controller.js";
import { serializeKey } from "../src/shared.js";
import { createHost, deferred, quietConfig, resetLibraryState, uniqueKey } from "./helpers.js";

describe("setKey / keepPreviousData", () => {
  beforeEach(() => {
    resetLibraryState();
  });

  afterEach(() => {
    resetLibraryState();
  });

  it("keeps previous data while the new key loads", async () => {
    const host = createHost();
    const keyA = uniqueKey("a");
    const keyB = uniqueKey("b");
    const pending = deferred<string>();
    const fetcher = vi.fn((key: string) => {
      if (key === keyA) {
        return "A";
      }
      return pending.promise;
    });

    const controller = new SWRController(host, keyA, fetcher, {
      ...quietConfig,
      keepPreviousData: true,
    });
    await controller.revalidate({ force: true });
    expect(controller.data).toBe("A");

    controller.setKey(keyB as never);
    expect(controller.cacheKey).toBe(serializeKey(keyB));
    expect(controller.data).toBe("A");

    const pendingFetch = controller.revalidate({ force: true });
    pending.resolve("B");
    await pendingFetch;
    expect(controller.data).toBe("B");
  });

  it("no-ops when the serialized key is unchanged", async () => {
    const host = createHost();
    const key = { id: uniqueKey("same") };
    const fetcher = vi.fn(() => 1);
    const controller = new SWRController(host, key, fetcher, quietConfig);
    await controller.revalidate({ force: true });
    const updates = host.updateCount;

    controller.setKey({ ...key });
    expect(host.updateCount).toBe(updates);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("disables fetching when setKey receives a disabled key", async () => {
    const host = createHost();
    const key = uniqueKey("to-null");
    const fetcher = vi.fn(() => "x");
    const controller = new SWRController(host, key, fetcher, quietConfig);
    await controller.revalidate({ force: true });

    controller.setKey(null as never);
    expect(controller.enabled).toBe(false);
    fetcher.mockClear();
    await controller.revalidate({ force: true });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("re-enables and hydrates cache when switching back to an active key", async () => {
    const host = createHost();
    const key = uniqueKey("reenable");
    const fetcher = vi.fn(() => "live");
    const controller = new SWRController(host, key, fetcher, quietConfig);
    await controller.revalidate({ force: true });

    controller.setKey(false as never);
    expect(controller.enabled).toBe(false);

    controller.setKey(key as never);
    expect(controller.enabled).toBe(true);
    expect(controller.data).toBe("live");
  });
});
