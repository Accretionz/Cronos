import { describe, expect, it } from "vitest";
import type { Transaction } from "./model";
import {
  DEFAULT_FILTER,
  amountMatches,
  filterTxns,
  highlightRanges,
  isFiltering,
  periodRange,
  searchTerms,
  sortTxns,
  summarizeResults,
  type TxnFilter,
} from "./search";

let n = 0;
const tx = (title: string, category: string, amountCents: number, day: string, kind: "expense" | "income" = "expense") =>
  ({ id: `t${++n}`, type: "transaction", title, status: "open", tags: [], scheduledFor: day, createdAt: `2026-01-01T00:00:0${n % 10}.000Z`, updatedAt: "", data: { category, amountCents, kind } }) as Transaction;

const DATA = [
  tx("Whole Foods", "Groceries", 8450, "2026-10-03"),
  tx("Café Luna", "Dining", 1250, "2026-10-05"),
  tx("Uber", "Transport", 1999, "2026-10-05"),
  tx("Paycheck", "Salary", 250000, "2026-10-15", "income"),
  tx("Whole Foods", "Groceries", 6210, "2026-09-20"),
  tx("Rent", "Housing", 180000, "2026-08-01"),
  tx("Coffee beans", "Groceries", 1200, "2025-12-30"),
];
const f = (patch: Partial<TxnFilter>): TxnFilter => ({ ...DEFAULT_FILTER, ...patch });
const titles = (list: Transaction[]) => list.map((t) => t.title);

describe("budget search", () => {
  it("knows when anything is filtered", () => {
    expect(isFiltering(DEFAULT_FILTER)).toBe(false);
    expect(isFiltering(f({ sort: "largest" }))).toBe(false); // sorting alone isn't filtering
    expect(isFiltering(f({ query: "  " }))).toBe(false);
    expect(isFiltering(f({ query: "uber" }))).toBe(true);
    expect(isFiltering(f({ categories: ["Dining"] }))).toBe(true);
    expect(isFiltering(f({ period: "all" }))).toBe(true);
  });

  it("works out each period from the month on screen", () => {
    expect(periodRange(f({}), "2026-10")).toEqual({ first: "2026-10-01", last: "2026-10-31" });
    expect(periodRange(f({ period: "3months" }), "2026-01")).toEqual({ first: "2025-11-01", last: "2026-01-31" });
    expect(periodRange(f({ period: "year" }), "2026-10")).toEqual({ first: "2026-01-01", last: "2026-12-31" });
    expect(periodRange(f({ period: "all" }), "2026-10")).toEqual({ first: null, last: null });
    expect(periodRange(f({ period: "custom", from: "2026-10-09", to: "2026-10-02" }), "x")).toEqual({ first: "2026-10-02", last: "2026-10-09" });
    expect(periodRange(f({ period: "custom", from: "2026-10-02" }), "x")).toEqual({ first: "2026-10-02", last: null });
  });

  it("searches descriptions and categories, ignoring case and accents; every word must match", () => {
    expect(titles(filterTxns(DATA, f({ query: "cafe" }), "2026-10"))).toEqual(["Café Luna"]);
    expect(titles(filterTxns(DATA, f({ query: "GROC", period: "all" }), "2026-10"))).toEqual(["Whole Foods", "Whole Foods", "Coffee beans"]);
    expect(titles(filterTxns(DATA, f({ query: "whole groceries", period: "all" }), "2026-10"))).toEqual(["Whole Foods", "Whole Foods"]);
    expect(titles(filterTxns(DATA, f({ query: "whole dining" }), "2026-10"))).toEqual([]);
    expect(searchTerms(`"whole foods"  uber`)).toEqual(["whole foods", "uber"]);
  });

  it("finds amounts the way people type them", () => {
    expect([amountMatches("12", 1250), amountMatches("12", 1299), amountMatches("12", 12000), amountMatches("12", 1200)]).toEqual([true, true, false, true]);
    expect([amountMatches("12.5", 1250), amountMatches("12.5", 1259), amountMatches("12.50", 1259), amountMatches("$1,800", 180000)]).toEqual([true, true, false, true]);
    expect(amountMatches("abc", 100)).toBe(false);
    expect(titles(filterTxns(DATA, f({ query: "19.99" }), "2026-10"))).toEqual(["Uber"]);
  });

  it("filters by type, categories and amount range", () => {
    const all = f({ period: "all" });
    expect(titles(filterTxns(DATA, { ...all, kind: "income" }, "2026-10"))).toEqual(["Paycheck"]);
    expect(titles(filterTxns(DATA, { ...all, categories: ["Dining", "Transport"] }, "2026-10"))).toEqual(["Café Luna", "Uber"]);
    expect(titles(filterTxns(DATA, { ...all, minCents: 2000, maxCents: 10000 }, "2026-10"))).toEqual(["Whole Foods", "Whole Foods"]);
    expect(titles(filterTxns(DATA, { ...all, minCents: 1250, maxCents: 1250 }, "2026-10"))).toEqual(["Café Luna"]); // bounds included
    expect(titles(filterTxns(DATA, f({ period: "year" }), "2026-10")).length).toBe(6);
  });

  it("sorts by date or amount", () => {
    const list = filterTxns(DATA, f({ period: "all", kind: "expense" }), "2026-10");
    expect(titles(sortTxns(list, "largest")).slice(0, 2)).toEqual(["Rent", "Whole Foods"]);
    expect(titles(sortTxns(list, "smallest"))[0]).toBe("Coffee beans");
    expect(titles(sortTxns(list, "oldest"))[0]).toBe("Coffee beans");
    expect(titles(sortTxns(list, "newest"))[0]).toBe("Uber"); // same day as Café Luna, created later
  });

  it("adds up the results by category and month", () => {
    const s = summarizeResults(filterTxns(DATA, f({ period: "all" }), "2026-10"));
    expect([s.count, s.expenseCount, s.incomeCount]).toEqual([7, 6, 1]);
    expect([s.expenseCents, s.incomeCents]).toEqual([199109, 250000]);
    expect(s.averageExpenseCents).toBe(Math.round(199109 / 6));
    expect(s.largest!.title).toBe("Paycheck");
    expect(s.categories.map((c) => `${c.kind}:${c.category}:${c.count}`)).toEqual([
      "expense:Housing:1",
      "expense:Groceries:3",
      "expense:Transport:1",
      "expense:Dining:1",
      "income:Salary:1",
    ]);
    expect(Math.round(s.categories[1].share * 1000)).toBe(Math.round(((8450 + 6210 + 1200) / 199109) * 1000));
    // Dec 2025 to Oct 2026, with the empty months in between.
    expect(s.months.length).toBe(11);
    expect(s.months[0]).toEqual({ month: "2025-12", expenseCents: 1200, incomeCents: 0 });
    expect(s.months[1]).toEqual({ month: "2026-01", expenseCents: 0, incomeCents: 0 });
    expect(s.months[10]).toEqual({ month: "2026-10", expenseCents: 11699, incomeCents: 250000 });
    expect(summarizeResults([]).months).toEqual([]);
  });

  it("marks where search words appear", () => {
    expect(highlightRanges("Whole Foods", "foods")).toEqual([[6, 11]]);
    expect(highlightRanges("Café Luna", "cafe lu")).toEqual([[0, 4], [5, 7]]);
    expect(highlightRanges("Banana", "an")).toEqual([[1, 5]]); // overlapping hits merge
    expect(highlightRanges("Uber 12", "12")).toEqual([]); // amounts aren't highlighted in text
  });
});
