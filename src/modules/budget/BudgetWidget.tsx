import { moduleHref } from "../../core";
import { Meter } from "./components";
import { useMonthBudget } from "./hooks";
import { currentMonth, formatMoney } from "./model";
import "./budget.css";

/** Dashboard tile: this month's spending against the budget, and any categories over their limit. */
export function BudgetWidget() {
  const { summary } = useMonthBudget(currentMonth());
  const over = summary.categories.filter((c) => c.limitCents !== undefined && c.spentCents > c.limitCents);

  return (
    <div className="budget-widget">
      {summary.budgetCents > 0 ? (
        <>
          <div className="cat-head">
            <span>
              <strong>{formatMoney(summary.budgetedSpentCents)}</strong>{" "}
              <span className="muted">of {formatMoney(summary.budgetCents)}</span>
            </span>
          </div>
          <Meter spentCents={summary.budgetedSpentCents} limitCents={summary.budgetCents} label="Monthly budget" />
        </>
      ) : (
        <p className="muted">
          Spent <strong>{formatMoney(summary.expenseCents)}</strong> this month. Set category limits to track a budget.
        </p>
      )}
      {over.length > 0 && (
        <ul className="over-list">
          {over.map((c) => (
            <li key={c.category}>
              <span aria-hidden>⚠ </span>
              {c.category} over by {formatMoney(c.spentCents - c.limitCents!)}
            </li>
          ))}
        </ul>
      )}
      <a className="widget-link" href={moduleHref("budget")}>
        Open budget →
      </a>
    </div>
  );
}
