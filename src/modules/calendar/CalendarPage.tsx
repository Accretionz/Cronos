import { useState } from "react";
import { addDays, dayKey, formatDay, todayKey } from "../../core";
import { useAgenda, type AgendaEntry } from "./agenda";
import { AgendaList } from "./AgendaList";
import { EventForm } from "./EventForm";
import type { CalendarEvent } from "./model";
import "./calendar.css";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS = 3;

/** First and last day shown in a month grid (whole weeks, Sunday start). */
function gridRange(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const start = dayKey(new Date(year, month, 1 - first.getDay()));
  const end = dayKey(new Date(year, month, last.getDate() + (6 - last.getDay())));
  return { start, end };
}

type Editing = { mode: "new" } | { mode: "edit"; event: CalendarEvent } | null;

export function CalendarPage() {
  const today = todayKey();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selected, setSelected] = useState(today);
  const [editing, setEditing] = useState<Editing>(null);

  const { start, end } = gridRange(cursor.year, cursor.month);
  const agenda = useAgenda(start, end);

  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const inMonth = (key: string) => Number(key.slice(5, 7)) - 1 === cursor.month;

  const shiftMonth = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const goToday = () => {
    const d = new Date();
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
    setSelected(today);
  };

  const select = (key: string) => {
    setSelected(key);
    setEditing(null);
    if (!inMonth(key)) {
      const [y, m] = key.split("-").map(Number);
      setCursor({ year: y, month: m - 1 });
    }
  };

  const openEntry = (e: AgendaEntry) => setEditing({ mode: "edit", event: e.item as CalendarEvent });
  const selectedEntries = agenda.get(selected) ?? [];

  return (
    <div className="page page-wide">
      <header className="page-header header-row">
        <h1>{monthLabel}</h1>
        <div className="month-nav">
          <button className="btn-ghost" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            ‹
          </button>
          <button className="btn-ghost" onClick={goToday}>
            Today
          </button>
          <button className="btn-ghost" onClick={() => shiftMonth(1)} aria-label="Next month">
            ›
          </button>
        </div>
      </header>

      <div className="cal-layout">
        <div className="cal-grid" role="grid" aria-label={monthLabel}>
          {WEEKDAYS.map((w) => (
            <div key={w} className="cal-weekday" role="columnheader">
              {w}
            </div>
          ))}
          {days.map((key) => {
            const entries = agenda.get(key) ?? [];
            const classes = [
              "cal-cell",
              inMonth(key) ? "" : "is-outside",
              key === today ? "is-today" : "",
              key === selected ? "is-selected" : "",
            ].join(" ");
            return (
              <button
                key={key}
                className={classes}
                onClick={() => select(key)}
                role="gridcell"
                aria-selected={key === selected}
                aria-label={`${formatDay(key)}, ${entries.length} item${entries.length === 1 ? "" : "s"}`}
              >
                <span className="cal-date">{Number(key.slice(8))}</span>
                {entries.slice(0, MAX_CHIPS).map((e) => (
                  <span
                    key={e.key}
                    className={`cal-chip ${e.kind === "event" ? "is-event" : "is-task"}${
                      e.item.status === "done" ? " is-done" : ""
                    }`}
                  >
                    {e.kind === "other" ? "☐ " : ""}
                    {e.item.title}
                  </span>
                ))}
                {entries.length > MAX_CHIPS && <span className="cal-more">+{entries.length - MAX_CHIPS} more</span>}
              </button>
            );
          })}
        </div>

        <aside className="card cal-panel" aria-live="polite">
          <div className="cal-panel-head">
            <div>
              <p className="eyebrow">{formatDay(selected)}</p>
              <h2 className="cal-panel-title">
                {new Date(selected + "T00:00").toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </h2>
            </div>
            {!editing && (
              <button className="btn-primary" onClick={() => setEditing({ mode: "new" })}>
                + Event
              </button>
            )}
          </div>

          {editing ? (
            <EventForm
              key={editing.mode === "edit" ? editing.event.id : `new:${selected}`}
              event={editing.mode === "edit" ? editing.event : undefined}
              defaultDay={selected}
              onDone={() => setEditing(null)}
            />
          ) : selectedEntries.length === 0 ? (
            <p className="muted">Nothing scheduled.</p>
          ) : (
            <AgendaList entries={selectedEntries} onOpen={openEntry} />
          )}
        </aside>
      </div>
    </div>
  );
}
