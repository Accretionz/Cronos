import { useState, type FormEvent } from "react";
import { useCore } from "../../core";
import { setDone } from "./logic";
import {
  ALL_DAYS,
  DAILY,
  DIFFICULTY_LABELS,
  PERFECT_DAY_XP,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  XP_BY_DIFFICULTY,
  describeSchedule,
  isDoneOn,
  isDueOn,
  scheduledWeekdays,
  streakOf,
  toRecurrence,
  type Daily,
  type DailyData,
  type Difficulty,
  type Weekday,
} from "./model";

/* ---------- One daily ---------- */

export function DailyRow({
  daily,
  day,
  onEdit,
  className = "",
}: {
  daily: Daily;
  day: string;
  onEdit?: () => void;
  className?: string;
}) {
  const { store } = useCore();
  const due = isDueOn(daily, day);
  const done = isDoneOn(daily, day);
  const streak = streakOf(daily, day);
  const xp = XP_BY_DIFFICULTY[daily.data.difficulty];

  return (
    <li className={`daily-row${done ? " is-done" : ""}${due ? "" : " is-off"}${className ? ` ${className}` : ""}`}>
      {due ? (
        <button
          className="check"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Mark ${daily.title} as not done` : `Mark ${daily.title} as done`}
          onClick={() => setDone(store, daily, day, !done)}
        >
          {done ? "✓" : ""}
        </button>
      ) : (
        <span className="check is-placeholder" aria-hidden />
      )}
      <span className="daily-main">
        <span className="daily-title">{daily.title}</span>
        <span className="daily-sub">{describeSchedule(scheduledWeekdays(daily))}</span>
      </span>
      {streak > 0 && (
        <span className="streak" title={`${streak}-day streak`} aria-label={`${streak} day streak`}>
          🔥 {streak}
        </span>
      )}
      <span className={`pill xp-pill${done ? " is-earned" : ""}`}>+{xp} XP</span>
      {onEdit && (
        <button className="icon-btn edit-btn" aria-label={`Edit ${daily.title}`} onClick={onEdit}>
          ✎
        </button>
      )}
    </li>
  );
}

/* ---------- Add / edit ---------- */

export function DailyForm({ daily, onDone }: { daily?: Daily; onDone: () => void }) {
  const { store } = useCore();
  const [title, setTitle] = useState(daily?.title ?? "");
  const [difficulty, setDifficulty] = useState<Difficulty>(daily?.data.difficulty ?? "easy");
  const [days, setDays] = useState<Weekday[]>(daily ? scheduledWeekdays(daily) : ALL_DAYS);

  const canSave = title.trim() !== "" && days.length > 0;

  const toggleDay = (d: Weekday) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort() as Weekday[]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    const recurrence = toRecurrence(days);
    if (daily) {
      await store.update(daily.id, { title: title.trim(), recurrence, data: { ...daily.data, difficulty } });
    } else {
      await store.create<DailyData>({
        type: DAILY,
        title,
        recurrence,
        data: { difficulty, doneDays: [] },
      });
    }
    onDone();
  };

  const remove = async () => {
    if (daily) await store.remove(daily.id);
    onDone();
  };

  return (
    <form className="daily-form card" onSubmit={submit}>
      <input
        className="event-title-input"
        placeholder="e.g. Drink 8 glasses of water"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Daily title"
        autoFocus
      />
      <div className="field">
        <span>Difficulty</span>
        <div className="segmented" role="group" aria-label="Difficulty">
          {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => (
            <button key={d} type="button" aria-pressed={difficulty === d} onClick={() => setDifficulty(d)}>
              {DIFFICULTY_LABELS[d]} · {XP_BY_DIFFICULTY[d]} XP
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Repeat on · {days.length ? describeSchedule(days) : "pick at least one day"}</span>
        <div className="weekday-picker" role="group" aria-label="Days">
          {ALL_DAYS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days.includes(d)}
              aria-label={WEEKDAY_NAMES[d]}
              onClick={() => toggleDay(d)}
            >
              {WEEKDAY_SHORT[d]}
            </button>
          ))}
        </div>
      </div>
      <div className="form-actions">
        {daily && (
          <button type="button" className="btn-danger" onClick={remove}>
            Delete
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={!canSave}>
          {daily ? "Save" : "Add daily"}
        </button>
      </div>
    </form>
  );
}

/* ---------- Today's summary ---------- */

export function TodaySummary({ dailies, day }: { dailies: Daily[]; day: string }) {
  const due = dailies.filter((d) => isDueOn(d, day));
  const done = due.filter((d) => isDoneOn(d, day));
  const perfect = due.length > 0 && done.length === due.length;
  const xpToday =
    done.reduce((sum, d) => sum + XP_BY_DIFFICULTY[d.data.difficulty], 0) + (perfect ? PERFECT_DAY_XP : 0);
  if (due.length === 0) return null;

  return (
    <div className="daily-summary">
      <div className="daily-summary-head">
        <span>
          <strong>
            {done.length} of {due.length}
          </strong>{" "}
          done today
        </span>
        <span className="muted">+{xpToday} XP</span>
      </div>
      <div
        className="meter"
        role="progressbar"
        aria-label="Dailies done today"
        aria-valuemin={0}
        aria-valuemax={due.length}
        aria-valuenow={done.length}
      >
        <div className="meter-fill" style={{ width: `${(done.length / due.length) * 100}%` }} />
      </div>
      {perfect && <p className="perfect">✓ Perfect day! Every daily done (+{PERFECT_DAY_XP} XP bonus).</p>}
    </div>
  );
}
