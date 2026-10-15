import { dayKey, dayOf, type Item } from "../../core";

export const TXN = "transaction";
export const LIMIT = "budget-limit";

export type TxnKind = "expense" | "income";

export type TxnData = {
  /** Always positive. Money is stored in cents to avoid floating-point rounding errors. */
  amountCents: number;
  kind: TxnKind;
  category: string;
};

/** A monthly spending limit for one category. Applies to every month until changed. */
export type LimitData = {
  category: string;
  limitCents: number;
};

export type Transaction = Item<TxnData>;
export type BudgetLimit = Item<LimitData>;

export const EXPENSE_CATEGORIES = [
  "Housing",
  "Groceries",
  "Dining",
  "Transport",
  "Utilities",
  "Health",
  "Shopping",
  "Entertainment",
  "Subscriptions",
  "Other",
];
export const INCOME_CATEGORIES = ["Salary", "Freelance", "Gifts", "Other income"];

// Budget events, added to the app's event list without touching the core.
declare module "../../core/bus" {
  interface EventMap {
    /** A new expense pushed a category past its monthly limit. */
    "budget.overspent": { category: string; month: string; spentCents: number; limitCents: number };
  }
}

/* ---------- Money ---------- */

const CURRENCY = "USD";
const money = new Intl.NumberFormat(undefined, { style: "currency", currency: CURRENCY });

export function formatMoney(cents: number): string {
  return money.format(cents / 100);
}

/** "12.5" → 1250. Returns null for empty, invalid, zero or negative input. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned || cleaned.split(".").length > 2) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}

/* ---------- Months ("YYYY-MM") ---------- */

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

export function currentMonth(): string {
  return monthOf(dayKey());
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  return dayKey(new Date(y, m - 1 + delta, 1)).slice(0, 7);
}

/** First and last day of a month. */
export function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split("-").map(Number);
  return { first: dayKey(new Date(y, m - 1, 1)), last: dayKey(new Date(y, m, 0)) };
}

/** Today if it's in this month, otherwise the 1st: a sensible default date for new entries. */
export function defaultDayFor(month: string): string {
  const today = dayKey();
  return today.startsWith(month) ? today : `${month}-01`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/* ---------- Totals ---------- */

export interface CategoryTotal {
  category: string;
  spentCents: number;
  limitCents?: number;
}

export interface MonthSummary {
  incomeCents: number;
  expenseCents: number;
  /** Sum of all category limits, or 0 if none are set. */
  budgetCents: number;
  /** Expenses in categories that have a limit (what counts against the budget). */
  budgetedSpentCents: number;
  categories: CategoryTotal[];
}

export function summarize(txns: Transaction[], limits: BudgetLimit[]): MonthSummary {
  let incomeCents = 0;
  let expenseCents = 0;
  const spent = new Map<string, number>();
  for (const t of txns) {
    if (t.data.kind === "income") incomeCents += t.data.amountCents;
    else {
      expenseCents += t.data.amountCents;
      spent.set(t.data.category, (spent.get(t.data.category) ?? 0) + t.data.amountCents);
    }
  }
  const limitBy = new Map(limits.map((l) => [l.data.category, l.data.limitCents]));
  const names = new Set([...limitBy.keys(), ...spent.keys()]);
  const categories = [...names]
    .map((category) => ({ category, spentCents: spent.get(category) ?? 0, limitCents: limitBy.get(category) }))
    // Budgeted categories first (most used share first), then unbudgeted by amount.
    .sort((a, b) => {
      if ((a.limitCents === undefined) !== (b.limitCents === undefined)) return a.limitCents === undefined ? 1 : -1;
      const share = (c: CategoryTotal) => (c.limitCents ? c.spentCents / c.limitCents : c.spentCents);
      return share(b) - share(a) || a.category.localeCompare(b.category);
    });

  const budgetCents = [...limitBy.values()].reduce((a, b) => a + b, 0);
  const budgetedSpentCents = categories.reduce((a, c) => a + (c.limitCents !== undefined ? c.spentCents : 0), 0);
  return { incomeCents, expenseCents, budgetCents, budgetedSpentCents, categories };
}

/** Expenses in one category during one month. */
export function categorySpend(txns: Transaction[], category: string, month: string): number {
  return txns
    .filter((t) => t.data.kind === "expense" && t.data.category === category && t.scheduledFor && monthOf(dayOf(t.scheduledFor)) === month)
    .reduce((sum, t) => sum + t.data.amountCents, 0);
}

/* ---------- Spending pie ---------- */

/** A pie stays readable up to about 6 slices; past that, the smallest fold into one gray slice. */
export const MAX_PIE_SLICES = 6;

export interface PieSlice {
  /** Category name, or a "N more categories" label for the folded slice. */
  label: string;
  cents: number;
  /** 0–1 share of all spending. */
  share: number;
  /** True for the folded "N more categories" slice (drawn gray). */
  folded: boolean;
  /** For the folded slice: which categories it contains. */
  members?: string[];
}

/** Default categories first in their usual order, then custom ones alphabetically. */
function categoryRank(name: string): number {
  const i = EXPENSE_CATEGORIES.indexOf(name);
  return i >= 0 ? i : EXPENSE_CATEGORIES.length;
}

/**
 * Slices for the spending pie. The largest categories get their own slice; the rest
 * fold into one. Slices keep a fixed category order (not size), so the pie looks the
 * same from month to month and, with default colors, neighbouring slices are color
 * pairs checked for color-blind separation.
 */
export function spendingSlices(categories: CategoryTotal[], maxSlices = MAX_PIE_SLICES): PieSlice[] {
  const spent = categories.filter((c) => c.spentCents > 0).sort((a, b) => b.spentCents - a.spentCents);
  const total = spent.reduce((sum, c) => sum + c.spentCents, 0);
  if (total === 0) return [];

  const fold = spent.length > maxSlices;
  const own = fold ? spent.slice(0, maxSlices - 1) : spent;
  const rest = fold ? spent.slice(maxSlices - 1) : [];

  const slices: PieSlice[] = [...own]
    .sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.category.localeCompare(b.category))
    .map((c) => ({ label: c.category, cents: c.spentCents, share: c.spentCents / total, folded: false }));

  if (rest.length) {
    const cents = rest.reduce((sum, c) => sum + c.spentCents, 0);
    slices.push({
      label: `${rest.length} more categories`,
      cents,
      share: cents / total,
      folded: true,
      members: rest.map((c) => c.category),
    });
  }
  return slices;
}

/** "42%", or "<1%" for tiny shares so nothing reads as zero. */
export function formatShare(share: number): string {
  if (share > 0 && share < 0.005) return "<1%";
  return `${Math.round(share * 100)}%`;
}
