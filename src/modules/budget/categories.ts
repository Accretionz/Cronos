import type { ItemStore } from "../../core";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type TxnKind } from "./model";
import { useBudgetSettings, writeSettings } from "./settings";

/**
 * Category order and the default category for new transactions, per kind (expense / income).
 * Both are the user's choices from Settings → Budget, saved in the budget settings item.
 */

/** The built-in categories in their usual order. */
export const builtInCategories = (kind: TxnKind) => (kind === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES);

/** What a new transaction starts with when the user hasn't picked a default. */
export const BUILT_IN_DEFAULT: Record<TxnKind, string> = { expense: "Groceries", income: "Salary" };

/** The usual order: built-in categories first, then custom ones alphabetically. */
export function naturalOrder(kind: TxnKind, names: Iterable<string>): string[] {
  const builtIn = builtInCategories(kind);
  const set = new Set(names);
  const rest = [...set].filter((n) => !builtIn.includes(n)).sort((a, b) => a.localeCompare(b));
  return [...builtIn.filter((n) => set.has(n)), ...rest];
}

/**
 * `available` (already in the usual order) arranged in the user's saved order. Saved names that
 * no longer exist are skipped; categories the user hasn't placed yet (e.g. a new custom one) keep
 * their usual spot relative to their neighbours, so a new category doesn't jump to the top.
 */
export function orderCategories(available: string[], saved: string[] | undefined): string[] {
  if (!saved?.length) return available;
  const here = new Set(available);
  const placed = saved.filter((n, i) => here.has(n) && saved.indexOf(n) === i);
  const placedSet = new Set(placed);
  const result = [...placed];
  // Put each unplaced category right after the nearest category before it in the usual order.
  available.forEach((name, i) => {
    if (placedSet.has(name)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = result.indexOf(available[j]);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    result.splice(at, 0, name);
    placedSet.add(name);
  });
  return result;
}

/** Move one entry of a list to a new position. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
  return next;
}

/** The default category for a kind: the saved one if it's still offered, otherwise the built-in one. */
export function pickDefault(kind: TxnKind, options: string[], saved: string | undefined): string {
  if (saved && options.includes(saved)) return saved;
  if (options.includes(BUILT_IN_DEFAULT[kind])) return BUILT_IN_DEFAULT[kind];
  return options[0] ?? BUILT_IN_DEFAULT[kind];
}

/** The user's saved order and default, live. */
export function useCategoryPrefs() {
  const s = useBudgetSettings();
  return {
    order: (kind: TxnKind) => s.categoryOrder[kind],
    savedDefault: (kind: TxnKind) => s.defaultCategory[kind],
    isCustomOrder: (kind: TxnKind) => Boolean(s.categoryOrder[kind]?.length),
  };
}

/** Save the order of a kind's categories; null goes back to the usual order. */
export function setCategoryOrder(store: ItemStore, kind: TxnKind, order: string[] | null) {
  return writeSettings(store, (s) => {
    if (order === null) delete s.categoryOrder[kind];
    else s.categoryOrder[kind] = order;
    return s;
  });
}

/** Save the default category for new transactions of a kind; null goes back to the built-in one. */
export function setDefaultCategory(store: ItemStore, kind: TxnKind, category: string | null) {
  return writeSettings(store, (s) => {
    if (category === null || category === BUILT_IN_DEFAULT[kind]) delete s.defaultCategory[kind];
    else s.defaultCategory[kind] = category;
    return s;
  });
}
