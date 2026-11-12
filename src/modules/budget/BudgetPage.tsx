import { useRef, useState } from "react";
import { AddTransactionForm, CategoryBreakdown, LimitsEditor } from "./components";
import { useMonthBudget } from "./hooks";
import { SpendingPie } from "./SpendingPie";
import { currentMonth, defaultDayFor, formatMoney, monthLabel, shiftMonth } from "./model";
import { DEFAULT_FILTER, isFiltering, type TxnFilter } from "./search";
import { TransactionFinder } from "./TransactionFinder";
import "./budget.css";

export function BudgetPage() {
  const [month, setMonth] = useState(currentMonth);
  const [editingLimits, setEditingLimits] = useState(false);
  const [filter, setFilter] = useState<TxnFilter>(DEFAULT_FILTER);
  const listRef = useRef<HTMLElement>(null);
  // From the category list: show that category's transactions this month.
  const showCategory = (category: string) => {
    setFilter((f) => ({ ...f, categories: [category], kind: "all", period: f.period === "custom" ? "month" : f.period }));
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const { txns, limits, summary } = useMonthBudget(month);

  const net = summary.incomeCents - summary.expenseCents;
  const left = summary.budgetCents - summary.budgetedSpentCents;

  return (
    <div className="page page-wide">
      <header className="page-header header-row">
        <div>
          <p className="eyebrow">Budget</p>
          <h1>{monthLabel(month)}</h1>
        </div>
        <div className="month-nav">
          <button className="btn-ghost" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
            ‹
          </button>
          <button className="btn-ghost" onClick={() => setMonth(currentMonth())}>
            This month
          </button>
          <button className="btn-ghost" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month">
            ›
          </button>
        </div>
      </header>

      <div className="budget-stats">
        <Stat label="Income" value={formatMoney(summary.incomeCents)} />
        <Stat label="Spent" value={formatMoney(summary.expenseCents)} />
        <Stat label="Net" value={`${net < 0 ? "−" : ""}${formatMoney(Math.abs(net))}`} />
        {summary.budgetCents > 0 && (
          <Stat
            label={left >= 0 ? "Left in budget" : "Over budget"}
            value={formatMoney(Math.abs(left))}
            warn={left < 0}
          />
        )}
      </div>

      <div className="budget-layout">
        <div className="budget-main">
          <section className="card">
            <h2 className="card-title">Add transaction</h2>
            <AddTransactionForm key={month} defaultDay={defaultDayFor(month)} />
          </section>
          <section className="card finder-card" ref={listRef}>
            <h2 className="card-title">
              Transactions{!isFiltering(filter) && txns.length > 0 && <span className="finder-count"> · {txns.length}</span>}
            </h2>
            <TransactionFinder month={month} filter={filter} onChange={setFilter} />
          </section>
        </div>

        <div className="budget-side">
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Categories</h2>
              {!editingLimits && (
                <button className="link-btn" onClick={() => setEditingLimits(true)}>
                  {limits.length ? "Edit limits" : "Set limits"}
                </button>
              )}
            </div>
            {editingLimits ? (
              <LimitsEditor
                limits={limits}
                usedCategories={summary.categories.map((c) => c.category)}
                onDone={() => setEditingLimits(false)}
              />
            ) : (
              <CategoryBreakdown categories={summary.categories} onPick={showCategory} />
            )}
          </section>

          <section className="card">
            <h2 className="card-title">Where it went</h2>
            <SpendingPie categories={summary.categories} />
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`card budget-stat${warn ? " is-over" : ""}`}>
      <span className="stat-label">
        {warn && <span aria-hidden>⚠ </span>}
        {label}
      </span>
      <span className="budget-stat-value">{value}</span>
    </div>
  );
}
