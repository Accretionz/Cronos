import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { addDays, formatDay, useToday } from "../core";
import {
  WEEKDAY_LABELS,
  addMonths,
  clampDay,
  isDayKey,
  longDay,
  monthGrid,
  monthInRange,
  monthNames,
  monthOf,
  monthTitle,
  weekdayOf,
  withMonth,
  yearInRange,
  yearOf,
  yearPageStart,
} from "./calendarGrid";
import "./ui.css";

const POPUP_W = 292;
const POPUP_H = 356;

/** What the calendar shows: days of a month, the months of a year, or a page of 12 years. */
type Mode = "days" | "months" | "years";

/**
 * The app's date field, in place of `<input type="date">` (whose calendar is the browser's own
 * and can't be themed). Closed it matches the other fields and shows a friendly date ("Today",
 * "Mon, Nov 16"); open it's a themed month calendar. Click the month title to pick a month, and
 * the year there to pick a year, instead of paging through them.
 *
 * Like <Select>, focus stays on the button while the calendar is open, so it works inside
 * dialogs. Keys: ←/→ a day, ↑/↓ a week, Home/End start/end of week, PgUp/PgDn a month
 * (with Shift a year), M months, Y years, T today, Enter to pick, Delete to clear (when
 * clearable), Esc to go back a level or close. In the month and year grids the arrows move
 * around the grid and PgUp/PgDn turn the page.
 *
 * Moving the mouse only highlights; the month or year shown changes only with the arrows,
 * the title or the keyboard.
 *
 * `value` is a local "YYYY-MM-DD" day key, or "" for no date.
 */
export function DatePicker({
  value,
  onChange,
  label,
  id,
  min,
  max,
  clearable = false,
  placeholder = "Pick a date",
  size = "md",
  disabled = false,
  className = "",
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name when there's no visible <label> around it. */
  label?: string;
  id?: string;
  /** Earliest / latest day that can be picked ("YYYY-MM-DD"). */
  min?: string;
  max?: string;
  /** Offer "Clear" so the field can go back to no date. */
  clearable?: boolean;
  /** Shown when there's no date. */
  placeholder?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const today = useToday();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("days");
  const [cursor, setCursor] = useState(today); // highlighted day / month / year (keyboard or mouse)
  const [view, setView] = useState(today); // which page is shown; only arrows, the title and keys change it
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const gridId = useId();
  const has = isDayKey(value);
  const inRange = (key: string) => (!min || key >= min) && (!max || key <= max);
  const todayOk = inRange(today);

  const place = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const gap = 6;
    const margin = 8;
    const below = window.innerHeight - r.bottom - gap - margin;
    const above = r.top - gap - margin;
    const left = Math.min(Math.max(margin, r.left), window.innerWidth - POPUP_W - margin);
    if (below >= POPUP_H || below >= above) setPos({ left, top: r.bottom + gap });
    else setPos({ left, bottom: window.innerHeight - r.top + gap });
  };

  const openCalendar = () => {
    if (disabled) return;
    const start = clampDay(has ? value : today, min, max);
    setCursor(start);
    setView(start);
    setMode("days");
    place();
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const choose = (key: string) => {
    if (!inRange(key)) return;
    close();
    if (key !== value) onChange(key);
  };
  const clear = () => {
    close();
    if (value) onChange("");
  };
  /** Move the highlight and show its page. Hovering only moves the highlight (onPointerEnter). */
  const go = (key: string) => {
    const k = clampDay(key, min, max);
    setCursor(k);
    setView(k);
  };
  /** Switch to another level, keeping the page that's on screen (not a day the mouse is over). */
  const show = (next: Mode) => {
    setMode(next);
    setCursor(view);
  };
  const pickMonth = (year: number, month: number) => {
    if (!monthInRange(year, month, min, max)) return;
    setMode("days");
    go(withMonth(view, year, month));
  };
  const pickYear = (year: number) => {
    if (!yearInRange(year, min, max)) return;
    setMode("months");
    go(withMonth(view, year, Number(view.slice(5, 7)) - 1));
  };

  // While open: follow the button if the page scrolls or resizes, close on a click elsewhere.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !popup.current?.contains(t)) close(false);
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

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openCalendar();
      } else if (clearable && (e.key === "Delete" || e.key === "Backspace") && value) {
        e.preventDefault();
        onChange("");
      }
      return;
    }
    const step = (key: string) => {
      e.preventDefault();
      go(key);
    };
    // Months move by 1 (←/→) or a row of 3 (↑/↓); years the same in twelve-year pages.
    const unit = mode === "years" ? 12 : 1;
    switch (e.key) {
      case "ArrowLeft":
        return step(mode === "days" ? addDays(cursor, -1) : addMonths(cursor, -unit));
      case "ArrowRight":
        return step(mode === "days" ? addDays(cursor, 1) : addMonths(cursor, unit));
      case "ArrowUp":
        return step(mode === "days" ? addDays(cursor, -7) : addMonths(cursor, -3 * unit));
      case "ArrowDown":
        return step(mode === "days" ? addDays(cursor, 7) : addMonths(cursor, 3 * unit));
      case "Home":
        if (mode === "days") return step(addDays(cursor, -weekdayOf(cursor)));
        if (mode === "months") return step(withMonth(cursor, yearOf(cursor), 0));
        return step(addMonths(cursor, -12 * (yearOf(cursor) - yearPageStart(yearOf(cursor)))));
      case "End":
        if (mode === "days") return step(addDays(cursor, 6 - weekdayOf(cursor)));
        if (mode === "months") return step(withMonth(cursor, yearOf(cursor), 11));
        return step(addMonths(cursor, 12 * (yearPageStart(yearOf(cursor)) + 11 - yearOf(cursor))));
      case "PageUp":
      case "PageDown": {
        const dir = e.key === "PageUp" ? -1 : 1;
        if (mode === "days") return step(addMonths(cursor, dir * (e.shiftKey ? 12 : 1)));
        return step(addMonths(cursor, dir * (mode === "months" ? 12 : 144)));
      }
      case "m":
      case "M":
        e.preventDefault();
        return show(mode === "months" ? "days" : "months");
      case "y":
      case "Y":
        e.preventDefault();
        return show(mode === "years" ? "days" : "years");
      case "t":
      case "T":
        if (!todayOk) return;
        e.preventDefault();
        setMode("days");
        return go(today);
      case "Enter":
      case " ":
        e.preventDefault();
        if (mode === "months") return pickMonth(yearOf(cursor), Number(cursor.slice(5, 7)) - 1);
        if (mode === "years") return pickYear(yearOf(cursor));
        return choose(cursor);
      case "Delete":
      case "Backspace":
        if (clearable) {
          e.preventDefault();
          clear();
        }
        return;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        // Back up a level first: years → months → days → closed.
        if (mode === "years") return show("months");
        if (mode === "months") return show("days");
        return close();
      case "Tab":
        return close(false);
    }
  };

  // ---- what's on screen ----
  const viewYear = yearOf(view);
  const pageStart = yearPageStart(viewYear);
  const nav =
    mode === "days"
      ? {
          prev: addMonths(view, -1),
          next: addMonths(view, 1),
          canPrev: !min || monthOf(addMonths(view, -1)) >= monthOf(min),
          canNext: !max || monthOf(addMonths(view, 1)) <= monthOf(max),
          unit: "month",
          keys: "PgUp / PgDn",
        }
      : mode === "months"
        ? {
            prev: addMonths(view, -12),
            next: addMonths(view, 12),
            canPrev: yearInRange(viewYear - 1, min, max),
            canNext: yearInRange(viewYear + 1, min, max),
            unit: "year",
            keys: "PgUp / PgDn",
          }
        : {
            prev: addMonths(view, -144),
            next: addMonths(view, 144),
            canPrev: yearInRange(pageStart - 1, min, max),
            canNext: yearInRange(pageStart + 12, min, max),
            unit: "12 years",
            keys: "PgUp / PgDn",
          };
  const cellId = (key: string) => `${gridId}-${key}`;
  const activeId =
    mode === "days" ? cellId(cursor) : mode === "months" ? cellId(`m${monthOf(cursor)}`) : cellId(`y${yearOf(cursor)}`);
  const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();
  const shown = has ? formatDay(value) : placeholder;
  const gridLabel = mode === "days" ? monthTitle(view) : mode === "months" ? String(viewYear) : `${pageStart} – ${pageStart + 11}`;

  const dayCells = () => {
    const days = monthGrid(view);
    const month = monthOf(view);
    return (
      <>
        <div role="row" className="ui-date-row">
          {WEEKDAY_LABELS.map((d) => (
            <span key={d} role="columnheader" className="ui-date-dow">
              {d}
            </span>
          ))}
        </div>
        {[0, 1, 2, 3, 4, 5].map((w) => (
          <div role="row" className="ui-date-row" key={w}>
            {days.slice(w * 7, w * 7 + 7).map((key) => {
              const ok = inRange(key);
              const cls = [
                "ui-date-day",
                monthOf(key) !== month && "is-outside",
                key === today && "is-today",
                key === value && "is-selected",
                key === cursor && "is-active",
                !ok && "is-disabled",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <span
                  key={key}
                  id={cellId(key)}
                  role="gridcell"
                  className={cls}
                  aria-selected={key === value}
                  aria-disabled={!ok || undefined}
                  aria-label={longDay(key)}
                  aria-current={key === today ? "date" : undefined}
                  onPointerEnter={() => ok && setCursor(key)}
                  onClick={() => choose(key)}
                >
                  {Number(key.slice(8))}
                </span>
              );
            })}
          </div>
        ))}
      </>
    );
  };

  /** A 4 × 3 grid of months or years. */
  const bigCells = (items: { key: string; text: string; name: string; ok: boolean; current: boolean; selected: boolean; active: boolean; onHover: () => void; onPick: () => void }[]) =>
    [0, 1, 2, 3].map((r) => (
      <div role="row" className="ui-date-big-row" key={r}>
        {items.slice(r * 3, r * 3 + 3).map((it) => (
          <span
            key={it.key}
            id={cellId(it.key)}
            role="gridcell"
            className={["ui-date-big", it.current && "is-today", it.selected && "is-selected", it.active && "is-active", !it.ok && "is-disabled"].filter(Boolean).join(" ")}
            aria-selected={it.selected}
            aria-disabled={!it.ok || undefined}
            aria-label={it.name}
            aria-current={it.current || undefined}
            onPointerEnter={() => it.ok && it.onHover()}
            onClick={it.onPick}
          >
            {it.text}
          </span>
        ))}
      </div>
    ));

  const monthCells = () => {
    const names = monthNames();
    return bigCells(
      names.map((text, m) => {
        const key = `${viewYear}-${String(m + 1).padStart(2, "0")}`;
        return {
          key: `m${key}`,
          text,
          name: monthTitle(`${key}-01`),
          ok: monthInRange(viewYear, m, min, max),
          current: key === monthOf(today),
          selected: has && key === monthOf(value),
          active: key === monthOf(cursor),
          onHover: () => setCursor(withMonth(cursor, viewYear, m)),
          onPick: () => pickMonth(viewYear, m),
        };
      }),
    );
  };

  const yearCells = () =>
    bigCells(
      Array.from({ length: 12 }, (_, i) => {
        const y = pageStart + i;
        return {
          key: `y${y}`,
          text: String(y),
          name: String(y),
          ok: yearInRange(y, min, max),
          current: y === yearOf(today),
          selected: has && y === yearOf(value),
          active: y === yearOf(cursor),
          onHover: () => setCursor(withMonth(cursor, y, Number(cursor.slice(5, 7)) - 1)),
          onPick: () => pickYear(y),
        };
      }),
    );

  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        className={`ui-select ui-date is-${size}${open ? " is-open" : ""}${has ? "" : " is-empty"}${className ? ` ${className}` : ""}`}
        style={style}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? gridId : undefined}
        aria-activedescendant={open ? activeId : undefined}
        aria-label={label ? `${label}: ${has ? longDay(value) : placeholder}` : undefined}
        title={has ? longDay(value) : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openCalendar())}
        onKeyDown={onKey}
      >
        <span className="ui-select-value">
          <CalendarIcon />
          <span className="ui-select-text">{shown}</span>
        </span>
        <span className={`chevron${open ? " is-open" : ""}`} aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popup}
            className={`ui-date-pop${pos.bottom !== undefined ? " is-up" : ""}`}
            data-ui-popup=""
            role="dialog"
            aria-label={label ?? "Choose a date"}
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: POPUP_W }}
            onPointerDown={keepFocus}
          >
            <div className="ui-date-head">
              <button
                type="button"
                className="ui-date-nav"
                aria-label={`Previous ${nav.unit}`}
                title={`Previous ${nav.unit} (PgUp)`}
                disabled={!nav.canPrev}
                tabIndex={-1}
                onClick={() => go(nav.prev)}
              >
                <Arrow dir="left" />
              </button>
              <div className="ui-date-title" aria-live="polite">
                {mode === "days" && (
                  <button type="button" className="ui-date-title-btn" tabIndex={-1} title="Choose a month (M)" onClick={() => show("months")}>
                    {monthTitle(view)}
                    <span className="chevron" aria-hidden />
                  </button>
                )}
                {mode === "months" && (
                  <button type="button" className="ui-date-title-btn" tabIndex={-1} title="Choose a year (Y)" onClick={() => show("years")}>
                    {viewYear}
                    <span className="chevron" aria-hidden />
                  </button>
                )}
                {mode === "years" && (
                  <button type="button" className="ui-date-title-btn" tabIndex={-1} title="Back to months" onClick={() => show("months")}>
                    {pageStart} – {pageStart + 11}
                    <span className="chevron is-open" aria-hidden />
                  </button>
                )}
              </div>
              <button
                type="button"
                className="ui-date-nav"
                aria-label={`Next ${nav.unit}`}
                title={`Next ${nav.unit} (PgDn)`}
                disabled={!nav.canNext}
                tabIndex={-1}
                onClick={() => go(nav.next)}
              >
                <Arrow dir="right" />
              </button>
            </div>
            <div id={gridId} key={mode} role="grid" className={`ui-date-grid is-${mode}`} aria-label={gridLabel}>
              {mode === "days" ? dayCells() : mode === "months" ? monthCells() : yearCells()}
            </div>
            <div className="ui-date-foot">
              <button type="button" className="ui-date-link" tabIndex={-1} disabled={!todayOk} onClick={() => choose(today)}>
                Today
              </button>
              {clearable && (
                <button type="button" className="ui-date-link is-quiet" tabIndex={-1} disabled={!value} onClick={clear}>
                  Clear
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function CalendarIcon() {
  return (
    <svg className="ui-date-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </g>
    </svg>
  );
}

function Arrow({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path d={dir === "left" ? "M10 3.5L5.5 8l4.5 4.5" : "M6 3.5L10.5 8 6 12.5"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
