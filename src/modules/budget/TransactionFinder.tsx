import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useItems } from "../../core";
import { useCategoryColors } from "./colors";
import { TransactionList } from "./components";
import { Select } from "../../ui";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, TXN, formatMoney, monthBounds, monthLabel, parseMoney, shiftMonth, type Transaction, type TxnKind } from "./model";
import {
  DEFAULT_FILTER,
  filterTxns,
  isFiltering,
  periodRange,
  sortTxns,
  summarizeResults,
  type PeriodKind,
  type ResultSummary,
  type SortKind,
  type TxnFilter,
} from "./search";

const SORT_LABEL: Record<SortKind, string> = { newest: "Newest first", oldest: "Oldest first", largest: "Largest first", smallest: "Smallest first" };

function periodLabel(period: PeriodKind, month: string): string {
  switch (period) {
    case "month":
      return monthLabel(month);
    case "3months": {
      const from = shiftMonth(month, -2);
      const short = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleDateString(undefined, { month: "short" });
      return `${short(from)} – ${short(month)} ${month.slice(0, 4)}`;
    }
    case "year":
      return month.slice(0, 4);
    case "all":
      return "All time";
    case "custom":
      return "Custom dates";
  }
}

const shortDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

/**
 * Transactions with search and filters. Plain view (this month, newest first) until you
 * search or filter; then it also shows what the results add up to.
 */
export function TransactionFinder({
  month,
  filter,
  onChange,
}: {
  month: string;
  filter: TxnFilter;
  onChange: (next: TxnFilter) => void;
}) {
  const all = useItems({ type: TXN }) as Transaction[];
  const results = useMemo(() => sortTxns(filterTxns(all, filter, month), filter.sort), [all, filter, month]);
  const summary = useMemo(() => summarizeResults(results), [results]);
  const filtering = isFiltering(filter);
  const set = (patch: Partial<TxnFilter>) => onChange({ ...filter, ...patch });
  const searchRef = useRef<HTMLInputElement>(null);
  const narrow = useNarrow();

  // "/" jumps to the search box (unless you're already typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || t.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { first, last } = periodRange(filter, month);
  const where = filter.period === "custom" ? customLabel(first, last) : periodLabel(filter.period, month);
  const emptyText = filtering ? "Nothing matches. Try fewer words, another period, or clear the filters." : "No transactions this month.";

  return (
    <div className="finder">
      <div className="finder-bar" role="search">
        <div className="finder-top">
        <label className="finder-search">
          <svg className="finder-search-icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden>
            <circle cx="8.5" cy="8.5" r="5.75" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M13 13l4.25 4.25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            value={filter.query}
            onChange={(e) => set({ query: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Escape" && filter.query) {
                e.preventDefault();
                set({ query: "" });
              }
            }}
            placeholder={narrow ? "Search" : "Search description, category or amount"}
            title="Search by description, category or amount"
            aria-label="Search transactions"
            enterKeyHint="search"
          />
          <kbd className="finder-kbd" aria-hidden>
            /
          </kbd>
        </label>
          <Select<SortKind>
            className="finder-sort"
            label="Sort"
            value={filter.sort}
            onChange={(sort) => set({ sort })}
            options={(Object.keys(SORT_LABEL) as SortKind[]).map((s) => ({ value: s, label: SORT_LABEL[s] }))}
          />
        </div>
        <div className="finder-controls">
          <Select<PeriodKind>
            className="finder-period"
            size="sm"
            label="Period"
            value={filter.period}
            onChange={(period) => set({ period })}
            options={(["month", "3months", "year", "all", "custom"] as PeriodKind[]).map((p) => ({ value: p, label: periodLabel(p, month), divider: p === "custom" }))}
          />
          <div className="segmented finder-kind" role="group" aria-label="Type">
            {(["all", "expense", "income"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={filter.kind === k} onClick={() => set({ kind: k, categories: k === "all" ? filter.categories : filter.categories.filter((c) => kindOf(all, c) === k) })}>
                {k === "all" ? "All" : k === "expense" ? "Expenses" : "Income"}
              </button>
            ))}
          </div>
          <CategoryPicker all={all} kind={filter.kind} selected={filter.categories} onChange={(categories) => set({ categories })} />
          <AmountPicker minCents={filter.minCents} maxCents={filter.maxCents} onChange={(minCents, maxCents) => set({ minCents, maxCents })} />
        </div>
        {filter.period === "custom" && (
          <div className="finder-dates">
            <label className="field">
              <span>From</span>
              <input type="date" value={filter.from} onChange={(e) => set({ from: e.target.value })} />
            </label>
            <label className="field">
              <span>To</span>
              <input type="date" value={filter.to} onChange={(e) => set({ to: e.target.value })} />
            </label>
          </div>
        )}
      </div>

      {filtering && <ActiveFilters filter={filter} where={where} onChange={onChange} />}

      {filtering && (
        <ResultsSummary
          summary={summary}
          kind={filter.kind}
          selected={filter.categories}
          onCategory={(c) => set({ categories: filter.categories.includes(c) ? filter.categories.filter((x) => x !== c) : [...filter.categories, c] })}
          onMonth={(m) => {
            const { first: f, last: l } = monthBounds(m);
            set({ period: "custom", from: f, to: l });
          }}
        />
      )}

      <TransactionList
        txns={results}
        grouped={filter.sort === "newest" || filter.sort === "oldest"}
        query={filter.query}
        emptyText={emptyText}
        onCategory={(c) => set({ categories: [c], kind: "all" })}
      />
    </div>
  );
}

const kindOf = (all: Transaction[], category: string): TxnKind =>
  all.find((t) => t.data.category === category)?.data.kind ?? (INCOME_CATEGORIES.includes(category) ? "income" : "expense");

function customLabel(first: string | null, last: string | null): string {
  if (first && last) return first === last ? shortDay(first) : `${shortDay(first)} – ${shortDay(last)}`;
  if (first) return `From ${shortDay(first)}`;
  if (last) return `Until ${shortDay(last)}`;
  return "Any date";
}

/* ---------- Active filters, as removable chips ---------- */

function ActiveFilters({ filter, where, onChange }: { filter: TxnFilter; where: string; onChange: (f: TxnFilter) => void }) {
  const chips: { key: string; label: ReactNode; clear: Partial<TxnFilter> }[] = [];
  if (filter.query.trim()) chips.push({ key: "q", label: <>“{filter.query.trim()}”</>, clear: { query: "" } });
  if (filter.period !== "month") chips.push({ key: "p", label: where, clear: { period: "month", from: "", to: "" } });
  if (filter.kind !== "all") chips.push({ key: "k", label: filter.kind === "expense" ? "Expenses" : "Income", clear: { kind: "all" } });
  for (const c of filter.categories) chips.push({ key: `c:${c}`, label: c, clear: { categories: filter.categories.filter((x) => x !== c) } });
  if (filter.minCents !== null || filter.maxCents !== null) chips.push({ key: "a", label: amountLabel(filter.minCents, filter.maxCents), clear: { minCents: null, maxCents: null } });
  return (
    <div className="finder-chips" aria-label="Active filters">
      {chips.map((c) => (
        <button key={c.key} type="button" className="finder-chip" onClick={() => onChange({ ...filter, ...c.clear })} aria-label={`Remove filter: ${typeof c.label === "string" ? c.label : filter.query.trim()}`}>
          <span>{c.label}</span>
          <span aria-hidden className="finder-chip-x">
            ✕
          </span>
        </button>
      ))}
      <button type="button" className="link-btn finder-clear" onClick={() => onChange({ ...DEFAULT_FILTER, sort: filter.sort })}>
        Clear all
      </button>
    </div>
  );
}

function amountLabel(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${formatMoney(min)} – ${formatMoney(max)}`;
  if (min !== null) return `${formatMoney(min)} or more`;
  return `Up to ${formatMoney(max!)}`;
}

/* ---------- Dropdown panels ---------- */

function Popover({ label, active, children, wide }: { label: ReactNode; active: boolean; children: (close: () => void) => ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="finder-pop" ref={wrap}>
      <button
        ref={button}
        type="button"
        className={`finder-pop-btn${active ? " is-active" : ""}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <span className="chevron" aria-hidden />
      </button>
      {open && (
        <div id={id} className={`finder-panel${wide ? " is-wide" : ""}`} role="dialog" aria-label={typeof label === "string" ? label : undefined}>
          {children(close)}
        </div>
      )}
    </div>
  );
}

function CategoryPicker({ all, kind, selected, onChange }: { all: Transaction[]; kind: TxnFilter["kind"]; selected: string[]; onChange: (c: string[]) => void }) {
  const { colorFor } = useCategoryColors();
  const groups = useMemo(() => {
    const counts = new Map<string, { kind: TxnKind; n: number }>();
    for (const t of all) {
      const c = counts.get(t.data.category) ?? { kind: t.data.kind, n: 0 };
      c.n++;
      counts.set(t.data.category, c);
    }
    const order = (k: TxnKind) => {
      const defaults = k === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
      return [...counts.entries()]
        .filter(([, v]) => v.kind === k)
        .sort(([a], [b]) => {
          const ia = defaults.indexOf(a), ib = defaults.indexOf(b);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
        })
        .map(([name, v]) => ({ name, n: v.n }));
    };
    return { expense: order("expense"), income: order("income") };
  }, [all]);
  const shown = (["expense", "income"] as TxnKind[]).filter((k) => kind === "all" || kind === k);
  const toggle = (c: string) => onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);
  const label = selected.length === 0 ? "Categories" : selected.length === 1 ? selected[0] : `${selected.length} categories`;

  return (
    <Popover label={label} active={selected.length > 0} wide>
      {() => (
        <div className="cat-picker">
          {shown.every((k) => groups[k].length === 0) && <p className="muted">No categories yet.</p>}
          {shown.map(
            (k) =>
              groups[k].length > 0 && (
                <fieldset key={k} className="cat-picker-group">
                  <legend>{k === "expense" ? "Expenses" : "Income"}</legend>
                  {groups[k].map(({ name, n }) => (
                    <label key={name} className="cat-picker-row">
                      <input type="checkbox" checked={selected.includes(name)} onChange={() => toggle(name)} />
                      <span className="cat-dot" style={{ "--cat": colorFor(name) } as CSSProperties} aria-hidden />
                      <span className="cat-picker-name">{name}</span>
                      <span className="muted cat-picker-n">{n}</span>
                    </label>
                  ))}
                </fieldset>
              ),
          )}
          {selected.length > 0 && (
            <button type="button" className="link-btn cat-picker-clear" onClick={() => onChange([])}>
              Show every category
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}

function AmountPicker({ minCents, maxCents, onChange }: { minCents: number | null; maxCents: number | null; onChange: (min: number | null, max: number | null) => void }) {
  const active = minCents !== null || maxCents !== null;
  return (
    <Popover label={active ? amountLabel(minCents, maxCents) : "Amount"} active={active}>
      {(close) => <AmountForm minCents={minCents} maxCents={maxCents} onApply={(a, b) => (onChange(a, b), close())} />}
    </Popover>
  );
}

const PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: "Under $20", min: null, max: 1999 },
  { label: "$20 – $100", min: 2000, max: 10000 },
  { label: "$100 – $500", min: 10000, max: 50000 },
  { label: "Over $500", min: 50001, max: null },
];

function AmountForm({ minCents, maxCents, onApply }: { minCents: number | null; maxCents: number | null; onApply: (min: number | null, max: number | null) => void }) {
  const show = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));
  const [min, setMin] = useState(show(minCents));
  const [max, setMax] = useState(show(maxCents));
  const minC = min.trim() ? parseMoney(min) : null;
  const maxC = max.trim() ? parseMoney(max) : null;
  const bad = (min.trim() !== "" && minC === null) || (max.trim() !== "" && maxC === null);
  const apply = () => {
    if (bad) return;
    if (minC !== null && maxC !== null && minC > maxC) onApply(maxC, minC);
    else onApply(minC, maxC);
  };
  return (
    <form
      className="amount-form"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div className="amount-presets">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="finder-chip is-preset" onClick={() => onApply(p.min, p.max)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="field-row">
        <label className="field">
          <span>Min</span>
          <input inputMode="decimal" placeholder="0.00" value={min} onChange={(e) => setMin(e.target.value)} aria-invalid={min.trim() !== "" && minC === null} />
        </label>
        <label className="field">
          <span>Max</span>
          <input inputMode="decimal" placeholder="Any" value={max} onChange={(e) => setMax(e.target.value)} aria-invalid={max.trim() !== "" && maxC === null} />
        </label>
      </div>
      {bad && <p className="hint hint-error">Enter amounts like 12.50</p>}
      <div className="form-actions">
        {(minCents !== null || maxCents !== null) && (
          <button type="button" className="link-btn" onClick={() => onApply(null, null)}>
            Any amount
          </button>
        )}
        <span className="spacer" />
        <button type="submit" className="btn-primary" disabled={bad}>
          Apply
        </button>
      </div>
    </form>
  );
}

/* ---------- What the results add up to ---------- */

const FOLD_AFTER = 6;

function ResultsSummary({
  summary,
  kind,
  selected,
  onCategory,
  onMonth,
}: {
  summary: ResultSummary;
  kind: TxnFilter["kind"];
  selected: string[];
  onCategory: (c: string) => void;
  onMonth: (m: string) => void;
}) {
  const { colorFor } = useCategoryColors();
  const [showAll, setShowAll] = useState(false);
  if (summary.count === 0) return null;
  // Show what's being looked at: income if that's all there is, otherwise spending.
  const focus: TxnKind = kind === "income" || (kind === "all" && summary.expenseCount === 0) ? "income" : "expense";
  const cats = summary.categories.filter((c) => c.kind === focus);
  const visible = showAll ? cats : cats.slice(0, FOLD_AFTER);
  const hidden = cats.length - visible.length;
  const top = cats[0]?.cents ?? 0;
  const net = summary.incomeCents - summary.expenseCents;

  return (
    <section className="results" aria-label="Results summary">
      <div className="results-stats">
        <ResultStat label={summary.count === 1 ? "1 transaction" : `${summary.count.toLocaleString()} transactions`} value="" />
        {summary.expenseCount > 0 && <ResultStat label="Spent" value={formatMoney(summary.expenseCents)} />}
        {summary.incomeCount > 0 && <ResultStat label="Income" value={formatMoney(summary.incomeCents)} />}
        {summary.expenseCount > 0 && summary.incomeCount > 0 && <ResultStat label="Net" value={`${net < 0 ? "−" : "+"}${formatMoney(Math.abs(net))}`} />}
        {summary.expenseCount > 1 && <ResultStat label="Average expense" value={formatMoney(summary.averageExpenseCents)} />}
        {summary.months.length > 1 && focus === "expense" && (
          <ResultStat label="Per month" value={formatMoney(Math.round(summary.expenseCents / summary.months.length))} />
        )}
      </div>

      {cats.length > 1 && (
        <div className="results-block">
          <h3 className="results-title">{focus === "expense" ? "Spending by category" : "Income by category"}</h3>
          <ul className="results-cats">
            {visible.map((c) => (
              <li key={c.category}>
                <button
                  type="button"
                  className={`results-cat${selected.includes(c.category) ? " is-selected" : ""}`}
                  onClick={() => onCategory(c.category)}
                  aria-pressed={selected.includes(c.category)}
                  title={selected.includes(c.category) ? `Stop filtering by ${c.category}` : `Show only ${c.category}`}
                >
                  <span className="results-cat-name">
                    <span className="cat-dot" style={{ "--cat": colorFor(c.category) } as CSSProperties} aria-hidden />
                    {c.category}
                    <span className="muted results-cat-n">{c.count}</span>
                  </span>
                  <span className="results-cat-bar" aria-hidden>
                    <span style={{ width: `${top ? Math.max(2, (c.cents / top) * 100) : 0}%`, background: colorFor(c.category) }} />
                  </span>
                  <span className="results-cat-value">
                    {formatMoney(c.cents)} <span className="muted">{Math.round(c.share * 100)}%</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <button type="button" className="link-btn results-more" onClick={() => setShowAll(true)}>
              {hidden} more categor{hidden === 1 ? "y" : "ies"}
            </button>
          )}
        </div>
      )}

      {summary.months.length > 1 && <MonthBars months={summary.months} focus={focus} onMonth={onMonth} />}
    </section>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={`results-stat${value ? "" : " is-count"}`}>
      {value && <span className="results-stat-value">{value}</span>}
      <span className={value ? "stat-label" : "results-count"}>{label}</span>
    </div>
  );
}

/** Spending (or income) per month across the results. Tap a month to look at just that month. */
function MonthBars({ months, focus, onMonth }: { months: ResultSummary["months"]; focus: TxnKind; onMonth: (m: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  // Long spans: keep the most recent two years readable.
  const list = months.slice(-24);
  const value = (m: (typeof list)[number]) => (focus === "expense" ? m.expenseCents : m.incomeCents);
  const max = Math.max(...list.map(value), 1);
  const peak = list.reduce((best, m) => (value(m) > value(best) ? m : best), list[0]);
  const label = (m: string, style: "short" | "long") =>
    new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleDateString(
      undefined,
      style === "long" ? { month: "long", year: "numeric" } : { month: list.length > 12 ? "narrow" : "short" },
    );
  const shownOn = hover ?? peak.month;
  const spansYears = list[0].month.slice(0, 4) !== list[list.length - 1].month.slice(0, 4);

  return (
    <div className="results-block">
      <h3 className="results-title">
        {focus === "expense" ? "Spending" : "Income"} by month{months.length > list.length && <span className="muted"> · last 24 months</span>}
      </h3>
      <div className={`month-bars${list.length > 6 ? " is-dense" : ""}`} style={{ "--n": list.length } as CSSProperties} onPointerLeave={() => setHover(null)}>
        {list.map((m, i) => {
          const v = value(m);
          const pct = (v / max) * 100;
          const isShown = m.month === shownOn;
          return (
            <button
              key={m.month}
              type="button"
              className={`month-bar${isShown ? " is-shown" : ""}${hover && !isShown ? " is-dim" : ""}`}
              onPointerEnter={() => setHover(m.month)}
              onFocus={() => setHover(m.month)}
              onBlur={() => setHover(null)}
              onClick={() => onMonth(m.month)}
              aria-label={`${label(m.month, "long")}: ${formatMoney(v)}. Show this month.`}
            >
              {isShown && (
                <span className="month-bar-value">
                  {formatMoney(v)}
                  {hover && <span className="month-bar-when">{label(m.month, "long")}</span>}
                </span>
              )}
              <span className="month-bar-track">
                <span className="month-bar-fill" style={{ height: v ? `max(${pct}%, 3px)` : "0" }} />
              </span>
              <span className="month-bar-label" aria-hidden>
                {label(m.month, "short")}
                {spansYears && (i === 0 || m.month.endsWith("-01")) && <span className="month-bar-year">{m.month.slice(0, 4)}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** True on phone-width screens (matches the layout breakpoint in budget.css). */
function useNarrow(): boolean {
  const query = "(max-width: 700px)";
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}
