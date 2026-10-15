import { dayOf, formatDay, todayKey } from "../../core";
import { LevelCard, useLevel } from "./components";
import { xpForNextLevel, xpInWeek, type XpEntry } from "./model";
import "./game.css";

const HISTORY_SIZE = 50;

export function GamePage() {
  const { entries, info, today } = useLevel();
  const week = xpInWeek(entries, todayKey());

  // Newest first, grouped by day.
  const recent = [...entries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, HISTORY_SIZE);
  const byDay = new Map<string, XpEntry[]>();
  for (const e of recent) {
    const day = dayOf(e.scheduledFor ?? e.createdAt);
    byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Level & XP</h1>
        <p className="muted">Complete dailies to earn XP and level up. More ways to earn are coming.</p>
      </header>

      <section className="card">
        <LevelCard />
      </section>

      <div className="game-stats">
        <Stat label="Total XP" value={info.total} />
        <Stat label="Today" value={today} />
        <Stat label="Last 7 days" value={week} />
        <Stat label={`Next level needs`} value={xpForNextLevel(info.level) - info.into} suffix="XP" />
      </div>

      <section className="section">
        <h2 className="section-title">Recent XP</h2>
        {recent.length === 0 ? (
          <p className="muted">No XP yet. Check off a daily to earn your first points.</p>
        ) : (
          [...byDay.entries()].map(([day, list]) => (
            <div key={day} className="xp-day">
              <h3 className="xp-day-label">{formatDay(day)}</h3>
              <ul className="xp-list">
                {list.map((e) => (
                  <li key={e.id} className="xp-row">
                    <span className="xp-reason">{e.title}</span>
                    <span className="xp-amount">+{e.data.amount} XP</span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="card game-stat">
      <span className="stat-label">{label}</span>
      <span className="game-stat-value">
        {value.toLocaleString()}
        {suffix && <span className="muted game-stat-suffix"> {suffix}</span>}
      </span>
    </div>
  );
}
