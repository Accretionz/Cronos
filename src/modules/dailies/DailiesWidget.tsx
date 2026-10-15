import { useEffect, useRef, useState } from "react";
import { moduleHref, todayKey, useItems } from "../../core";
import { DailyRow, TodaySummary } from "./components";
import { DAILY, isDoneOn, isDueOn, type Daily } from "./model";
import "./dailies.css";

/** Unfinished dailies shown before "Show more". */
const MAX_VISIBLE = 5;
/** A just-checked daily stays put this long (struck through) before moving to "completed". */
const SETTLE_MS = 1000;

/**
 * Dashboard tile: keeps the card short however many dailies there are.
 * Unfinished dailies come first (up to MAX_VISIBLE, then "Show N more"),
 * finished ones fold into a "✓ N completed" line that can be opened to un-check.
 */
export function DailiesWidget() {
  const today = todayKey();
  const dailies = useItems({ type: DAILY, status: "open" }) as Daily[];
  const due = dailies.filter((d) => isDueOn(d, today));

  const [expanded, setExpanded] = useState(false);
  const [showDone, setShowDone] = useState(false);
  // Checking off another daily folds the completed list again, so the card stays short.
  const settling = useSettling(due, today, () => setShowDone(false));

  const isDone = (d: Daily) => isDoneOn(d, today);
  // Unfinished, plus anything checked a moment ago (still in place, fading out).
  const todo = due.filter((d) => !isDone(d) || settling.has(d.id));
  const done = due.filter((d) => isDone(d) && !settling.has(d.id));

  // Don't hide a single leftover behind "Show 1 more".
  const needsMore = todo.length > MAX_VISIBLE + 1;
  const visible = expanded || !needsMore ? todo : todo.slice(0, MAX_VISIBLE);
  const hiddenCount = todo.length - visible.length;

  // Nothing left in "completed" (everything un-checked): reset so it starts folded next time.
  useEffect(() => {
    if (done.length === 0) setShowDone(false);
  }, [done.length]);

  if (due.length === 0) {
    return (
      <div>
        <p className="muted">{dailies.length ? "Nothing due today." : "No dailies yet."}</p>
        <a className="widget-link" href={moduleHref("dailies")}>
          {dailies.length ? "Manage dailies →" : "Add a daily →"}
        </a>
      </div>
    );
  }

  return (
    <div className="dailies-widget">
      <TodaySummary dailies={dailies} day={today} />

      {visible.length > 0 && (
        <ul className="daily-list" id="dailies-todo">
          {visible.map((d) => (
            <DailyRow key={d.id} daily={d} day={today} className={settling.has(d.id) ? "is-settling" : ""} />
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
          <span className={`chevron${expanded ? " is-open" : ""}`} aria-hidden>
            ▾
          </span>
        </button>
      )}

      {done.length > 0 && (
        <div className="done-group">
          <button
            className="widget-toggle done-toggle"
            aria-expanded={showDone}
            aria-controls="dailies-done"
            onClick={() => setShowDone((s) => !s)}
          >
            <span className="done-tick" aria-hidden>
              ✓
            </span>
            {done.length} completed
            <span className={`chevron${showDone ? " is-open" : ""}`} aria-hidden>
              ▾
            </span>
          </button>
          {showDone && (
            <ul className="daily-list done-list" id="dailies-done">
              {done.map((d) => (
                <DailyRow key={d.id} daily={d} day={today} />
              ))}
            </ul>
          )}
        </div>
      )}

      <a className="widget-link" href={moduleHref("dailies")}>
        Manage dailies →
      </a>
    </div>
  );
}

/**
 * Ids of dailies checked off within the last SETTLE_MS. Only reacts to changes
 * after the card appears, so already-done dailies start out in "completed".
 */
function useSettling(due: Daily[], day: string, onNewlyDone?: () => void): Set<string> {
  const doneNow = due.filter((d) => isDoneOn(d, day)).map((d) => d.id);
  const doneKey = doneNow.join();
  const seen = useRef<Set<string> | null>(null);
  const timers = useRef(new Map<string, number>());
  const [settling, setSettling] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const current = new Set(doneNow);
    const prev = seen.current;
    seen.current = current;
    if (!prev) return; // first render: nothing is "just" checked

    const newlyDone = doneNow.filter((id) => !prev.has(id));
    const undone = [...prev].filter((id) => !current.has(id));
    if (!newlyDone.length && !undone.length) return;
    if (newlyDone.length) onNewlyDone?.();

    setSettling((s) => {
      const next = new Set(s);
      newlyDone.forEach((id) => next.add(id));
      undone.forEach((id) => next.delete(id));
      return next;
    });
    undone.forEach((id) => {
      clearTimeout(timers.current.get(id));
      timers.current.delete(id);
    });
    newlyDone.forEach((id) => {
      clearTimeout(timers.current.get(id));
      timers.current.set(
        id,
        window.setTimeout(() => {
          timers.current.delete(id);
          setSettling((s) => {
            const next = new Set(s);
            next.delete(id);
            return next;
          });
        }, SETTLE_MS),
      );
    });
  }, [doneKey]);

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);
  return settling;
}
