import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { AccountInfo, AccountService } from "./account";
import type { Core } from "./app";
import type { EventHandler, EventName } from "./bus";
import { todayKey } from "./date";
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

/**
 * Today's date ("YYYY-MM-DD"), live. Re-renders when the day changes (midnight, or
 * coming back to the app the next morning). Use this instead of todayKey() in
 * components, or screens left open overnight keep showing yesterday.
 */
export function useToday(): string {
  const { bus } = useCore();
  return useSyncExternalStore((cb) => bus.on("day.started", cb), todayKey);
}

/**
 * The account service. Provided separately from the core, because the sign-in screen needs
 * it before there's any data (main.tsx).
 */
export const AccountContext = createContext<AccountService | null>(null);

export function useAccount(): AccountService {
  const account = useContext(AccountContext);
  if (!account) throw new Error("useAccount must be used inside <AccountContext.Provider>");
  return account;
}

/** Who's signed in and the account's settings, live. */
export function useAccountInfo(): AccountInfo {
  const account = useAccount();
  return useSyncExternalStore(
    (cb) => account.subscribe(cb),
    () => account.getInfo(),
  );
}
