import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { dayOf, formatDay, useCore, useItems, useModules } from "../../core";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  LIMIT,
  TXN,
  formatMoney,
  parseMoney,
  type BudgetLimit,
  type CategoryTotal,
  type LimitData,
  type Transaction,
  type TxnData,
  type TxnKind,
} from "./model";
import { useCategoryColors } from "./colors";
import { pointsForIncome } from "./rewards";
import { highlightRanges } from "./search";
import { RowMenu, Select } from "../../ui";

/* ---------- Add a transaction ---------- */

const NEW_CATEGORY = "__new__";

/**
 * Every category to offer for a kind: the defaults first, then any custom
 * categories already used in transactions (or given a limit), alphabetically.
 */
export function useCategoryOptions(kind: TxnKind): string[] {
  const txns = useItems({ type: TXN }) as Transaction[];
  const limits = useItems({ type: LIMIT }) as BudgetLimit[];
  return useMemo(() => {
    const defaults = kind === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    const custom = new Set<string>();
    for (const t of txns) if (t.data.kind === kind) custom.add(t.data.category);
    if (kind === "expense") for (const l of limits) custom.add(l.data.category);
    defaults.forEach((d) => custom.delete(d));
    return [...defaults, ...[...custom].sort((a, b) => a.localeCompare(b))];
  }, [kind, txns, limits]);
}

export function AddTransactionForm({ defaultDay }: { defaultDay: string }) {
  return <TransactionForm defaultDay={defaultDay} />;
}

/**
 * Add a new transaction, or edit an existing one when `txn` is given.
 * Editing shows Save / Cancel and calls `onDone` when finished.
 */
export function TransactionForm({
  txn,
  defaultDay,
  onDone,
}: {
  txn?: Transaction;
  defaultDay: string;
  onDone?: () => void;
}) {
  const { colorFor } = useCategoryColors();
  const { store } = useCore();
  const pointsOn = useModules().some((m) => m.id === "summon");
  const editing = Boolean(txn);
  const [kind, setKind] = useState<TxnKind>(txn?.data.kind ?? "expense");
  const [amount, setAmount] = useState(txn ? (txn.data.amountCents / 100).toFixed(2) : "");
  const [title, setTitle] = useState(txn?.title ?? "");
  const [category, setCategory] = useState(txn?.data.category ?? EXPENSE_CATEGORIES[1]);
  const [newCategory, setNewCategory] = useState("");
  const [day, setDay] = useState(txn?.scheduledFor ? dayOf(txn.scheduledFor) : defaultDay);

  const cents = parseMoney(amount);
  const categories = useCategoryOptions(kind);
  const addingNew = category === NEW_CATEGORY;
  // A typed name that matches an existing category (any capitalization) reuses that category.
  const typed = newCategory.trim();
  const finalCategory = addingNew
    ? (categories.find((c) => c.toLowerCase() === typed.toLowerCase()) ?? typed)
    : category;
  const canSubmit = cents !== null && Boolean(day) && finalCategory !== "";

  const switchKind = (k: TxnKind) => {
    if (k === kind) return;
    setKind(k);
    setCategory(k === "expense" ? EXPENSE_CATEGORIES[1] : INCOME_CATEGORIES[0]);
    setNewCategory("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const fields = {
      title: title.trim() || finalCategory,
      scheduledFor: day,
      data: { amountCents: cents!, kind, category: finalCategory } satisfies TxnData,
    };
    if (txn) {
      await store.update(txn.id, fields);
      onDone?.();
      return;
    }
    await store.create<TxnData>({ type: TXN, ...fields });
    setAmount("");
    setTitle("");
    // A brand-new category is now in the list, so select it for the next entry.
    if (addingNew) {
      setCategory(finalCategory);
      setNewCategory("");
    }
  };

  return (
    <form
      className={`txn-form${editing ? " is-editing" : ""}`}
      onSubmit={submit}
      onKeyDown={(e) => {
        if (editing && e.key === "Escape") {
          e.preventDefault();
          onDone?.();
        }
      }}
      aria-label={editing ? `Edit ${txn!.title}` : "Add transaction"}
    >
      <div className="segmented" role="group" aria-label="Type">
        <button type="button" aria-pressed={kind === "expense"} onClick={() => switchKind("expense")}>
          Expense
        </button>
        <button type="button" aria-pressed={kind === "income"} onClick={() => switchKind("income")}>
          Income
        </button>
      </div>
      <div className="field-row">
        <label className="field field-amount">
          <span>Amount</span>
          <input
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={amount !== "" && cents === null}
            autoFocus={editing}
          />
        </label>
        <label className="field">
          <span>Description</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={finalCategory || "Description"} />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Category</span>
          <Select
            value={category}
            onChange={setCategory}
            options={[
              ...categories.map((c) => ({ value: c, label: c, color: colorFor(c) })),
              { value: NEW_CATEGORY, label: "+ New category…", divider: true },
            ]}
          />
        </label>
        {addingNew && (
          <label className="field">
            <span>New category name</span>
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="e.g. Pets"
              autoFocus
            />
          </label>
        )}
        <label className="field">
          <span>Date</span>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
      </div>
      {amount !== "" && cents === null && <p className="hint hint-error">Enter an amount like 12.50</p>}
      {kind === "income" && pointsOn && cents !== null && pointsForIncome(cents) > 0 && (!editing || txn!.data.kind !== "income" || txn!.data.amountCents !== cents) && (
        <p className="hint txn-points-hint">
          <span aria-hidden>◈</span> Half of income becomes Gacha Points: +{pointsForIncome(cents).toLocaleString()} GP
        </p>
      )}
      {editing ? (
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn-ghost" onClick={onDone}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!canSubmit}>
            Save
          </button>
        </div>
      ) : (
        <button type="submit" className="btn-primary" disabled={!canSubmit}>
          Add {kind}
        </button>
      )}
    </form>
  );
}

/* ---------- Transaction list ---------- */

/** How long the "Undo" option stays after deleting. */
const UNDO_MS = 6000;

/** Rows shown at first; more on request, so a long "All time" list stays quick. */
const PAGE = 150;

/**
 * Transactions in the order given. `grouped` puts them under day headings (for date
 * order); otherwise each row shows its date. `query` highlights matching words.
 */
export function TransactionList({
  txns,
  grouped = true,
  query = "",
  emptyText = "No transactions this month.",
  onCategory,
}: {
  txns: Transaction[];
  grouped?: boolean;
  query?: string;
  emptyText?: string;
  /** Tapping a row's category tag shows only that category. */
  onCategory?: (category: string) => void;
}) {
  const { store } = useCore();
  const [limit, setLimit] = useState(PAGE);
  // A new search or filter starts from the top of the list again.
  const listKey = txns.length ? `${txns[0].id}|${txns.length}` : "";
  useEffect(() => setLimit(PAGE), [listKey]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<Transaction | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const remove = async (t: Transaction) => {
    if (editingId === t.id) setEditingId(null);
    await store.remove(t.id);
    setDeleted(t);
    clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setDeleted(null), UNDO_MS);
  };

  const undo = async () => {
    if (!deleted) return;
    clearTimeout(undoTimer.current);
    await store.restore(deleted);
    setDeleted(null);
  };

  const undoBar = deleted && (
    <div className="undo-bar" role="status">
      <span>
        Deleted <strong>{deleted.title}</strong>
      </span>
      <button className="link-btn" onClick={undo}>
        Undo
      </button>
    </div>
  );

  if (txns.length === 0) {
    return (
      <>
        {undoBar}
        <p className="muted txn-empty">{emptyText}</p>
      </>
    );
  }

  const shown = txns.slice(0, limit);
  const row = (t: Transaction, withDate: boolean) => {
    const day = dayOf(t.scheduledFor!);
    return editingId === t.id ? (
      <li key={t.id} className="txn-row is-editing">
        <TransactionForm txn={t} defaultDay={day} onDone={() => setEditingId(null)} />
      </li>
    ) : (
      <li key={t.id} className="txn-row">
        <span className="txn-cat">
          {onCategory ? (
            <button type="button" className="txn-cat-btn" onClick={() => onCategory(t.data.category)} title={`Show only ${t.data.category}`}>
              <CategoryPill category={t.data.category} />
            </button>
          ) : (
            <CategoryPill category={t.data.category} />
          )}
        </span>
        <span className="txn-title">
          <Highlight text={t.title} query={query} />
          {withDate && <span className="txn-date muted">{formatDay(day)}</span>}
        </span>
        <span className={`txn-amount is-${t.data.kind}`}>
          {t.data.kind === "income" ? "+" : "−"}
          {formatMoney(t.data.amountCents)}
        </span>
        <RowMenu
          label={`Options for ${t.title}`}
          actions={[
            { label: "Edit", icon: "✎", onSelect: () => setEditingId(t.id) },
            { label: "Delete", icon: "🗑", danger: true, onSelect: () => remove(t) },
          ]}
        />
      </li>
    );
  };

  // Consecutive rows on the same day share a heading.
  const byDay: [string, Transaction[]][] = [];
  if (grouped) {
    for (const t of shown) {
      const day = dayOf(t.scheduledFor!);
      const last = byDay[byDay.length - 1];
      if (last && last[0] === day) last[1].push(t);
      else byDay.push([day, [t]]);
    }
  }

  return (
    <div className="txn-days">
      {undoBar}
      {grouped ? (
        byDay.map(([day, list]) => (
          <section key={day}>
            <h3 className="txn-day">{formatDay(day)}</h3>
            <ul className="txn-list">{list.map((t) => row(t, false))}</ul>
          </section>
        ))
      ) : (
        <ul className="txn-list">{shown.map((t) => row(t, true))}</ul>
      )}
      {txns.length > shown.length && (
        <button type="button" className="btn-ghost txn-more" onClick={() => setLimit((n) => n + PAGE)}>
          Show {Math.min(PAGE, txns.length - shown.length).toLocaleString()} more of {txns.length.toLocaleString()}
        </button>
      )}
    </div>
  );
}

/** Text with the searched words marked. */
function Highlight({ text, query }: { text: string; query: string }) {
  const ranges = query.trim() ? highlightRanges(text, query) : [];
  if (!ranges.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([a, b], i) => {
    if (a > at) parts.push(text.slice(at, a));
    parts.push(<mark key={i}>{text.slice(a, b)}</mark>);
    at = b;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

/* ---------- Category tag ---------- */

/** A category name tinted with its color (same color as in the pie). */
export function CategoryPill({ category }: { category: string }) {
  const { colorFor } = useCategoryColors();
  return (
    <span className="cat-pill" style={{ "--cat": colorFor(category) } as CSSProperties} title={category}>
      <span className="cat-dot" aria-hidden />
      <span className="cat-pill-text">{category}</span>
    </span>
  );
}

/* ---------- Spending meter ---------- */

export function Meter({ spentCents, limitCents, label }: { spentCents: number; limitCents: number; label: string }) {
  const ratio = limitCents > 0 ? spentCents / limitCents : 0;
  const over = spentCents > limitCents;
  const pct = Math.min(ratio, 1) * 100;
  const detail = over
    ? `Over by ${formatMoney(spentCents - limitCents)}`
    : `${formatMoney(limitCents - spentCents)} left`;
  return (
    <div className="meter-wrap" title={`${label}: ${formatMoney(spentCents)} of ${formatMoney(limitCents)} (${Math.round(ratio * 100)}%)`}>
      <div
        className={`meter${over ? " is-over" : ""}`}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limitCents}
        aria-valuenow={spentCents}
        aria-valuetext={`${formatMoney(spentCents)} of ${formatMoney(limitCents)}, ${detail}`}
      >
        <div className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className={`meter-detail${over ? " is-over" : ""}`}>
        {over && <span aria-hidden>⚠ </span>}
        {detail}
      </span>
    </div>
  );
}

export function CategoryBreakdown({ categories, onPick }: { categories: CategoryTotal[]; onPick?: (category: string) => void }) {
  const { colorFor } = useCategoryColors();
  if (categories.length === 0) return <p className="muted">No spending yet. Set limits to track categories.</p>;
  return (
    <ul className="cat-list">
      {categories.map((c) => (
        <li key={c.category} className="cat-row">
          <div className="cat-head">
            {onPick ? (
              <button type="button" className="cat-name cat-name-btn" onClick={() => onPick(c.category)} title={`Show ${c.category} transactions`}>
                <span className="cat-dot" style={{ "--cat": colorFor(c.category) } as CSSProperties} aria-hidden />
                {c.category}
              </button>
            ) : (
              <span className="cat-name">
                <span className="cat-dot" style={{ "--cat": colorFor(c.category) } as CSSProperties} aria-hidden />
                {c.category}
              </span>
            )}
            <span className="cat-amount">
              {formatMoney(c.spentCents)}
              {c.limitCents !== undefined && <span className="muted"> / {formatMoney(c.limitCents)}</span>}
            </span>
          </div>
          {c.limitCents !== undefined ? (
            <Meter spentCents={c.spentCents} limitCents={c.limitCents} label={c.category} />
          ) : (
            <span className="meter-detail">No limit set</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Edit monthly limits ---------- */

export function LimitsEditor({ limits, usedCategories, onDone }: {
  limits: BudgetLimit[];
  usedCategories: string[];
  onDone: () => void;
}) {
  const { store } = useCore();
  const names = [...new Set([...EXPENSE_CATEGORIES, ...limits.map((l) => l.data.category), ...usedCategories])];
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      names.map((n) => {
        const l = limits.find((x) => x.data.category === n);
        return [n, l ? (l.data.limitCents / 100).toFixed(2) : ""];
      }),
    ),
  );
  const invalid = names.filter((n) => values[n]?.trim() && parseMoney(values[n]) === null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (invalid.length) return;
    for (const name of names) {
      const cents = values[name]?.trim() ? parseMoney(values[name]) : null;
      const existing = limits.find((l) => l.data.category === name);
      if (cents === null && existing) await store.remove(existing.id);
      else if (cents !== null && existing && existing.data.limitCents !== cents)
        await store.update(existing.id, { data: { category: name, limitCents: cents } });
      else if (cents !== null && !existing)
        await store.create<LimitData>({ type: LIMIT, title: name, data: { category: name, limitCents: cents } });
    }
    onDone();
  };

  return (
    <form onSubmit={save} className="limits-form">
      <p className="hint">Monthly limit per category. Leave blank for no limit.</p>
      <div className="limits-grid">
        {names.map((n) => (
          <label key={n} className="limit-row">
            <span>{n}</span>
            <input
              inputMode="decimal"
              placeholder="—"
              value={values[n] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [n]: e.target.value }))}
              aria-label={`${n} monthly limit`}
              aria-invalid={invalid.includes(n)}
            />
          </label>
        ))}
      </div>
      {invalid.length > 0 && <p className="hint hint-error">Check: {invalid.join(", ")}</p>}
      <div className="form-actions">
        <span className="spacer" />
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          Save limits
        </button>
      </div>
    </form>
  );
}
