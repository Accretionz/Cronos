import type { EventBus } from "./bus";
import { todayKey } from "./date";

const LAST_DAY_KEY = "cronos.lastDay";

/**
 * Emits "day.started" once per calendar day: on first launch of the day,
 * when the clock passes midnight, or when the app comes back into view.
 * Recurring habits, daily challenges and streak checks all hook onto this.
 */
export function startScheduler(bus: EventBus): () => void {
  let memoryLastDay: string | null = null;

  const read = () => {
    try {
      return localStorage.getItem(LAST_DAY_KEY);
    } catch {
      return memoryLastDay;
    }
  };
  const write = (v: string) => {
    memoryLastDay = v;
    try {
      localStorage.setItem(LAST_DAY_KEY, v);
    } catch {
      /* keep the in-memory value */
    }
  };

  const check = () => {
    const today = todayKey();
    const previous = read();
    if (previous !== today) {
      write(today);
      bus.emit("day.started", { date: today, previousDate: previous });
    }
  };

  check();
  const timer = setInterval(check, 60_000);
  document.addEventListener("visibilitychange", check);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", check);
  };
}
