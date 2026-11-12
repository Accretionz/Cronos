import { dayOf } from "../../core";
import { monthBounds, monthOf, shiftMonth, type Transaction, type TxnKind } from "./model";

/**
 * Search and filters for the transaction list. Pure functions (no React), so they're easy
 * to test and reuse (e.g. a future "Insights" page or the phone app).
 */

export type PeriodKind = "month" | "3months" | "year" | "all" | "custom";
export type SortKind = "newest" | "oldest" | "largest" | "smallest";

export interface TxnFilter {
  /** Free text: every word must match the description, category or amount. */
  query: string;
  period: PeriodKind;
  /** For "custom": first and last day ("YYYY-MM-DD"); either may be empty. */
  from: string;
  to: string;
  kind: "all" | TxnKind;
  /** Empty = every category. */
  categories: string[];
  /** Amount range in cents (inclusive); null = no bound. */
  minCents: number | null;
  maxCents: number | null;
  sort: SortKind;
}

export const DEFAULT_FILTER: TxnFilter = {
  query: "",
  period: "month",
  from: "",
  to: "",
  kind: "all",
  categories: [],
  minCents: null,
  maxCents: null,
  sort: "newest",
};

/** True when anything differs from the plain "this month, newest first" view. */
export function isFiltering(f: TxnFilter): boolean {
  return (
    f.query.trim() !== "" ||
    f.period !== "month" ||
    f.kind !== "all" ||
    f.categories.length > 0 ||
    f.minCents !== null ||
    f.maxCents !== null
  );
}

/** First and last day covered by the period (null = open-ended), given the month on screen. */
export function periodRange(f: Pick<TxnFilter, "period" | "from" | "to">, month: string): { first: string | null; last: string | null } {
  switch (f.period) {
    case "month":
      return monthBounds(month);
    case "3months":
      return { first: monthBounds(shiftMonth(month, -2)).first, last: monthBounds(month).last };
    case "year": {
      const y = month.slice(0, 4);
      return { first: `${y}-01-01`, last: `${y}-12-31` };
    }
    case "all":
      return { first: null, last: null };
    case "custom": {
      let first = f.from || null;
      let last = f.to || null;
      if (first && last && first > last) [first, last] = [last, first];
      return { first, last };
    }
  }
}

/** Lowercase without accents, so "cafe" finds "Café". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Split a search into words; quoted phrases stay together ("whole foods"). */
export function searchTerms(query: string): string[] {
  const terms: string[] = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query))) {
    const t = fold((m[1] ?? m[2]).trim());
    if (t) terms.push(t);
  }
  return terms;
}

/**
 * Does a typed number match an amount? "12" matches $12.00–$12.99, "12.5" matches
 * $12.50–$12.59, "12.50" only $12.50. "$" and "," are ignored.
 */
export function amountMatches(term: string, cents: number): boolean {
  const t = term.replace(/[$,]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return false;
  const shown = (cents / 100).toFixed(2);
  if (t.endsWith(".")) return shown.startsWith(t);
  return shown === t || shown.startsWith(t.includes(".") ? t : `${t}.`);
}

function matchesTerm(t: Transaction, term: string): boolean {
  return fold(t.title).includes(term) || fold(t.data.category).includes(term) || amountMatches(term, t.data.amountCents);
}

/** Every transaction that passes the filter (period, type, categories, amount, search). Order is kept. */
export function filterTxns(txns: Transaction[], f: TxnFilter, month: string): Transaction[] {
  const { first, last } = periodRange(f, month);
  const terms = searchTerms(f.query);
  const cats = f.categories.length ? new Set(f.categories) : null;
  return txns.filter((t) => {
    if (!t.scheduledFor) return false;
    const day = dayOf(t.scheduledFor);
    if (first && day < first) return false;
    if (last && day > last) return false;
    if (f.kind !== "all" && t.data.kind !== f.kind) return false;
    if (cats && !cats.has(t.data.category)) return false;
    if (f.minCents !== null && t.data.amountCents < f.minCents) return false;
    if (f.maxCents !== null && t.data.amountCents > f.maxCents) return false;
    return terms.every((term) => matchesTerm(t, term));
  });
}

export function sortTxns(txns: Transaction[], sort: SortKind): Transaction[] {
  const day = (t: Transaction) => dayOf(t.scheduledFor ?? "");
  const byDate = (a: Transaction, b: Transaction) =>
    day(a) < day(b) ? -1 : day(a) > day(b) ? 1 : a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1;
  const list = [...txns];
  switch (sort) {
    case "newest":
      return list.sort((a, b) => byDate(b, a));
    case "oldest":
      return list.sort(byDate);
    case "largest":
      return list.sort((a, b) => b.data.amountCents - a.data.amountCents || byDate(b, a));
    case "smallest":
      return list.sort((a, b) => a.data.amountCents - b.data.amountCents || byDate(b, a));
  }
}

/* ---------- What the results add up to ---------- */

export interface ResultCategory {
  category: string;
  kind: TxnKind;
  cents: number;
  count: number;
  /** Share of this kind's total (0–1). */
  share: number;
}

export interface ResultMonth {
  month: string;
  expenseCents: number;
  incomeCents: number;
}

export interface ResultSummary {
  count: number;
  expenseCount: number;
  incomeCount: number;
  expenseCents: number;
  incomeCents: number;
  /** Average expense, rounded to the cent (0 when none). */
  averageExpenseCents: number;
  largest: Transaction | null;
  /** Biggest first, per kind (expenses before income). */
  categories: ResultCategory[];
  /** Every month in the results' date span, oldest first (including empty months between). */
  months: ResultMonth[];
}

export function summarizeResults(txns: Transaction[]): ResultSummary {
  let expenseCents = 0;
  let incomeCents = 0;
  let expenseCount = 0;
  let largest: Transaction | null = null;
  const cats = new Map<string, ResultCategory>();
  const months = new Map<string, ResultMonth>();
  for (const t of txns) {
    const { kind, amountCents, category } = t.data;
    if (kind === "expense") {
      expenseCents += amountCents;
      expenseCount++;
    } else incomeCents += amountCents;
    if (!largest || amountCents > largest.data.amountCents) largest = t;
    const key = `${kind}|${category}`;
    const c = cats.get(key) ?? { category, kind, cents: 0, count: 0, share: 0 };
    c.cents += amountCents;
    c.count++;
    cats.set(key, c);
    if (t.scheduledFor) {
      const m = monthOf(dayOf(t.scheduledFor));
      const row = months.get(m) ?? { month: m, expenseCents: 0, incomeCents: 0 };
      if (kind === "expense") row.expenseCents += amountCents;
      else row.incomeCents += amountCents;
      months.set(m, row);
    }
  }
  const categories = [...cats.values()]
    .map((c) => ({ ...c, share: (c.kind === "expense" ? expenseCents : incomeCents) ? c.cents / (c.kind === "expense" ? expenseCents : incomeCents) : 0 }))
    .sort((a, b) => (a.kind !== b.kind ? (a.kind === "expense" ? -1 : 1) : b.cents - a.cents || a.category.localeCompare(b.category)));

  // Fill the gaps so a quiet month shows as an empty bar, not a missing one.
  const keys = [...months.keys()].sort();
  const span: ResultMonth[] = [];
  if (keys.length) {
    for (let m = keys[0]; m <= keys[keys.length - 1]; m = shiftMonth(m, 1)) span.push(months.get(m) ?? { month: m, expenseCents: 0, incomeCents: 0 });
  }
  return {
    count: txns.length,
    expenseCount,
    incomeCount: txns.length - expenseCount,
    expenseCents,
    incomeCents,
    averageExpenseCents: expenseCount ? Math.round(expenseCents / expenseCount) : 0,
    largest,
    categories,
    months: span,
  };
}

/** Where a search term appears in a description, for highlighting: [start, end) ranges, merged. */
export function highlightRanges(text: string, query: string): [number, number][] {
  const terms = searchTerms(query).filter((t) => !/^[$\d.,]+$/.test(t));
  if (!terms.length) return [];
  // Folding can change length (e.g. "é" → "e" + accent removed), so fold per character.
  const chars = [...text];
  const folded = chars.map((c) => fold(c));
  const flat = folded.join("");
  const starts: number[] = [];
  let pos = 0;
  folded.forEach((f) => {
    starts.push(pos);
    pos += f.length;
  });
  const toChar = (flatIndex: number) => {
    let i = starts.findIndex((s) => s >= flatIndex);
    if (i === -1) i = chars.length;
    return i;
  };
  const ranges: [number, number][] = [];
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const at = flat.indexOf(term, from);
      if (at < 0) break;
      ranges.push([toChar(at), toChar(at + term.length)]);
      from = at + term.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const lastR = merged[merged.length - 1];
    if (lastR && r[0] <= lastR[1]) lastR[1] = Math.max(lastR[1], r[1]);
    else merged.push([...r]);
  }
  // Convert char indexes to string (UTF-16) indexes.
  const offset = (ci: number) => chars.slice(0, ci).join("").length;
  return merged.map(([a, b]) => [offset(a), offset(b)]);
}
