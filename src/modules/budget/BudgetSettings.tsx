import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useCore } from "../../core";
import { Select } from "../../ui";
import { moveItem, setCategoryOrder, setDefaultCategory, useCategoryPrefs } from "./categories";
import {
  SWATCHES,
  cssColor,
  isHexColor,
  resetCategoryColors,
  setCategoryColor,
  useCategoryColors,
} from "./colors";
import { CategoryPill, useCategoryOptions, useDefaultCategory } from "./components";
import type { TxnKind } from "./model";
import "./budget.css";

/** Settings → Budget: per kind, the default category, the order of the lists, and each category's color. */
export function BudgetSettings() {
  const { store } = useCore();
  const { anyCustomized } = useCategoryColors();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="card cat-settings">
      <div className="cat-settings-head">
        <div>
          <h3 className="cat-settings-title">Categories</h3>
          <p className="muted">
            Choose the category new transactions start with, drag <span className="cat-grip-hint" aria-hidden>⋮⋮</span> to put
            the lists in your order, and pick each category's color. The first eight colors stay easy to tell apart,
            including for color-blind viewers.
          </p>
        </div>
        <button className="btn-ghost" onClick={() => resetCategoryColors(store)} disabled={!anyCustomized}>
          Reset colors
        </button>
      </div>

      <CategoryGroup kind="expense" title="Expenses" open={open} setOpen={setOpen} />
      <CategoryGroup kind="income" title="Income" open={open} setOpen={setOpen} />
    </div>
  );
}

function CategoryGroup({
  kind,
  title,
  open,
  setOpen,
}: {
  kind: TxnKind;
  title: string;
  open: string | null;
  setOpen: (id: string | null) => void;
}) {
  const { store } = useCore();
  const categories = useCategoryOptions(kind);
  const defaultCategory = useDefaultCategory(kind);
  const { isCustomOrder } = useCategoryPrefs();
  const { choiceFor, colorFor } = useCategoryColors();
  const [preview, setPreview] = useState<string[] | null>(null); // order while dragging
  const [dragging, setDragging] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const rows = useRef(new Map<string, HTMLLIElement>());
  const grips = useRef(new Map<string, HTMLButtonElement>());
  const drag = useRef<{ name: string; from: number; grabDelta: number; y: number; shift: number; slots?: { top: number; height: number }[] } | null>(null);
  const refocus = useRef<string | null>(null);
  const list = preview ?? categories;
  const noun = kind === "expense" ? "expenses" : "income";

  // Within a group, flag categories sharing a color so they can't be told apart.
  const byColor = new Map<string, string[]>();
  categories.forEach((c) => byColor.set(choiceFor(c), [...(byColor.get(choiceFor(c)) ?? []), c]));

  const save = (order: string[]) => {
    if (order.join("\n") !== categories.join("\n")) void setCategoryOrder(store, kind, order);
  };

  /* ---- keyboard: ↑/↓ on the handle moves the row one place (Home/End: to the ends) ---- */
  const onGripKey = (e: KeyboardEvent, name: string) => {
    const from = categories.indexOf(name);
    const to =
      e.key === "ArrowUp" ? from - 1 : e.key === "ArrowDown" ? from + 1 : e.key === "Home" ? 0 : e.key === "End" ? categories.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    if (to < 0 || to >= categories.length || to === from) return;
    refocus.current = name;
    save(moveItem(categories, from, to));
    setAnnounce(`${name} moved to position ${to + 1} of ${categories.length}`);
  };
  // Moving a row re-inserts it in the page, which can drop focus: put it back on the handle.
  useLayoutEffect(() => {
    if (refocus.current) {
      grips.current.get(refocus.current)?.focus();
      refocus.current = null;
    }
  });

  /* ---- mouse / touch: drag the handle; the row follows the pointer and the others make room ---- */
  const place = () => {
    const d = drag.current;
    const el = d && rows.current.get(d.name);
    if (!d || !el) return;
    const natural = el.getBoundingClientRect().top - d.shift;
    d.shift = d.y - d.grabDelta - natural;
    el.style.transform = `translateY(${d.shift}px)`;
  };
  useLayoutEffect(place, [preview]);

  const onGripDown = (e: ReactPointerEvent<HTMLButtonElement>, name: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setOpen(null); // an open color picker would make rows different heights
    const rect = rows.current.get(name)!.getBoundingClientRect();
    drag.current = { name, from: categories.indexOf(name), grabDelta: e.clientY - rect.top, y: e.clientY, shift: 0 };
    setDragging(name);
    setPreview(categories);
  };
  const onGripMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.y = e.clientY;
    // Measure the slots once the layout has settled (after any color picker closed).
    if (!d.slots) d.slots = categories.map((c) => {
      const r = rows.current.get(c)!.getBoundingClientRect();
      return { top: r.top, height: r.height };
    });
    const h = d.slots[d.from].height;
    const center = d.y - d.grabDelta + h / 2;
    let to = d.slots.findIndex((s) => center < s.top + s.height / 2);
    if (to < 0) to = d.slots.length - 1;
    const next = moveItem(categories, d.from, to);
    if (next.join("\n") !== (preview ?? categories).join("\n")) setPreview(next);
    else place();
  };
  const onGripUp = () => {
    const d = drag.current;
    if (!d) return;
    const el = rows.current.get(d.name);
    if (el) el.style.transform = "";
    const order = preview ?? categories;
    drag.current = null;
    setDragging(null);
    setPreview(null);
    save(order);
    const at = order.indexOf(d.name);
    if (at !== d.from) setAnnounce(`${d.name} moved to position ${at + 1} of ${order.length}`);
  };

  return (
    <div className="cat-group">
      <div className="cat-group-head">
        <h4 className="cat-group-title">{title}</h4>
        <label className="cat-default">
          <span>{kind === "expense" ? "New expenses start as" : "New income starts as"}</span>
          <Select
            size="sm"
            value={defaultCategory}
            onChange={(c) => void setDefaultCategory(store, kind, c)}
            label={`Default category for new ${noun}`}
            options={categories.map((c) => ({ value: c, label: c, color: colorFor(c) }))}
          />
        </label>
        {isCustomOrder(kind) && (
          <button className="link-btn cat-order-reset" onClick={() => void setCategoryOrder(store, kind, null)}>
            Reset order
          </button>
        )}
      </div>
      <ul className={`cat-color-list${dragging ? " is-reordering" : ""}`}>
        {list.map((c, i) => {
          const twins = (byColor.get(choiceFor(c)) ?? []).filter((x) => x !== c);
          return (
            <CategoryColorRow
              key={c}
              category={c}
              twins={twins}
              isDefault={c === defaultCategory}
              dragging={dragging === c}
              rowRef={(el) => (el ? rows.current.set(c, el) : rows.current.delete(c))}
              grip={
                <button
                  ref={(el) => {
                    if (el) grips.current.set(c, el);
                    else grips.current.delete(c);
                  }}
                  type="button"
                  className="cat-grip"
                  aria-label={`Move ${c}, position ${i + 1} of ${list.length}`}
                  aria-keyshortcuts="ArrowUp ArrowDown"
                  title="Drag to reorder (or use ↑ ↓)"
                  onKeyDown={(e) => onGripKey(e, c)}
                  onPointerDown={(e) => onGripDown(e, c)}
                  onPointerMove={onGripMove}
                  onPointerUp={onGripUp}
                  onPointerCancel={onGripUp}
                >
                  <GripIcon />
                </button>
              }
              expanded={open === c}
              onToggle={() => setOpen(open === c ? null : c)}
            />
          );
        })}
      </ul>
      <span className="visually-hidden" role="status" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}

function GripIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      {[4, 8, 12].map((y) => [6, 10].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="currentColor" />))}
    </svg>
  );
}

function CategoryColorRow({
  category,
  twins,
  isDefault,
  dragging,
  rowRef,
  grip,
  expanded,
  onToggle,
}: {
  category: string;
  twins: string[];
  isDefault: boolean;
  dragging: boolean;
  rowRef: (el: HTMLLIElement | null) => void;
  grip: ReactNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { store } = useCore();
  const { choiceFor, isCustomized } = useCategoryColors();
  const choice = choiceFor(category);
  const swatchName = SWATCHES.find((s) => s.id === choice)?.name ?? "Custom";
  const panelId = `colors-${category.replace(/\W+/g, "-")}`;

  return (
    <li ref={rowRef} className={`cat-color-row${expanded ? " is-open" : ""}${dragging ? " is-dragging" : ""}`}>
      <div className="cat-color-line">
        {grip}
        <CategoryPill category={category} />
        {isDefault && <span className="cat-default-badge">Default</span>}
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
          <span className={`chevron${expanded ? " is-open" : ""}`} aria-hidden />
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
