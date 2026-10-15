import { addDays, dayOf, type Item } from "../../core";

export const DAILY = "daily";

export type Difficulty = "easy" | "medium" | "hard";

/** XP earned each time a daily is completed. */
export const XP_BY_DIFFICULTY: Record<Difficulty, number> = { easy: 10, medium: 25, hard: 50 };

/** Bonus for finishing every daily scheduled for a day. */
export const PERFECT_DAY_XP = 25;

export const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

export type DailyData = {
  difficulty: Difficulty;
  /** Days ("YYYY-MM-DD") this daily was completed. Newest last, capped to keep items small. */
  doneDays: string[];
};

export type Daily = Item<DailyData>;

/** How many completed days to keep per daily (about two years). */
export const HISTORY_LIMIT = 730;

/* ---------- Schedule: which weekdays a daily is due ---------- */

/** 0 = Sunday … 6 = Saturday, matching Date.getDay(). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const RRULE_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
export const WEEKDAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Stored in Item.recurrence as a standard rule: every day, or specific weekdays. */
export function toRecurrence(days: Weekday[]): string {
  if (days.length === 7) return "RRULE:FREQ=DAILY";
  return `RRULE:FREQ=WEEKLY;BYDAY=${[...days].sort().map((d) => RRULE_DAYS[d]).join(",")}`;
}

export function scheduledWeekdays(item: Item): Weekday[] {
  const byday = item.recurrence?.match(/BYDAY=([A-Z,]+)/)?.[1];
  if (!byday) return ALL_DAYS;
  const days = byday.split(",").map((d) => RRULE_DAYS.indexOf(d)).filter((d) => d >= 0) as Weekday[];
  return days.length ? days : ALL_DAYS;
}

export function weekdayOf(day: string): Weekday {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).getDay() as Weekday;
}

export function isDueOn(item: Item, day: string): boolean {
  return scheduledWeekdays(item).includes(weekdayOf(day));
}

/** "Every day", "Weekdays", "Weekends" or "Mon, Wed, Fri". */
export function describeSchedule(days: Weekday[]): string {
  const key = [...days].sort().join("");
  if (key === "0123456") return "Every day";
  if (key === "12345") return "Weekdays";
  if (key === "06") return "Weekends";
  return [...days].sort().map((d) => WEEKDAY_NAMES[d]).join(", ");
}

/* ---------- Completion & streaks ---------- */

export function isDoneOn(daily: Daily, day: string): boolean {
  return daily.data.doneDays.includes(day);
}

/** doneDays with `day` added or removed, kept sorted and capped. */
export function toggleDay(doneDays: string[], day: string, done: boolean): string[] {
  const set = new Set(doneDays);
  if (done) set.add(day);
  else set.delete(day);
  return [...set].sort().slice(-HISTORY_LIMIT);
}

/**
 * Consecutive scheduled days completed, counting back from today.
 * Today only breaks the streak once it's over, so an unfinished "today" is skipped.
 * Days the daily wasn't scheduled are skipped too, and so are days before it was created.
 */
export function streakOf(daily: Daily, today: string): number {
  const done = new Set(daily.data.doneDays);
  const created = dayOf(daily.createdAt);
  let streak = 0;
  let cursor = today;
  if (!done.has(today)) cursor = addDays(today, -1);
  for (let i = 0; i < HISTORY_LIMIT; i++, cursor = addDays(cursor, -1)) {
    if (!isDueOn(daily, cursor)) continue;
    if (done.has(cursor)) streak++;
    else break;
    if (cursor <= created) break;
  }
  return streak;
}

/* ---------- XP keys (so awards can be revoked exactly) ---------- */

export const dailyXpKey = (id: string, day: string) => `daily:${id}:${day}`;
export const perfectDayXpKey = (day: string) => `dailies-perfect:${day}`;
