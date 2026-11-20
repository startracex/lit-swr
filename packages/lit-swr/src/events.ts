import type { SWRController } from "./controller.js";

type Focusable = SWRController & {
  config: {
    revalidateOnFocus: boolean;
    revalidateOnReconnect: boolean;
    focusThrottleInterval: number;
  };
  revalidate: (opts?: { force?: boolean }) => void | Promise<void>;
};

const focusControllers = new Set<Focusable>();
const reconnectControllers = new Set<Focusable>();
const lastFocusRevalidate = new WeakMap<object, number>();

let listening = false;

const onFocus = () => {
  const now = Date.now();
  for (const controller of focusControllers) {
    if (!controller.config.revalidateOnFocus) {
      continue;
    }
    const last = lastFocusRevalidate.get(controller) ?? 0;
    if (now - last < controller.config.focusThrottleInterval) {
      continue;
    }
    lastFocusRevalidate.set(controller, now);
    controller.revalidate({ force: true });
  }
};

const onVisibility = () => {
  if (typeof document !== "undefined" && document.visibilityState === "visible") {
    onFocus();
  }
};

const onOnline = () => {
  for (const controller of reconnectControllers) {
    if (controller.config.revalidateOnReconnect) {
      controller.revalidate({ force: true });
    }
  }
};

const ensureListening = () => {
  if (listening || typeof globalThis.addEventListener !== "function") {
    return;
  }
  listening = true;
  globalThis.addEventListener("focus", onFocus);
  globalThis.addEventListener("online", onOnline);
  globalThis.document?.addEventListener("visibilitychange", onVisibility);
};

const maybeStopListening = () => {
  if (!listening || focusControllers.size || reconnectControllers.size) {
    return;
  }
  listening = false;
  if (typeof globalThis.removeEventListener !== "function") {
    return;
  }
  globalThis.removeEventListener("focus", onFocus);
  globalThis.removeEventListener("online", onOnline);
  globalThis.document?.removeEventListener("visibilitychange", onVisibility);
};

export const registerFocusEvents = (controller: Focusable) => {
  if (controller.config.revalidateOnFocus) {
    focusControllers.add(controller);
  }
  if (controller.config.revalidateOnReconnect) {
    reconnectControllers.add(controller);
  }
  ensureListening();
};

export const unregisterFocusEvents = (controller: Focusable) => {
  focusControllers.delete(controller);
  reconnectControllers.delete(controller);
  lastFocusRevalidate.delete(controller);
  maybeStopListening();
};

export const resetFocusEvents = () => {
  focusControllers.clear();
  reconnectControllers.clear();
  if (!listening) {
    return;
  }
  listening = false;
  if (typeof globalThis.removeEventListener !== "function") {
    return;
  }
  globalThis.removeEventListener("focus", onFocus);
  globalThis.removeEventListener("online", onOnline);
  globalThis.document?.removeEventListener("visibilitychange", onVisibility);
};
