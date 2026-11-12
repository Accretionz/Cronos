import type { EventBus, ItemStore } from "../../core";
import {
  DAILY,
  PERFECT_DAY_POINTS,
  PERFECT_DAY_XP,
  POINTS_BY_DIFFICULTY,
  XP_BY_DIFFICULTY,
  dailyXpKey,
  isDoneOn,
  isDueOn,
  perfectDayXpKey,
  toggleDay,
  type Daily,
} from "./model";

/** Check or un-check a daily for a given day. Rewards are handled by `watchCompletions`. */
export function setDone(store: ItemStore, daily: Daily, day: string, done: boolean) {
  return store.update(daily.id, {
    data: { ...daily.data, doneDays: toggleDay(daily.data.doneDays, day, done) },
  });
}

/** Active dailies (not archived). */
export function activeDailies(store: ItemStore): Daily[] {
  return store.query({ type: DAILY, status: "open" }) as Daily[];
}

/** True when at least one daily is due on `day` and every due daily is done. */
export function isPerfectDay(dailies: Daily[], day: string): boolean {
  const due = dailies.filter((d) => isDueOn(d, day));
  return due.length > 0 && due.every((d) => isDoneOn(d, day));
}

/**
 * Turns completions into XP and Gacha Points. Watching the store (instead of the checkbox)
 * means a daily completed from anywhere still pays out, and un-checking takes it back.
 */
export function watchCompletions(bus: EventBus, store: ItemStore): () => void {
  return bus.on("item.updated", ({ item, previous }) => {
    if (item.type !== DAILY) return;
    const daily = item as Daily;
    const before = new Set((previous as Daily).data.doneDays ?? []);
    const after = new Set(daily.data.doneDays);
    const changedDays = new Set<string>();

    for (const day of after) {
      if (before.has(day)) continue;
      changedDays.add(day);
      const key = dailyXpKey(daily.id, day);
      const difficulty = daily.data.difficulty in XP_BY_DIFFICULTY ? daily.data.difficulty : "easy";
      bus.emit("xp.award", { key, amount: XP_BY_DIFFICULTY[difficulty], reason: daily.title, source: "dailies" });
      bus.emit("points.award", { key, amount: POINTS_BY_DIFFICULTY[difficulty], reason: daily.title, source: "dailies" });
    }
    for (const day of before) {
      if (after.has(day)) continue;
      changedDays.add(day);
      bus.emit("xp.revoke", { key: dailyXpKey(daily.id, day) });
      bus.emit("points.revoke", { key: dailyXpKey(daily.id, day) });
    }

    // Perfect-day bonus follows whether every daily due that day is now done.
    const all = activeDailies(store);
    for (const day of changedDays) {
      if (isPerfectDay(all, day)) {
        bus.emit("xp.award", { key: perfectDayXpKey(day), amount: PERFECT_DAY_XP, reason: "Perfect day", source: "dailies" });
        bus.emit("points.award", { key: perfectDayXpKey(day), amount: PERFECT_DAY_POINTS, reason: "Perfect day", source: "dailies" });
      } else {
        bus.emit("xp.revoke", { key: perfectDayXpKey(day) });
        bus.emit("points.revoke", { key: perfectDayXpKey(day) });
      }
    }
  });
}
