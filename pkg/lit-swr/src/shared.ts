export const equal = (a: any, b: any) => {
  if (a && b && typeof a === "object" && typeof b === "object") {
    if (Object.keys(a).length !== Object.keys(b).length) {
      return false;
    }
    for (const key in a) {
      if (!equal(a[key], b[key])) {
        return false;
      }
    }
    return true;
  }
  return a === b;
};

export const timeExpired = (timestamp: number, maxAge: number) => {
  return Date.now() - timestamp > maxAge;
};

export const Status = {
  pending: "pending",
  fulfilled: "fulfilled",
  rejected: "rejected",
} as const;

export const isAbortError = (error: any): error is DOMException & { name: "AbortError" } =>
  error instanceof DOMException && error.name === "AbortError";
