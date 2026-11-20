import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { configureSWR, getDefaultConfig } from "../src/config.js";
import { CONTROLLER, createSWR, useSWR } from "../src/swr.js";
import { useSWRMutation } from "../src/mutation.js";
import { createHost, quietConfig, resetLibraryState, uniqueKey, waitFor } from "./helpers.js";

const quiet = {
  ...quietConfig,
  revalidateOnMount: true,
} as const;

describe("createSWR / useSWR", () => {
  beforeEach(() => {
    resetLibraryState();
  });

  afterEach(() => {
    resetLibraryState();
  });

  it("createSWR returns loading then data", async () => {
    const host = createHost();
    const key = uniqueKey("create");
    const useData = createSWR(host, key, () => ({ ok: true }), quiet);

    const first = useData();
    expect(first.isValidating || first.isLoading).toBe(true);

    await waitFor(() => useData().data?.ok === true);
    expect(useData().error).toBeNull();
  });

  it("useSWR reuses controller for the same serialized key", async () => {
    const host = createHost();
    const key = { id: uniqueKey("obj") };
    const fetcher = vi.fn(() => 1);

    useSWR(host, key, fetcher, quiet);
    useSWR(host, { ...key }, fetcher, quiet);

    await waitFor(() => fetcher.mock.calls.length >= 1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("useSWR keepPreviousData shows old data for a new key", async () => {
    const host = createHost();
    const keyA = uniqueKey("a");
    const keyB = uniqueKey("b");

    let resolveB!: (value: string) => void;
    const promiseB = new Promise<string>((r) => {
      resolveB = r;
    });

    const fetcher = vi.fn((key: string) => {
      if (key === keyA) {
        return "A";
      }
      return promiseB;
    });

    useSWR(host, keyA, fetcher, quiet);
    await waitFor(() => useSWR(host, keyA, fetcher, quiet).data === "A");

    const next = useSWR(host, keyB, fetcher, { ...quiet, keepPreviousData: true });
    expect(next.data).toBe("A");

    resolveB("B");
    await waitFor(
      () => useSWR(host, keyB, fetcher, { ...quiet, keepPreviousData: true }).data === "B",
    );
  });

  it("useSWR with null key does not fetch", async () => {
    const host = createHost();
    const fetcher = vi.fn(() => "x");
    const result = useSWR(host, null as never, fetcher, quiet);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.data).toBeNull();
  });

  it("useSWR with false key is disabled", async () => {
    const host = createHost();
    const fetcher = vi.fn(() => "x");
    useSWR(host, false as never, fetcher, quiet);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("local config overrides configureSWR defaults", () => {
    configureSWR({ maxAge: 9999 });
    const host = createHost();
    const getter = createSWR(host, uniqueKey("cfg"), () => 1, {
      ...quiet,
      maxAge: 42,
      revalidateOnMount: false,
    });
    expect(getDefaultConfig().maxAge).toBe(9999);
    expect(getter[CONTROLLER]?.config.maxAge).toBe(42);
  });

  it("configureSWR changes global defaults", () => {
    configureSWR({ maxAge: 1234, revalidateOnFocus: false });
    expect(getDefaultConfig().maxAge).toBe(1234);
    expect(getDefaultConfig().revalidateOnFocus).toBe(false);
  });

  it("exposes controller via CONTROLLER symbol", () => {
    const host = createHost();
    const getter = createSWR(host, uniqueKey("sym"), () => 1, {
      ...quiet,
      revalidateOnMount: false,
    });
    expect(getter[CONTROLLER]).toBeTruthy();
  });

  it("useSWRMutation trigger populates shared cache key", async () => {
    const host = createHost();
    const key = uniqueKey("hook-mutation");
    const mutation = useSWRMutation(host, key, (_k, { arg }: { arg: number }) => arg * 2, {
      populateCache: true,
      revalidate: false,
    });
    const result = await mutation.trigger(21);
    expect(result).toBe(42);
    // useSWRMutation returns a snapshot; re-call to read updated state
    expect(useSWRMutation(host, key, () => 0, { revalidate: false }).data).toBe(42);
  });
});
