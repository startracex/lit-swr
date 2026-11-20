import type { ReactiveControllerHost } from "@lit/reactive-element";

import type { SWRController } from "../controller.js";
import { isHostConnected, timeExpired } from "../shared.js";

export class RefreshScheduler {
  private controllers = new WeakMap<ReactiveControllerHost, Set<SWRController>>();
  private timers = new WeakMap<ReactiveControllerHost, ReturnType<typeof setInterval>>();

  register(controller: SWRController) {
    const { refreshInterval } = controller.config;
    if (refreshInterval <= 0) {
      return;
    }

    let hostControllers = this.controllers.get(controller.host);
    if (!hostControllers) {
      hostControllers = new Set();
      this.controllers.set(controller.host, hostControllers);
    }

    hostControllers.add(controller);
    this.scheduleRefresh(controller.host);
  }

  unregister(controller: SWRController) {
    const hostControllers = this.controllers.get(controller.host);
    if (!hostControllers) {
      return;
    }

    hostControllers.delete(controller);
    if (!hostControllers.size) {
      this.controllers.delete(controller.host);
      this.clearTimer(controller.host);
      return;
    }

    this.scheduleRefresh(controller.host);
  }

  private scheduleRefresh(host: ReactiveControllerHost) {
    this.clearTimer(host);

    const hostControllers = this.controllers.get(host);
    if (!hostControllers?.size) {
      return;
    }

    const refreshInterval = Math.min(...[...hostControllers].map((c) => c.config.refreshInterval));
    if (!(refreshInterval > 0)) {
      return;
    }

    this.timers.set(
      host,
      setInterval(() => this.refreshHost(host), refreshInterval),
    );
  }

  private refreshHost(host: ReactiveControllerHost) {
    const hostControllers = this.controllers.get(host);
    if (!hostControllers) {
      return;
    }

    if (!isHostConnected(host)) {
      return;
    }

    for (const controller of hostControllers) {
      const { refreshInterval } = controller.config;
      if (refreshInterval > 0 && timeExpired(controller.timestamp, refreshInterval)) {
        controller.revalidate({ force: true });
      }
    }
  }

  private clearTimer(host: ReactiveControllerHost) {
    const timer = this.timers.get(host);
    if (timer !== undefined) {
      clearInterval(timer);
      this.timers.delete(host);
    }
  }

  disconnect(host: ReactiveControllerHost) {
    this.clearTimer(host);
    this.controllers.delete(host);
  }
}
