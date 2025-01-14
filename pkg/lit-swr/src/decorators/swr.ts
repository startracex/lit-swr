import type { ReactiveElement } from "@lit/reactive-element";
import type { Interface } from "@lit/reactive-element/decorators/base.js";

import type { FetcherType, SWRController } from "../controller.js";
import { createSWR } from "../swr.js";

interface SWRDecorator {
  (proto: Interface<ReactiveElement>, name: PropertyKey, descriptor?: PropertyDescriptor): any;
  <C extends Interface<ReactiveElement>, S extends SWRController>(
    value: ClassAccessorDecoratorTarget<C, S>,
    context: ClassAccessorDecoratorContext<C, S>,
  ): ClassAccessorDecoratorResult<C, S>;
}

export const SWR = <K, V>(
  key: K,
  fetcher?: FetcherType<K, V>,
  config?: Partial<SWRController["config"]>,
): SWRDecorator => {
  return <C extends Interface<ReactiveElement>>(
    arg0: C | ClassAccessorDecoratorTarget<C, SWRController>,
    arg1: PropertyKey | ClassAccessorDecoratorContext<C, SWRController>,
  ) => {
    const keySymbol = Symbol();
    const descriptor = {
      get() {
        let result = this[keySymbol];
        if (!result) {
          result = createSWR(this, key, fetcher, config);
          this[keySymbol] = result;
        }
        return result;
      },
    };
    if (typeof arg1 === "string") {
      return Object.defineProperty(arg0, arg1, descriptor);
    }
    return descriptor;
  };
};
