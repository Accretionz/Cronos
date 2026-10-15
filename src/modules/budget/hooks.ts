import { useMemo } from "react";
import { addDays, useItems } from "../../core";
import { LIMIT, TXN, monthBounds, summarize, type BudgetLimit, type Transaction } from "./model";

/** Transactions, limits and totals for one month ("YYYY-MM"), live. */
export function useMonthBudget(month: string) {
  const { first, last } = monthBounds(month);
  const txns = useItems({ type: TXN, after: addDays(first, -1), before: addDays(last, 1) }) as Transaction[];
  const limits = useItems({ type: LIMIT }) as BudgetLimit[];
  const summary = useMemo(() => summarize(txns, limits), [txns, limits]);
  return { txns, limits, summary };
}
