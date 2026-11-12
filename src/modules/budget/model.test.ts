import { describe, expect, it } from "vitest";
import { cssColor, DEFAULT_COLORS, defaultColorFor, isValidColor } from "./colors";
import { formatMoney, formatShare, monthBounds, parseMoney, shiftMonth, spendingSlices, summarize, type BudgetLimit, type CategoryTotal, type Transaction } from "./model";

const t = (category: string, amountCents: number, kind: "expense" | "income" = "expense") => ({ data: { category, amountCents, kind } }) as Transaction;
const l = (category: string, limitCents: number) => ({ data: { category, limitCents } }) as BudgetLimit;
const c = (category: string, spentCents: number): CategoryTotal => ({ category, spentCents });

describe("money", () => {
  it("parses amounts into cents", () => {
    expect([parseMoney("12.5"), parseMoney("$1,234.56"), parseMoney("0.1")]).toEqual([1250, 123456, 10]);
    expect([parseMoney("0"), parseMoney("abc"), parseMoney("1.2.3"), parseMoney("")]).toEqual([null, null, null, null]);
  });
  it("formats cents", () => {
    expect(formatMoney(123456)).toBe("$1,234.56");
  });
});

describe("months", () => {
  it("shifts across years and knows month lengths", () => {
    expect([shiftMonth("2026-01", -1), shiftMonth("2026-12", 1)]).toEqual(["2025-12", "2027-01"]);
    expect(monthBounds("2028-02")).toEqual({ first: "2028-02-01", last: "2028-02-29" });
  });
});

describe("summarize", () => {
  it("totals income, spending and budgets", () => {
    const s = summarize([t("Dining", 3000), t("Dining", 4000), t("Rent", 100000), t("Salary", 500000, "income")], [l("Dining", 5000), l("Groceries", 40000)]);
    expect([s.incomeCents, s.expenseCents, s.budgetCents, s.budgetedSpentCents]).toEqual([500000, 107000, 45000, 7000]);
    expect(s.categories.map((x) => x.category)).toEqual(["Dining", "Groceries", "Rent"]);
  });
});

describe("spending pie slices", () => {
  it("keeps a fixed category order", () => {
    expect(spendingSlices([c("Dining", 2000), c("Housing", 6000), c("Groceries", 2000)]).map((s) => s.label)).toEqual(["Housing", "Groceries", "Dining"]);
  });
  it("folds the smallest into one slice past six", () => {
    const s = spendingSlices([c("Housing", 180000), c("Groceries", 8640), c("Dining", 5650), c("Transport", 4000), c("Utilities", 3000), c("Health", 2000), c("Shopping", 1000), c("Pets", 500)]);
    expect(s).toHaveLength(6);
    expect(s[5].folded).toBe(true);
    expect(s[5].members).toEqual(["Health", "Shopping", "Pets"]);
    expect(s[5].cents).toBe(3500);
    expect(Math.round(s.reduce((a, x) => a + x.share, 0) * 1000) / 1000).toBe(1);
  });
  it("no spending, no slices", () => {
    expect(spendingSlices([])).toEqual([]);
  });
  it("formats shares without showing tiny ones as zero", () => {
    expect([formatShare(0.4249), formatShare(0.004), formatShare(1)]).toEqual(["42%", "<1%", "100%"]);
  });
});

describe("category colors", () => {
  it("gives every built-in category a default", () => {
    expect(Object.keys(DEFAULT_COLORS)).toHaveLength(14);
    expect([defaultColorFor("Housing"), defaultColorFor("Groceries"), defaultColorFor("Dining")]).toEqual(["blue", "orange", "aqua"]);
  });
  it("gives custom categories a stable, non-gray color", () => {
    expect(defaultColorFor("Pets")).toBe(defaultColorFor("Pets"));
    expect(["gray", "slate"]).not.toContain(defaultColorFor("Pets"));
  });
  it("only accepts known swatches or #rrggbb", () => {
    expect([isValidColor("teal"), isValidColor("#a1b2c3"), isValidColor("#abc"), isValidColor("puce")]).toEqual([true, true, false, false]);
    expect([cssColor("red"), cssColor("#123abc"), cssColor("nonsense")]).toEqual(["var(--cat-red)", "#123abc", "var(--cat-gray)"]);
  });
});
