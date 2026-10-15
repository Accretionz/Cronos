import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { Core } from "./app";
import type { EventHandler, EventName } from "./bus";
import type { ItemQuery } from "./store";

export const CoreContext = createContext<Core | null>(null);

export function useCore(): Core {
  const core = useContext(CoreContext);
  if (!core) throw new Error("useCore must be used inside <CoreContext.Provider>");
  return core;
}

/** Live list of items matching a query. Re-renders whenever the store changes. */
export function useItems(query: ItemQuery = {}) {
  const { store } = useCore();
  const version = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.version,
  );
  // The query object is usually recreated every render, so compare it by value.
  const key = JSON.stringify(query);
  return useMemo(() => store.query(query), [store, version, key]);
}

/** Enabled modules, live. */
export function useModules() {
  const { registry } = useCore();
  return useSyncExternalStore(
    (cb) => registry.subscribe(cb),
    () => registry.enabled(),
  );
}

/** Run a handler while the component is on screen. */
export function useBusEvent<K extends EventName>(name: K, handler: EventHandler<K>) {
  const { bus } = useCore();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => bus.on(name, (p) => ref.current(p)), [bus, name]);
}
