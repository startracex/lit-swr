import { describe, expect, it } from "vitest";

import { equal, isAbortError, serializeKey, timeExpired, toError } from "../src/shared.js";

describe("equal", () => {
  it("compares primitives with Object.is", () => {
    expect(equal(1, 1)).toBe(true);
    expect(equal(Number.NaN, Number.NaN)).toBe(true);
    expect(equal(0, -0)).toBe(false);
    expect(equal("a", "a")).toBe(true);
  });

  it("compares dates by time", () => {
    expect(equal(new Date(1), new Date(1))).toBe(true);
    expect(equal(new Date(1), new Date(2))).toBe(false);
  });

  it("compares plain objects and arrays deeply", () => {
    expect(equal({ a: 1, b: [2] }, { b: [2], a: 1 })).toBe(true);
    expect(equal([1, { x: 2 }], [1, { x: 2 }])).toBe(true);
    expect(equal([1], [1, 2])).toBe(false);
  });

  it("compares Map, Set, RegExp, and typed arrays", () => {
    expect(equal(new Map([["a", 1]]), new Map([["a", 1]]))).toBe(true);
    expect(equal(new Map([["a", 1]]), new Map([["a", 2]]))).toBe(false);
    expect(equal(new Set([1, 2]), new Set([1, 2]))).toBe(true);
    expect(equal(new Set([1]), new Set([1, 2]))).toBe(false);
    expect(equal(/a/g, /a/g)).toBe(true);
    expect(equal(/a/g, /a/i)).toBe(false);
    expect(equal(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(equal(new Uint8Array([1]), new Uint8Array([2]))).toBe(false);
  });

  it("handles circular references", () => {
    const a: Record<string, unknown> = { n: 1 };
    const b: Record<string, unknown> = { n: 1 };
    a.self = a;
    b.self = b;
    expect(equal(a, b)).toBe(true);
  });
});

describe("serializeKey", () => {
  it("keeps strings as-is", () => {
    expect(serializeKey("/api/user")).toBe("/api/user");
  });

  it("is stable for object key order", () => {
    expect(serializeKey({ b: 1, a: [2, 3] })).toBe(serializeKey({ a: [2, 3], b: 1 }));
  });

  it("distinguishes nullish disabled keys", () => {
    let undef: undefined;
    expect(serializeKey(null)).toBe("null");
    expect(serializeKey(undef)).toBe("undefined");
    expect(serializeKey(false)).toBe("boolean:false");
  });

  it("serializes nested arrays", () => {
    expect(serializeKey(["users", 1])).toBe(serializeKey(["users", 1]));
    expect(serializeKey(["users", 1])).not.toBe(serializeKey(["users", 2]));
  });
});

describe("timeExpired", () => {
  it("treats maxAge <= 0 as always expired", () => {
    expect(timeExpired(Date.now(), 0)).toBe(true);
    expect(timeExpired(Date.now(), -1)).toBe(true);
  });

  it("detects freshness window", () => {
    const now = Date.now();
    expect(timeExpired(now, 1000)).toBe(false);
    expect(timeExpired(now - 2000, 1000)).toBe(true);
  });
});

describe("toError / isAbortError", () => {
  it("passes through Error instances", () => {
    const err = new Error("boom");
    expect(toError(err)).toBe(err);
  });

  it("wraps non-errors", () => {
    expect(toError("x")).toBeInstanceOf(Error);
    expect(toError("x").message).toBe("x");
    expect(toError(123).message).toBe("Request failed");
  });

  it("detects abort errors by name", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isAbortError({ name: "AbortError" })).toBe(true);
    expect(isAbortError(new Error("nope"))).toBe(false);
  });
});
