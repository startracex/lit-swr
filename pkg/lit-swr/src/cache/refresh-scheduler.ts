import type { ReactiveControllerHost } from "@lit/reactive-element";

import type { SWRController } from "../controller.js";

export class RefreshScheduler {
  private controllers = new WeakMap<ReactiveControllerHost, Set<SWRController>>();
  private timers = new WeakMap<ReactiveControllerHost, number>();

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
    if (hostControllers) {
      hostControllers.delete(controller);
      if (!hostControllers.size) {
        this.controllers.delete(controller.host);
        this.clearTimer(controller.host);
      }
    }
  }

  private scheduleRefresh(host: ReactiveControllerHost) {
    this.clearTimer(host);

    const hostControllers = this.controllers.get(host);
    if (!hostControllers?.size) {
      return;
    }

    const refreshInterval = Math.min(...[...hostControllers].map((c) => c.config.refreshInterval));

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

    const now = Date.now();
    for (const controller of hostControllers) {
      if (!(controller.host as unknown as HTMLElement).isConnected) {
        continue;
      }

      const { refreshInterval } = controller.config;
      if (now - controller.timestamp >= refreshInterval) {
        controller.requestUpdate();
      }
    }
  }

  private clearTimer(host: ReactiveControllerHost) {
    const timer = this.timers.get(host);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(host);
    }
  }

  disconnect(host: ReactiveControllerHost) {
    this.clearTimer(host);
    this.controllers.delete(host);
  }
}
