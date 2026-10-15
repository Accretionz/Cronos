import { dayOf, type AppModule, type Item } from "../../core";
import { BudgetPage } from "./BudgetPage";
import { BudgetSettings } from "./BudgetSettings";
import { BUDGET_SETTINGS, assignMissingColors } from "./colors";
import { BudgetWidget } from "./BudgetWidget";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  LIMIT,
  TXN,
  categorySpend,
  monthOf,
  type BudgetLimit,
  type Transaction,
} from "./model";

export const budgetModule: AppModule = {
  id: "budget",
  name: "Budget",
  icon: "$",
  description: "Track income and spending, with monthly limits per category.",
  itemTypes: [TXN, LIMIT, BUDGET_SETTINGS],
  page: BudgetPage,
  settings: BudgetSettings,
  widgets: [{ id: "budget", title: "Budget this month", component: BudgetWidget, order: 20 }],

  init({ bus, store }) {
    // Announce when an expense (new or edited) tips a category over its limit.
    // Nothing listens yet; a future challenges/XP module can.
    const contribution = (t: Transaction, category: string, month: string) =>
      t.data.kind === "expense" && t.data.category === category && t.scheduledFor && monthOf(dayOf(t.scheduledFor)) === month
        ? t.data.amountCents
        : 0;

    const check = (item: Item, previous?: Item) => {
      if (item.type !== TXN || !item.scheduledFor) return;
      const txn = item as Transaction;
      if (txn.data.kind !== "expense") return;

      const limit = (store.query({ type: LIMIT }) as BudgetLimit[]).find((l) => l.data.category === txn.data.category);
      if (!limit) return;

      const month = monthOf(dayOf(txn.scheduledFor!));
      const after = categorySpend(store.query({ type: TXN }) as Transaction[], txn.data.category, month);
      const before =
        after - contribution(txn, txn.data.category, month) + (previous ? contribution(previous as Transaction, txn.data.category, month) : 0);
      if (before <= limit.data.limitCents && after > limit.data.limitCents) {
        bus.emit("budget.overspent", { category: txn.data.category, month, spentCents: after, limitCents: limit.data.limitCents });
      }
    };

    // Make sure every category in use has a color of its own.
    const assignColors = () => {
      const txns = store.query({ type: TXN }) as Transaction[];
      const limits = store.query({ type: LIMIT }) as BudgetLimit[];
      const expense = new Set([...EXPENSE_CATEGORIES, ...limits.map((l) => l.data.category)]);
      const income = new Set(INCOME_CATEGORIES);
      for (const t of txns) (t.data.kind === "income" ? income : expense).add(t.data.category);
      return assignMissingColors(store, [[...expense], [...income]]);
    };
    void assignColors();
    const onChange = (item: Item) => {
      if (item.type === TXN || item.type === LIMIT) void assignColors();
    };

    const offCreated = bus.on("item.created", ({ item }) => {
      check(item);
      onChange(item);
    });
    const offUpdated = bus.on("item.updated", ({ item, previous }) => {
      check(item, previous);
      onChange(item);
    });
    return () => {
      offCreated();
      offUpdated();
    };
  },
};
