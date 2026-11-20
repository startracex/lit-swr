export const equal = (a: any, b: any, seen?: WeakMap<object, object>): boolean => {
  if (Object.is(a, b)) {
    return true;
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object") {
    return false;
  }

  const seenMap = seen ?? new WeakMap<object, object>();
  if (seenMap.get(a) === b) {
    return true;
  }
  seenMap.set(a, b);

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
