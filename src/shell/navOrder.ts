import { useMemo } from "react";
import { useCore, useItems, type Item, type ItemStore } from "../core";

/**
 * The sidebar order, as a list of ids (module ids; Today is always first). Saved in the
 * signed-in account as one `nav-order` item, so it's the same on every device. Items not in
 * the saved list (e.g. a newly installed module) keep their default place at the end.
 */
export const NAV_ORDER = "nav-order";
const ITEM_ID = "nav-order";
/** Where earlier versions kept the order (in the browser). */
const OLD_KEY = "cronos.navOrder";

const idsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** The saved order, live. */
export function useNavOrder(): string[] {
  const [item] = useItems({ type: NAV_ORDER });
  return useMemo(() => idsOf(item?.data.order), [item]);
}

/** Save a new order (or [] for the default) to the account. */
export function saveNavOrder(store: ItemStore, ids: string[]): Promise<void> {
  const now = new Date().toISOString();
  const existing = store.get(ITEM_ID);
  const item: Item = {
    id: ITEM_ID,
    type: NAV_ORDER,
    title: "Sidebar order",
    status: "open",
    tags: [],
    data: { order: [...ids] },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  // A preference, not something the user "did": no item.* events.
  return store.putQuietly(item).catch(() => {
    /* already shown ("Couldn't save your change") and undone */
  });
}

/** Save or reset the order from a component. */
export function useNavOrderActions() {
  const { store } = useCore();
  return useMemo(
    () => ({
      setNavOrder: (ids: string[]) => void saveNavOrder(store, ids),
      resetNavOrder: () => void saveNavOrder(store, []),
    }),
    [store],
  );
}

/**
 * Earlier versions saved the order in the browser. The first time an account opens here
 * without one, keep the order this device had; then forget the browser copy.
 */
export async function adoptBrowserNavOrder(store: ItemStore): Promise<void> {
  let old: string[] = [];
  try {
    old = idsOf(JSON.parse(localStorage.getItem(OLD_KEY) ?? "[]"));
    localStorage.removeItem(OLD_KEY);
  } catch {
    return;
  }
  if (old.length && !store.get(ITEM_ID)) await saveNavOrder(store, old);
}

/** Sort items by the saved order; unknown items go after, in their default order. */
export function applyOrder<T extends { id: string }>(items: T[], order: string[]): T[] {
  const pos = new Map(order.map((id, i) => [id, i]));
  return items
    .map((item, i) => ({ item, key: pos.get(item.id) ?? order.length + i }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item);
}

/** Move one id to a new index. */
export function moveId(ids: string[], id: string, toIndex: number): string[] {
  const rest = ids.filter((x) => x !== id);
  const clamped = Math.max(0, Math.min(toIndex, rest.length));
  return [...rest.slice(0, clamped), id, ...rest.slice(clamped)];
}
