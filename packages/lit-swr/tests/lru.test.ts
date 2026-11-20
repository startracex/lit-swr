import { describe, expect, it } from "vitest";

import { LRU } from "../src/cache/lru.js";

describe("LRU", () => {
  it("evicts the least recently used entry", () => {
    const cache = new LRU<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);

    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
    expect(cache.size).toBe(2);
  });

  it("updates existing keys without growing past capacity", () => {
    const cache = new LRU<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 11);
    cache.set("c", 3);

    expect(cache.get("a")).toBe(11);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
    expect(cache.size).toBe(2);
  });

  it("deletes and clears entries", () => {
    const cache = new LRU<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.delete("a");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(1);

    cache.clear();
    const missing = cache.get("b");
    expect(missing).toBeUndefined();
    expect(cache.size).toBe(0);
  });
});
