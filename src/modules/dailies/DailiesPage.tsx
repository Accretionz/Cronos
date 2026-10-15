import { useState } from "react";
import { todayKey, useItems } from "../../core";
import { DailyForm, DailyRow, TodaySummary } from "./components";
import { DAILY, PERFECT_DAY_XP, XP_BY_DIFFICULTY, isDueOn, type Daily } from "./model";
import "./dailies.css";

type Editing = { mode: "new" } | { mode: "edit"; daily: Daily } | null;

export function DailiesPage() {
  const today = todayKey();
  const dailies = useItems({ type: DAILY, status: "open" }) as Daily[];
  const [editing, setEditing] = useState<Editing>(null);

  const dueToday = dailies.filter((d) => isDueOn(d, today));
  const notToday = dailies.filter((d) => !isDueOn(d, today));

  return (
    <div className="page">
      <header className="page-header header-row">
        <div>
          <h1>Dailies</h1>
          <p className="muted">
            Routines that repeat. Each one earns XP when you complete it: easy {XP_BY_DIFFICULTY.easy}, medium{" "}
            {XP_BY_DIFFICULTY.medium}, hard {XP_BY_DIFFICULTY.hard}. Finish them all for a +{PERFECT_DAY_XP} XP
            perfect-day bonus.
          </p>
        </div>
        {!editing && (
          <button className="btn-primary" onClick={() => setEditing({ mode: "new" })}>
            + Daily
          </button>
        )}
      </header>

      {editing && (
        <DailyForm
          key={editing.mode === "edit" ? editing.daily.id : "new"}
          daily={editing.mode === "edit" ? editing.daily : undefined}
          onDone={() => setEditing(null)}
        />
      )}

      {dailies.length === 0 && !editing && (
        <p className="muted empty-state">No dailies yet. Add one, like "Read 20 pages" or "Go for a walk".</p>
      )}

      {dueToday.length > 0 && (
        <section className="section">
          <TodaySummary dailies={dailies} day={today} />
          <ul className="daily-list">
            {dueToday.map((d) => (
              <DailyRow key={d.id} daily={d} day={today} onEdit={() => setEditing({ mode: "edit", daily: d })} />
            ))}
          </ul>
        </section>
      )}

      {notToday.length > 0 && (
        <section className="section">
          <h2 className="section-title">
            Not due today <span className="count">{notToday.length}</span>
          </h2>
          <ul className="daily-list">
            {notToday.map((d) => (
              <DailyRow key={d.id} daily={d} day={today} onEdit={() => setEditing({ mode: "edit", daily: d })} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
