import { useState } from "react";
import { addDays, dayOf, todayKey, useBusEvent, useItems, type AppModule, type Item } from "../../core";

/**
 * A tiny module that only *listens*. It imports nothing from other modules; it
 * counts completed items, plus dailies checked off today (found by item type),
 * and keeps an overall "did something every day" streak.
 */

/** Consecutive days (ending today, or yesterday if nothing yet today) with at least one completion. */
export function computeStreak(completionDays: Iterable<string>, today = todayKey()): number {
  const days = new Set(completionDays);
  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Recurring dailies record completions per day in data.doneDays (read by type name only). */
const DAILY_TYPE = "daily";
const dailyDoneDays = (i: Item) => (Array.isArray(i.data.doneDays) ? (i.data.doneDays as string[]) : []);

const CHEERS = ["Nice!", "Done and dusted.", "One more down.", "Keep it rolling.", "Great work."];

function ProgressWidget() {
  const today = todayKey();
  const doneToday = useItems({ status: "done", completedOn: today });
  const allDone = useItems({ status: "done" });
  const dailies = useItems({ type: DAILY_TYPE });
  const dailiesToday = dailies.filter((d) => dailyDoneDays(d).includes(today)).length;
  const streak = computeStreak(
    [...allDone.filter((i) => i.completedAt).map((i) => dayOf(i.completedAt!)), ...dailies.flatMap(dailyDoneDays)],
    today,
  );
  const [cheer, setCheer] = useState<string | null>(null);

  const cheerUp = () => setCheer(CHEERS[Math.floor(Math.random() * CHEERS.length)]);
  useBusEvent("item.completed", cheerUp);
  useBusEvent("xp.award", cheerUp);

  return (
    <div className="stats">
      <div className="stat">
        <span className="stat-value">{doneToday.length + dailiesToday}</span>
        <span className="stat-label">done today</span>
      </div>
      <div className="stat">
        <span className="stat-value">{streak}</span>
        <span className="stat-label">day streak</span>
      </div>
      {cheer && <p className="cheer">{cheer}</p>}
    </div>
  );
}

export const progressModule: AppModule = {
  id: "progress",
  name: "Progress",
  icon: "★",
  description: "Completions today and your daily streak. The starting point for challenges and XP.",
  widgets: [{ id: "progress", title: "Progress", component: ProgressWidget, order: 5 }],
  init({ bus }) {
    // Modules can react to app-wide events with no UI on screen.
    return bus.on("day.started", ({ date, previousDate }) => {
      console.info(`[progress] new day ${date} (last opened ${previousDate ?? "never"})`);
    });
  },
};
