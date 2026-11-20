import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { configureSWR, getDefaultConfig, isDisabledKey, resetSWRConfig } from "../src/config.js";
import { SWRController } from "../src/controller.js";
import { createHost, quietConfig, resetLibraryState, uniqueKey } from "./helpers.js";

describe("configureSWR / defaults", () => {
  beforeEach(() => {
    resetLibraryState();
  });

  afterEach(() => {
    resetLibraryState();
  });

  it("merges global overrides into getDefaultConfig", () => {
    configureSWR({ maxAge: 42, revalidateOnFocus: false });
    expect(getDefaultConfig().maxAge).toBe(42);
    expect(getDefaultConfig().revalidateOnFocus).toBe(false);
    expect(getDefaultConfig().dedupingInterval).toBe(2000);
  });

  it("resetSWRConfig restores base defaults", () => {
    configureSWR({ maxAge: 1 });
    resetSWRConfig();
    expect(getDefaultConfig().maxAge).toBe(5000);
  });

  it("isDisabledKey covers null / undefined / false", () => {
    expect(isDisabledKey(null)).toBe(true);
    let undef: undefined;
    expect(isDisabledKey(undef)).toBe(true);
    expect(isDisabledKey(false)).toBe(true);
    expect(isDisabledKey(0)).toBe(false);
    expect(isDisabledKey("")).toBe(false);
    expect(isDisabledKey("x")).toBe(false);
  });

  it("inherits global fallbackData when local config omits it", () => {
    configureSWR({ fallbackData: "global-fb" as never });
    const controller = new SWRController(createHost(), uniqueKey("fb"), () => "live", quietConfig);
    expect(controller.data).toBe("global-fb");
  });

  it("local fallbackData overrides global", () => {
    configureSWR({ fallbackData: "global" as never });
    const controller = new SWRController(createHost(), uniqueKey("local-fb"), () => "live", {
      ...quietConfig,
      fallbackData: "local",
    });
    expect(controller.data).toBe("local");
  });
});
