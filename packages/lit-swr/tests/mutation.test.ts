import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resultCache } from "../src/cache/cache.js";
import { mutate } from "../src/mutate.js";
import { createSWRMutation, useSWRMutation } from "../src/mutation.js";
import { serializeKey } from "../src/shared.js";
import { createHost, deferred, flushMicrotasks, resetLibraryState, uniqueKey } from "./helpers.js";

describe("createSWRMutation / useSWRMutation", () => {
  beforeEach(() => {
    resetLibraryState();
  });

  afterEach(() => {
    resetLibraryState();
  });

  it("trigger runs fetcher and can populate cache", async () => {
    const host = createHost();
    const key = uniqueKey("mutation");
    const fetcher = vi.fn((_key: string, { arg }: { arg: { name: string } }) => ({
      id: 1,
      name: arg.name,
    }));

    const useMutation = createSWRMutation(host, key, fetcher, {
      populateCache: true,
      revalidate: false,
    });

    const result = await useMutation().trigger({ name: "Neo" });
    expect(result).toEqual({ id: 1, name: "Neo" });
    expect(useMutation().data).toEqual({ id: 1, name: "Neo" });
    expect(useMutation().isMutating).toBe(false);
    expect(resultCache.get(serializeKey(key))?.data).toEqual({ id: 1, name: "Neo" });
  });

  it("applies optimisticData and rolls back on error", async () => {
    const host = createHost();
    const key = uniqueKey("optimistic");
    await mutate(key, { name: "old" }, { revalidate: false });

    const useMutation = createSWRMutation(host, key, () => Promise.reject(new Error("nope")), {
      optimisticData: { name: "optimistic" },
      populateCache: true,
      revalidate: false,
      throwOnError: false,
    });

    const triggerPromise = useMutation().trigger(null);
    expect(resultCache.get(serializeKey(key))?.data).toEqual({ name: "optimistic" });

    await triggerPromise;
    expect(resultCache.get(serializeKey(key))?.data).toEqual({ name: "old" });
    expect(useMutation().error?.message).toBe("nope");
  });

  it("reset clears local mutation state", async () => {
    const host = createHost();
    const key = uniqueKey("reset");
    const useMutation = createSWRMutation(host, key, () => "ok", {
      revalidate: false,
    });
    await useMutation().trigger(null);
    expect(useMutation().data).toBe("ok");

    useMutation().reset();
    expect(useMutation().data).toBeUndefined();
    expect(useMutation().error).toBeUndefined();
  });

  it("useSWRMutation reuses instance for the same key", async () => {
    const host = createHost();
    const key = uniqueKey("reuse");
    const fetcher = vi.fn(() => "ok");
    const a = useSWRMutation(host, key, fetcher, { revalidate: false });
    await a.trigger(null);
    const b = useSWRMutation(host, key, fetcher, { revalidate: false });
    expect(b.data).toBe("ok");
  });

  it("calls onSuccess / onError hooks", async () => {
    const host = createHost();
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const ok = createSWRMutation(host, uniqueKey("ok"), () => "yes", {
      onSuccess,
      revalidate: false,
    });
    await ok().trigger(null);
    expect(onSuccess).toHaveBeenCalledWith("yes", expect.any(String), null);

    const bad = createSWRMutation(host, uniqueKey("bad"), () => Promise.reject(new Error("e")), {
      onError,
      throwOnError: false,
      revalidate: false,
    });
    await bad().trigger(null);
    expect(onError).toHaveBeenCalled();
  });

  it("throwOnError:true rejects the trigger promise", async () => {
    const host = createHost();
    const useMutation = createSWRMutation(
      host,
      uniqueKey("throw"),
      () => Promise.reject(new Error("boom")),
      { revalidate: false, throwOnError: true },
    );
    await expect(useMutation().trigger(null)).rejects.toThrow("boom");
  });

  it("populateCache function merges mutation result into cache", async () => {
    const host = createHost();
    const key = uniqueKey("pop-fn");
    await mutate(key, { count: 1 }, { revalidate: false });

    const useMutation = createSWRMutation(host, key, () => ({ count: 5 }), {
      populateCache: (result, current) => ({
        count: (current?.count ?? 0) + result.count,
      }),
      revalidate: false,
    });
    await useMutation().trigger(null);
    expect(resultCache.get(serializeKey(key))?.data).toEqual({ count: 6 });
  });

  it("aborts the previous in-flight mutation when trigger is called again", async () => {
    const host = createHost();
    const key = uniqueKey("abort-mut");
    const first = deferred<string>();
    let calls = 0;
    const useMutation = createSWRMutation(
      host,
      key,
      () => {
        calls++;
        return calls === 1 ? first.promise : "second";
      },
      { revalidate: false },
    );

    const p1 = useMutation().trigger(null);
    await flushMicrotasks();
    expect(useMutation().isMutating).toBe(true);

    const p2 = useMutation().trigger(null);
    first.resolve("late");
    await Promise.allSettled([p1, p2]);
    expect(useMutation().data).toBe("second");
  });

  it("does not write cache when populateCache is false", async () => {
    const host = createHost();
    const key = uniqueKey("no-pop");
    await mutate(key, "base", { revalidate: false });
    const useMutation = createSWRMutation(host, key, () => "mutated", {
      populateCache: false,
      revalidate: false,
    });
    await useMutation().trigger(null);
    expect(useMutation().data).toBe("mutated");
    expect(resultCache.get(serializeKey(key))?.data).toBe("base");
  });
});
