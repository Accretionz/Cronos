import { addDays, dayOf, todayKey, useItems, useToday, type AppModule, type Item } from "../../core";
import { StatTile } from "../../ui";

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

/** Today page tile: the streak, plus how much got done today. */
function ProgressStat() {
  const today = useToday();
  const doneToday = useItems({ status: "done", completedOn: today });
  const allDone = useItems({ status: "done" });
  const dailies = useItems({ type: DAILY_TYPE });
  const dailiesToday = dailies.filter((d) => dailyDoneDays(d).includes(today)).length;
  const streak = computeStreak(
    [...allDone.filter((i) => i.completedAt).map((i) => dayOf(i.completedAt!)), ...dailies.flatMap(dailyDoneDays)],
    today,
  );
  const done = doneToday.length + dailiesToday;
  const keepGoing = done === 0 && streak > 0;
  return (
    <StatTile
      label="Streak"
      icon="🔥"
      value={streak}
      unit={streak === 1 ? "day" : "days"}
      detail={keepGoing ? "Finish one thing today to keep it" : `${done} done today`}
    />
  );
}

export const progressModule: AppModule = {
  id: "progress",
  name: "Progress",
  icon: "★",
  description: "Completions today and your daily streak. The starting point for challenges and XP.",
  widgets: [{ id: "progress", title: "Streak", component: ProgressStat, order: 4, slot: "stat" }],
  init({ bus }) {
    // Modules can react to app-wide events with no UI on screen.
    return bus.on("day.started", ({ date, previousDate }) => {
      console.info(`[progress] new day ${date} (last opened ${previousDate ?? "never"})`);
    });
  },
};
