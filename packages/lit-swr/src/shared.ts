export const equal = (a: any, b: any, seen?: WeakMap<object, object>): boolean => {
  if (Object.is(a, b)) {
    return true;
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  if (a.constructor !== b.constructor) {
    return false;
  }

  if (a instanceof Date) {
    return a.getTime() === (b as Date).getTime();
  }
  if (a instanceof RegExp) {
    return a.source === (b as RegExp).source && a.flags === (b as RegExp).flags;
  }
  if (a instanceof Map) {
    const other = b as Map<unknown, unknown>;
    if (a.size !== other.size) {
      return false;
    }
    for (const [key, value] of a) {
      if (!other.has(key) || !equal(value, other.get(key), seen)) {
        return false;
      }
    }
    return true;
  }
  if (a instanceof Set) {
    const other = b as Set<unknown>;
    if (a.size !== other.size) {
      return false;
    }
    for (const value of a) {
      if (!other.has(value)) {
        return false;
      }
    }
    return true;
  }
  if (ArrayBuffer.isView(a)) {
    const viewA = a as ArrayBufferView;
    const viewB = b as ArrayBufferView;
    if (viewA.byteLength !== viewB.byteLength) {
      return false;
    }
    const bytesA = new Uint8Array(viewA.buffer, viewA.byteOffset, viewA.byteLength);
    const bytesB = new Uint8Array(viewB.buffer, viewB.byteOffset, viewB.byteLength);
    for (let i = 0; i < bytesA.length; i++) {
      if (bytesA[i] !== bytesB[i]) {
        return false;
      }
    }
    return true;
  }

  const seenMap = seen ?? new WeakMap<object, object>();
  if (seenMap.get(a) === b) {
    return true;
  }
  seenMap.set(a, b);

  if (Array.isArray(a)) {
    if (a.length !== (b as unknown[]).length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!equal(a[i], (b as unknown[])[i], seenMap)) {
        return false;
      }
    }
    return true;
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !equal(a[key], b[key], seenMap)) {
      return false;
    }
  }
  return true;
};

/** Stable cache key for primitives, arrays, and plain objects. */
export const serializeKey = (key: unknown): string => {
  if (typeof key === "string") {
    return key;
  }
  if (typeof key === "number" || typeof key === "boolean" || typeof key === "bigint") {
    return `${typeof key}:${String(key)}`;
  }
  if (key === null) {
    return "null";
  }
  if (key === undefined) {
    return "undefined";
  }
  if (typeof key === "symbol") {
    return `symbol:${key.description ?? ""}:${String(key)}`;
  }
  if (Array.isArray(key)) {
    return `[${key.map(serializeKey).join(",")}]`;
  }
  if (typeof key === "object") {
    const record = key as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${serializeKey(record[k])}`).join(",")}}`;
  }
  return String(key);
};

export const timeExpired = (timestamp: number, maxAge: number) => {
  if (maxAge <= 0) {
    return true;
  }
  return Date.now() - timestamp > maxAge;
};

export const Status = {
  pending: "pending",
  fulfilled: "fulfilled",
  rejected: "rejected",
} as const;

export type StatusType = (typeof Status)[keyof typeof Status];

export const isAbortError = (error: unknown): error is DOMException & { name: "AbortError" } =>
  (error instanceof DOMException && error.name === "AbortError") ||
  (typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: string }).name === "AbortError");

export const toError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === "string" ? error : "Request failed");
};

export const isHostConnected = (host: object): boolean => {
  if (
    "isConnected" in host &&
    typeof (host as { isConnected: unknown }).isConnected === "boolean"
  ) {
    return (host as { isConnected: boolean }).isConnected;
  }
  return true;
};
