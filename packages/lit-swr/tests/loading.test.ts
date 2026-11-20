import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SWRController } from "../src/controller.js";
import { createHost, deferred, quietConfig, resetLibraryState, uniqueKey } from "./helpers.js";

describe("loading / validating flags", () => {
  beforeEach(() => {
    resetLibraryState();
  });

  afterEach(() => {
    resetLibraryState();
  });

  it("isLoading is true only when there is no data yet", async () => {
    const key = uniqueKey("loading");
    const pending = deferred<string>();
    const controller = new SWRController(createHost(), key, () => pending.promise, quietConfig);

    const req = controller.revalidate({ force: true });
    expect(controller.isLoading).toBe(true);
    expect(controller.isValidating).toBe(true);

    pending.resolve("data");
    await req;
    expect(controller.isLoading).toBe(false);
    expect(controller.isValidating).toBe(false);
    expect(controller.data).toBe("data");
  });

  it("isValidating is true during background revalidation with existing data", async () => {
    const key = uniqueKey("bg");
    const pending = deferred<string>();
    let calls = 0;
    const controller = new SWRController(
      createHost(),
      key,
      () => {
        calls++;
        return calls === 1 ? "cached" : pending.promise;
      },
      { ...quietConfig, maxAge: 0, dedupingInterval: 0 },
    );

    await controller.revalidate({ force: true });
    expect(controller.data).toBe("cached");

    const req = controller.revalidate({ force: true });
    expect(controller.isLoading).toBe(false);
    expect(controller.isValidating).toBe(true);
    expect(controller.data).toBe("cached");

    pending.resolve("fresh");
    await req;
    expect(controller.data).toBe("fresh");
    expect(controller.isValidating).toBe(false);
  });

  it("fallbackData means isLoading stays false while validating", async () => {
    const key = uniqueKey("fallback-loading");
    const pending = deferred<string>();
    const controller = new SWRController(createHost(), key, () => pending.promise, {
      ...quietConfig,
      fallbackData: "fb",
    });

    const req = controller.revalidate({ force: true });
    expect(controller.data).toBe("fb");
    expect(controller.isLoading).toBe(false);
    expect(controller.isValidating).toBe(true);

    pending.resolve("live");
    await req;
    expect(controller.data).toBe("live");
  });
});
