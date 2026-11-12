import { useState } from "react";
import { CompletedGroup, useDoubleClickGuard } from "../../ui";
import { moduleHref, useItems, useToday } from "../../core";
import { DailyRow, TodaySummary } from "./components";
import { DAILY, isDoneOn, isDueOn, type Daily } from "./model";
import "./dailies.css";

/** Unfinished dailies shown before "Show more". */
const MAX_VISIBLE = 5;

/**
 * Dashboard tile: keeps the card short however many dailies there are.
 * Unfinished dailies come first (up to MAX_VISIBLE, then "Show N more"),
 * finished ones fold into a "✓ N completed" line that can be opened to un-check.
 */
export function DailiesWidget() {
  const today = useToday();
  const dailies = useItems({ type: DAILY, status: "open" }) as Daily[];
  const due = dailies.filter((d) => isDueOn(d, today));

  const [expanded, setExpanded] = useState(false);
  const guard = useDoubleClickGuard();

  const isDone = (d: Daily) => isDoneOn(d, today);
  const todo = due.filter((d) => !isDone(d));
  const done = due.filter(isDone);

  // Don't hide a single leftover behind "Show 1 more".
  const needsMore = todo.length > MAX_VISIBLE + 1;
  const visible = expanded || !needsMore ? todo : todo.slice(0, MAX_VISIBLE);
  const hiddenCount = todo.length - visible.length;

  if (due.length === 0) {
    return (
      <div>
        <p className="muted widget-empty">{dailies.length ? "Nothing due today. Enjoy the break." : "Dailies are routines you repeat, like stretching or reading. Each one earns XP and Gacha Points."}</p>
        {dailies.length === 0 && (
          <a className="btn-primary widget-cta" href={moduleHref("dailies")}>
            Add your first daily
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="dailies-widget">
      <TodaySummary dailies={dailies} day={today} />

      {visible.length > 0 && (
        <ul className="daily-list" id="dailies-todo" {...guard}>
          {visible.map((d) => (
            <DailyRow key={d.id} daily={d} day={today} />
          ))}
        </ul>
      )}

      {needsMore && (
        <button
          className="widget-toggle"
          aria-expanded={expanded}
          aria-controls="dailies-todo"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "Show less" : `Show ${hiddenCount} more`}
          <span className={`chevron${expanded ? " is-open" : ""}`} aria-hidden />
        </button>
      )}

      {/* Checked dailies leave the list at once; they're here, folded, to un-check. */}
      <CompletedGroup count={done.length} id="dailies-done">
        <ul className="daily-list">
          {done.map((d) => (
            <DailyRow key={d.id} daily={d} day={today} />
          ))}
        </ul>
      </CompletedGroup>
    </div>
  );
}
