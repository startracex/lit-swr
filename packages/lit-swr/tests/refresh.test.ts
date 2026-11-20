import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SWRController } from "../src/controller.js";
import {
  advanceAndFlush,
  createHost,
  quietConfig,
  resetLibraryState,
  uniqueKey,
} from "./helpers.js";

describe("refreshInterval scheduler", () => {
  beforeEach(() => {
    resetLibraryState();
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetLibraryState();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("polls when refreshInterval elapses", async () => {
    const key = uniqueKey("poll");
    const fetcher = vi.fn(() => "tick");
    const controller = new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      revalidateOnMount: false,
      refreshInterval: 100,
      maxAge: 0,
      dedupingInterval: 0,
      loadingTimeout: 60_000,
    });

    await controller.revalidate({ force: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(controller.data).toBe("tick");

    fetcher.mockReturnValueOnce("tick-2");
    // Interval is scheduled at connect; first tick at 100ms is usually still
    // `Date.now() - timestamp === 100`, and timeExpired uses `>`, so need 2+ ticks.
    await advanceAndFlush(200);
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(controller.data).toBe("tick-2");
  });

  it("skips polling while document is hidden unless refreshWhenHidden", async () => {
    vi.stubGlobal("document", {
      hidden: true,
      visibilityState: "hidden",
      addEventListener() {},
      removeEventListener() {},
    });

    const key = uniqueKey("hidden");
    const fetcher = vi.fn(() => "x");
    const controller = new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      revalidateOnMount: false,
      refreshInterval: 50,
      refreshWhenHidden: false,
      maxAge: 0,
      dedupingInterval: 0,
      loadingTimeout: 60_000,
    });

    await controller.revalidate({ force: true });
    const calls = fetcher.mock.calls.length;
    await advanceAndFlush(500);
    expect(fetcher.mock.calls.length).toBe(calls);
  });

  it("polls while hidden when refreshWhenHidden is true", async () => {
    vi.stubGlobal("document", {
      hidden: true,
      visibilityState: "hidden",
      addEventListener() {},
      removeEventListener() {},
    });

    const key = uniqueKey("hidden-allow");
    const fetcher = vi.fn(() => "x");
    const controller = new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      revalidateOnMount: false,
      refreshInterval: 50,
      refreshWhenHidden: true,
      maxAge: 0,
      dedupingInterval: 0,
      loadingTimeout: 60_000,
    });

    await controller.revalidate({ force: true });
    const calls = fetcher.mock.calls.length;
    await advanceAndFlush(100);
    expect(fetcher.mock.calls.length).toBeGreaterThan(calls);
  });

  it("skips polling while offline unless refreshWhenOffline", async () => {
    vi.stubGlobal("navigator", { onLine: false });

    const key = uniqueKey("offline");
    const fetcher = vi.fn(() => "x");
    const controller = new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      revalidateOnMount: false,
      refreshInterval: 50,
      refreshWhenOffline: false,
      maxAge: 0,
      dedupingInterval: 0,
      loadingTimeout: 60_000,
    });

    await controller.revalidate({ force: true });
    const calls = fetcher.mock.calls.length;
    await advanceAndFlush(500);
    expect(fetcher.mock.calls.length).toBe(calls);
  });

  it("polls while offline when refreshWhenOffline is true", async () => {
    vi.stubGlobal("navigator", { onLine: false });

    const key = uniqueKey("offline-allow");
    const fetcher = vi.fn(() => "x");
    const controller = new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      revalidateOnMount: false,
      refreshInterval: 50,
      refreshWhenOffline: true,
      maxAge: 0,
      dedupingInterval: 0,
      loadingTimeout: 60_000,
    });

    await controller.revalidate({ force: true });
    const calls = fetcher.mock.calls.length;
    await advanceAndFlush(100);
    expect(fetcher.mock.calls.length).toBeGreaterThan(calls);
  });

  it("skips polling while isPaused returns true", async () => {
    let paused = false;
    const key = uniqueKey("paused-poll");
    const fetcher = vi.fn(() => "x");
    const controller = new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      revalidateOnMount: false,
      refreshInterval: 50,
      maxAge: 0,
      dedupingInterval: 0,
      loadingTimeout: 60_000,
      isPaused: () => paused,
    });

    await controller.revalidate({ force: true });
    paused = true;
    const calls = fetcher.mock.calls.length;
    await advanceAndFlush(500);
    expect(fetcher.mock.calls.length).toBe(calls);
  });

  it("skips polling when host is disconnected", async () => {
    const key = uniqueKey("disc-poll");
    const fetcher = vi.fn(() => "x");
    const host = createHost();
    const controller = new SWRController(host, key, fetcher, {
      ...quietConfig,
      revalidateOnMount: false,
      refreshInterval: 50,
      maxAge: 0,
      dedupingInterval: 0,
      loadingTimeout: 60_000,
    });

    await controller.revalidate({ force: true });
    const calls = fetcher.mock.calls.length;
    host.isConnected = false;
    await advanceAndFlush(500);
    expect(fetcher.mock.calls.length).toBe(calls);
  });
});
