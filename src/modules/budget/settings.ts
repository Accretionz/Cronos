import { useItems, type ItemStore } from "../../core";
import type { TxnKind } from "./model";

/**
 * The Budget module's saved choices: one `budget-settings` item, stored with the rest of the
 * account's data (so it follows the user across devices and is in backups).
 */
export const BUDGET_SETTINGS = "budget-settings";

export type BudgetSettingsData = {
  /** Colors the user picked. */
  categoryColors: Record<string, string>;
  /** Colors handed out automatically to new custom categories (not "customized"). */
  autoColors: Record<string, string>;
  /** The user's order for each kind's category lists. Categories not in it follow, in the usual order. */
  categoryOrder: Partial<Record<TxnKind, string[]>>;
  /** The category a new transaction starts with, per kind. */
  defaultCategory: Partial<Record<TxnKind, string>>;
};

const stringList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined);

/** Fill in anything missing (older settings items only have colors). */
export function readSettings(data: unknown): BudgetSettingsData {
  const d = (data ?? {}) as Partial<BudgetSettingsData>;
  const order = d.categoryOrder ?? {};
  const def = d.defaultCategory ?? {};
  return {
    categoryColors: d.categoryColors ?? {},
    autoColors: d.autoColors ?? {},
    categoryOrder: {
      ...(stringList(order.expense) ? { expense: stringList(order.expense) } : {}),
      ...(stringList(order.income) ? { income: stringList(order.income) } : {}),
    },
    defaultCategory: {
      ...(typeof def.expense === "string" ? { expense: def.expense } : {}),
      ...(typeof def.income === "string" ? { income: def.income } : {}),
    },
  };
}

/** The saved settings, live. */
export function useBudgetSettings(): BudgetSettingsData {
  const [settings] = useItems({ type: BUDGET_SETTINGS });
  return readSettings(settings?.data);
}

// Writes go one at a time so two quick changes can't create two settings items.
let queue: Promise<unknown> = Promise.resolve();

export function writeSettings(store: ItemStore, update: (s: BudgetSettingsData) => BudgetSettingsData) {
  const job = queue.then(async () => {
    const [existing] = store.query({ type: BUDGET_SETTINGS });
    const current = readSettings(existing?.data);
    const next = update(structuredClone(current));
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    if (existing) await store.update(existing.id, { data: { ...existing.data, ...next } });
    else await store.create<BudgetSettingsData>({ type: BUDGET_SETTINGS, title: "Budget settings", data: next });
  });
  queue = job.catch((err) => console.error("[budget] saving settings failed", err));
  return job;
}
