import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./ui.css";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** A small color dot before the label (e.g. a status or category color). */
  color?: string;
  /** Muted text after the label. */
  hint?: string;
  /** Draw a divider above this option (e.g. before "+ New category…"). */
  divider?: boolean;
}

/**
 * The app's dropdown: looks like the other fields when closed, and opens a themed list
 * (rounded, soft shadow, follows dark mode) instead of the system menu. Works with the
 * keyboard like a native one: ↑/↓ or typing a letter to move, Enter to pick, Esc to close.
 *
 * Focus stays on the button while the list is open (the list is announced through
 * aria-activedescendant), so it also works inside dialogs.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  id,
  className = "",
  size = "md",
  disabled = false,
  renderValue,
  style,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name when there's no visible <label> around it. */
  label?: string;
  id?: string;
  className?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  /** Custom content for the closed button (defaults to the option's dot and label). */
  renderValue?: (option: SelectOption<T> | undefined) => ReactNode;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options.find((o) => o.value === value);

  const place = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const gap = 6;
    const margin = 8;
    const below = window.innerHeight - r.bottom - gap - margin;
    const above = r.top - gap - margin;
    const wanted = Math.min(320, options.length * 38 + 12);
    const width = Math.max(r.width, 180);
    const left = Math.min(Math.max(margin, r.left), window.innerWidth - width - margin);
    if (below >= Math.min(wanted, 200) || below >= above) setPos({ left, top: r.bottom + gap, width, maxHeight: Math.max(120, below) });
    else setPos({ left, bottom: window.innerHeight - r.top + gap, width, maxHeight: Math.max(120, above) });
  };

  const openList = () => {
    if (disabled) return;
    setActive(selectedIndex);
    place();
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const choose = (i: number) => {
    const o = options[i];
    close();
    if (o && o.value !== value) onChange(o.value);
  };

  // While open: follow the button if the page scrolls or resizes, close on a click elsewhere.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !list.current?.contains(t)) close(false);
    };
    const onMove = () => place();
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  // Keep the highlighted option in view.
  useLayoutEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    const move = (i: number) => {
      e.preventDefault();
      if (!open) openList();
      setActive(Math.max(0, Math.min(last, i)));
    };
    switch (e.key) {
      case "ArrowDown":
        return move(open ? active + 1 : selectedIndex);
      case "ArrowUp":
        return move(open ? active - 1 : selectedIndex);
      case "Home":
        return open && move(0);
      case "End":
        return open && move(last);
      case "Enter":
      case " ":
        e.preventDefault();
        if (open) choose(active);
        else openList();
        return;
      case "Escape":
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
        return;
      case "Tab":
        if (open) close(false);
        return;
      default:
        // Type to jump: "g" → Groceries, "gi" → Gifts.
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const now = Date.now();
          typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
          const from = open ? active : selectedIndex;
          const order = [...options.keys()].map((k) => (from + 1 + k) % options.length);
          const t = typed.current.text;
          const hit = order.find((i) => options[i].label.toLowerCase().startsWith(t)) ?? order.find((i) => options[i].label.toLowerCase().startsWith(t[0]));
          if (hit !== undefined) {
            e.preventDefault();
            if (open) setActive(hit);
            else if (options[hit].value !== value) onChange(options[hit].value);
          }
        }
    }
  };

  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        className={`ui-select is-${size}${open ? " is-open" : ""}${className ? ` ${className}` : ""}`}
        style={style}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={label ? `${label}: ${selected?.label ?? ""}` : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKey}
      >
        <span className="ui-select-value">
          {renderValue ? (
            renderValue(selected)
          ) : (
            <>
              {selected?.color && <span className="ui-select-dot" style={{ background: selected.color }} aria-hidden />}
              <span className="ui-select-text">{selected?.label ?? ""}</span>
            </>
          )}
        </span>
        <span className={`chevron${open ? " is-open" : ""}`} aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            className="ui-select-list"
            data-ui-popup=""
            aria-label={label}
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.width, maxHeight: pos.maxHeight }}
          >
            {options.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={o.value === value}
                className={`ui-select-option${i === active ? " is-active" : ""}${o.value === value ? " is-selected" : ""}${o.divider ? " has-divider" : ""}`}
                onPointerEnter={() => setActive(i)}
                onPointerDown={(e) => e.preventDefault() /* keep focus on the button */}
                onClick={() => choose(i)}
              >
                {o.color && <span className="ui-select-dot" style={{ background: o.color }} aria-hidden />}
                <span className="ui-select-label">{o.label}</span>
                {o.hint && <span className="ui-select-hint">{o.hint}</span>}
                <svg className="ui-select-check" viewBox="0 0 16 16" width="14" height="14" aria-hidden>
                  <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
