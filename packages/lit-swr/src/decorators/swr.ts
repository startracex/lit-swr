import type { ReactiveElement } from "@lit/reactive-element";
import type { Interface } from "@lit/reactive-element/decorators/base.js";

import type { FetcherType, SWRConfig } from "../config.js";
import { type SWRResult, createSWR } from "../swr.js";

type SWRGetter<T> = () => SWRResult<T>;

interface SWRDecorator {
  (proto: Interface<ReactiveElement>, name: PropertyKey, descriptor?: PropertyDescriptor): any;
  <C extends Interface<ReactiveElement>, T>(
    value: ClassAccessorDecoratorTarget<C, SWRGetter<T>>,
    context: ClassAccessorDecoratorContext<C, SWRGetter<T>>,
  ): ClassAccessorDecoratorResult<C, SWRGetter<T>>;
}

export const SWR = <K, V>(
  key: K,
  fetcher?: FetcherType<K, V>,
  config?: Partial<SWRConfig>,
): SWRDecorator => {
  return <C extends Interface<ReactiveElement>>(
    arg0: C | ClassAccessorDecoratorTarget<C, SWRGetter<V>>,
    arg1: PropertyKey | ClassAccessorDecoratorContext<C, SWRGetter<V>>,
  ) => {
    const keySymbol = Symbol();
    const descriptor = {
      get(this: Record<PropertyKey, unknown>) {
        let result = this[keySymbol] as SWRGetter<V> | undefined;
        if (!result) {
          result = createSWR(this as unknown as ReactiveElement, key, fetcher, config);
          this[keySymbol] = result;
        }
        return result;
      },
    };
    if (typeof arg1 === "string" || typeof arg1 === "symbol") {
      return Object.defineProperty(arg0, arg1, descriptor);
    }
    return descriptor;
  };
};
