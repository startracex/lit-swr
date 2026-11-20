import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SWRController } from "../src/controller.js";
import {
  createHost,
  deferred,
  flushMicrotasks,
  quietConfig,
  resetLibraryState,
  uniqueKey,
} from "./helpers.js";

describe("abort / signal", () => {
  beforeEach(() => {
    resetLibraryState();
  });

  afterEach(() => {
    resetLibraryState();
  });

  it("passes AbortSignal to the fetcher", async () => {
    const key = uniqueKey("signal");
    const seen: AbortSignal[] = [];
    const controller = new SWRController(
      createHost(),
      key,
      (_k, init) => {
        if (init?.signal) {
          seen.push(init.signal);
        }
        return "ok";
      },
      quietConfig,
    );
    await controller.revalidate({ force: true });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(AbortSignal);
    expect(seen[0]!.aborted).toBe(false);
  });

  it("aborts the previous in-flight request on force revalidate", async () => {
    const key = uniqueKey("abort-prev");
    const first = deferred<string>();
    const signals: AbortSignal[] = [];
    let calls = 0;
    const controller = new SWRController(
      createHost(),
      key,
      (_k, init) => {
        calls++;
        if (init?.signal) {
          signals.push(init.signal);
        }
        return calls === 1 ? first.promise : "second";
      },
      quietConfig,
    );

    const p1 = controller.revalidate({ force: true });
    await flushMicrotasks();
    const p2 = controller.revalidate({ force: true });
    await flushMicrotasks();

    expect(signals[0]?.aborted).toBe(true);
    first.resolve("late");
    await Promise.allSettled([p1, p2]);
    expect(controller.data).toBe("second");
  });

  it("ignores AbortError without surfacing it as error state", async () => {
    const key = uniqueKey("abort-err");
    const controller = new SWRController(
      createHost(),
      key,
      () => {
        const err = new DOMException("aborted", "AbortError");
        throw err;
      },
      quietConfig,
    );
    await controller.revalidate({ force: true });
    expect(controller.error).toBeNull();
  });
});
