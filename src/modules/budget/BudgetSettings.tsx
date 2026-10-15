import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useCore } from "../../core";
import {
  SWATCHES,
  cssColor,
  isHexColor,
  resetCategoryColors,
  setCategoryColor,
  useCategoryColors,
} from "./colors";
import { CategoryPill, useCategoryOptions } from "./components";
import "./budget.css";

/** Settings → Budget: pick the color for each category. */
export function BudgetSettings() {
  const { store } = useCore();
  const expense = useCategoryOptions("expense");
  const income = useCategoryOptions("income");
  const { anyCustomized } = useCategoryColors();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="card cat-settings">
      <div className="cat-settings-head">
        <div>
          <h3 className="cat-settings-title">Category colors</h3>
          <p className="muted">
            Used for transaction tags, the category list and the spending pie. The first eight colors are chosen to
            stay easy to tell apart, including for color-blind viewers.
          </p>
        </div>
        <button className="btn-ghost" onClick={() => resetCategoryColors(store)} disabled={!anyCustomized}>
          Reset all
        </button>
      </div>

      <ColorGroup title="Expenses" categories={expense} open={open} setOpen={setOpen} />
      <ColorGroup title="Income" categories={income} open={open} setOpen={setOpen} />
    </div>
  );
}

function ColorGroup({
  title,
  categories,
  open,
  setOpen,
}: {
  title: string;
  categories: string[];
  open: string | null;
  setOpen: (id: string | null) => void;
}) {
  const { choiceFor } = useCategoryColors();

  // Within a group, flag categories sharing a color so they can't be told apart.
  const byColor = new Map<string, string[]>();
  categories.forEach((c) => byColor.set(choiceFor(c), [...(byColor.get(choiceFor(c)) ?? []), c]));

  return (
    <div className="cat-group">
      <h4 className="cat-group-title">{title}</h4>
      <ul className="cat-color-list">
        {categories.map((c) => {
          const twins = (byColor.get(choiceFor(c)) ?? []).filter((x) => x !== c);
          return (
            <CategoryColorRow
              key={c}
              category={c}
              twins={twins}
              expanded={open === c}
              onToggle={() => setOpen(open === c ? null : c)}
            />
          );
        })}
      </ul>
    </div>
  );
}

function CategoryColorRow({
  category,
  twins,
  expanded,
  onToggle,
}: {
  category: string;
  twins: string[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const { store } = useCore();
  const { choiceFor, isCustomized } = useCategoryColors();
  const choice = choiceFor(category);
  const swatchName = SWATCHES.find((s) => s.id === choice)?.name ?? "Custom";
  const panelId = `colors-${category.replace(/\W+/g, "-")}`;

  return (
    <li className={`cat-color-row${expanded ? " is-open" : ""}`}>
      <div className="cat-color-line">
        <CategoryPill category={category} />
        {twins.length > 0 && (
          <span className="cat-twin" title={`Same color as ${twins.join(", ")}`}>
            <span aria-hidden>⚠</span> Same as {twins.join(", ")}
          </span>
        )}
        <span className="spacer" />
        {isCustomized(category) && (
          <button className="link-btn cat-reset" onClick={() => setCategoryColor(store, category, null)}>
            Reset
          </button>
        )}
        <button
          className="color-btn"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={`Color for ${category}: ${swatchName}. Change`}
        >
          <span className="color-btn-swatch" style={{ background: cssColor(choice) }} aria-hidden />
          {swatchName}
          <span className={`chevron${expanded ? " is-open" : ""}`} aria-hidden>
            ▾
          </span>
        </button>
      </div>
      {expanded && <SwatchPicker id={panelId} category={category} choice={choice} />}
    </li>
  );
}

function SwatchPicker({ id, category, choice }: { id: string; category: string; choice: string }) {
  const { store } = useCore();
  const { baseFor } = useCategoryColors();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [custom, setCustom] = useState(isHexColor(choice) ? choice : "#7a5cff");
  const debounce = useRef<number | undefined>(undefined);
  const pick = (value: string) => setCategoryColor(store, category, value);

  useEffect(() => () => clearTimeout(debounce.current), []);

  // Focus the selected swatch when the picker opens.
  useEffect(() => {
    const i = SWATCHES.findIndex((s) => s.id === choice);
    refs.current[i >= 0 ? i : 0]?.focus();
  }, []); // only on open

  // Arrow keys move between swatches (radio-group behavior).
  const onKey = (e: KeyboardEvent, i: number) => {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + SWATCHES.length) % SWATCHES.length;
    refs.current[next]?.focus();
    pick(SWATCHES[next].id);
  };

  return (
    <div className="swatch-picker" id={id}>
      <div className="swatch-grid" role="radiogroup" aria-label={`Color for ${category}`}>
        {SWATCHES.map((s, i) => {
          const selected = choice === s.id;
          return (
            <button
              key={s.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (!SWATCHES.some((x) => x.id === choice) && i === 0) ? 0 : -1}
              className={`swatch${selected ? " is-selected" : ""}`}
              style={{ "--sw": cssColor(s.id) } as CSSProperties}
              title={s.name + (s.id === baseFor(category) ? " (default)" : "")}
              aria-label={s.name + (s.id === baseFor(category) ? " (default)" : "")}
              onClick={() => pick(s.id)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {selected && <span aria-hidden>✓</span>}
            </button>
          );
        })}
      </div>
      <label className={`swatch-custom${isHexColor(choice) ? " is-selected" : ""}`}>
        <input
          type="color"
          value={custom}
          onChange={(e) => {
            const v = e.target.value;
            setCustom(v);
            // The native picker fires continuously while dragging; save once it settles.
            clearTimeout(debounce.current);
            debounce.current = window.setTimeout(() => pick(v), 200);
          }}
          aria-label={`Custom color for ${category}`}
        />
        Custom…
      </label>
    </div>
  );
}
