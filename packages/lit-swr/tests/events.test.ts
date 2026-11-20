import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SWRController } from "../src/controller.js";
import {
  advanceAndFlush,
  createHost,
  flushMicrotasks,
  installGlobalEventTarget,
  quietConfig,
  resetLibraryState,
  uniqueKey,
  waitFor,
} from "./helpers.js";

describe("focus / reconnect events", () => {
  beforeEach(() => {
    resetLibraryState();
    installGlobalEventTarget();
  });

  afterEach(() => {
    resetLibraryState();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("revalidates on window focus when enabled", async () => {
    const key = uniqueKey("focus");
    const fetcher = vi.fn(() => "v1");
    const controller = new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      revalidateOnFocus: true,
      revalidateOnMount: false,
      focusThrottleInterval: 0,
      maxAge: 60_000,
    });
    await controller.revalidate({ force: true });
    expect(fetcher).toHaveBeenCalledTimes(1);

    fetcher.mockReturnValueOnce("v2");
    globalThis.dispatchEvent(new Event("focus"));
    await waitFor(() => controller.data === "v2");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("throttles focus revalidation with focusThrottleInterval", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "Date"],
    });
    const key = uniqueKey("focus-throttle");
    const fetcher = vi.fn(() => "x");
    const controller = new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      revalidateOnFocus: true,
      revalidateOnMount: false,
      focusThrottleInterval: 1000,
      maxAge: 0,
      dedupingInterval: 0,
    });
    await controller.revalidate({ force: true });
    expect(fetcher).toHaveBeenCalledTimes(1);

    globalThis.dispatchEvent(new Event("focus"));
    await flushMicrotasks();
    expect(fetcher).toHaveBeenCalledTimes(2);

    globalThis.dispatchEvent(new Event("focus"));
    await flushMicrotasks();
    expect(fetcher).toHaveBeenCalledTimes(2);

    await advanceAndFlush(1000);
    globalThis.dispatchEvent(new Event("focus"));
    await flushMicrotasks();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("revalidates on online event when enabled", async () => {
    const key = uniqueKey("online");
    const fetcher = vi.fn(() => "offline-cache");
    const controller = new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      revalidateOnReconnect: true,
      revalidateOnMount: false,
      maxAge: 60_000,
    });
    await controller.revalidate({ force: true });
    fetcher.mockReturnValueOnce("online");
    globalThis.dispatchEvent(new Event("online"));
    await waitFor(() => controller.data === "online");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not revalidate on focus when disabled", async () => {
    const key = uniqueKey("focus-off");
    const fetcher = vi.fn(() => "x");
    const controller = new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      revalidateOnFocus: false,
      revalidateOnMount: false,
    });
    await controller.revalidate({ force: true });
    globalThis.dispatchEvent(new Event("focus"));
    await flushMicrotasks();
    await new Promise((r) => setTimeout(r, 20));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(controller.data).toBe("x");
  });

  it("revalidates on visibilitychange when document becomes visible", async () => {
    const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    const doc = {
      visibilityState: "hidden",
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (!listeners.has(type)) {
          listeners.set(type, new Set());
        }
        listeners.get(type)!.add(listener);
      },
      removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        listeners.get(type)?.delete(listener);
      },
    };
    vi.stubGlobal("document", doc);
    installGlobalEventTarget();

    const key = uniqueKey("visibility");
    const fetcher = vi.fn(() => "hidden");
    const controller = new SWRController(createHost(), key, fetcher, {
      ...quietConfig,
      revalidateOnFocus: true,
      revalidateOnMount: false,
      focusThrottleInterval: 0,
      maxAge: 60_000,
    });
    await controller.revalidate({ force: true });
    fetcher.mockReturnValueOnce("visible");

    doc.visibilityState = "visible";
    for (const listener of listeners.get("visibilitychange") ?? []) {
      if (typeof listener === "function") {
        listener(new Event("visibilitychange"));
      }
    }
    await waitFor(() => controller.data === "visible");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
