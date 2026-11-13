/** Pure date math for the date picker (ui/DatePicker.tsx). Day keys are local "YYYY-MM-DD". */
import { dayKey } from "../core";

export const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parts(key: string): [number, number, number] {
  const [y, m, d] = key.split("-").map(Number);
  return [y, m - 1, d];
}

/** Is this a real "YYYY-MM-DD" day? */
export function isDayKey(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = parts(value);
  return dayKey(new Date(y, m, d)) === value;
}

/** The 42 days (six whole weeks, Sunday first) shown for the month containing `key`. */
export function monthGrid(key: string): string[] {
  const [y, m] = parts(key);
  const first = new Date(y, m, 1);
  return Array.from({ length: 42 }, (_, i) => dayKey(new Date(y, m, 1 - first.getDay() + i)));
}

/** Same day of the month, `n` months away, kept inside the shorter month (Jan 31 + 1 → Feb 28/29). */
export function addMonths(key: string, n: number): string {
  const [y, m, d] = parts(key);
  const last = new Date(y, m + n + 1, 0).getDate();
  return dayKey(new Date(y, m + n, Math.min(d, last)));
}

/** "2026-11" of a day key: tells whether two days are in the same month. */
export const monthOf = (key: string) => key.slice(0, 7);

/** Keep a day inside optional bounds. */
export function clampDay(key: string, min?: string, max?: string): string {
  if (min && key < min) return min;
  if (max && key > max) return max;
  return key;
}

/** "November 2026" */
export function monthTitle(key: string): string {
  const [y, m] = parts(key);
  return new Date(y, m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** "Friday, November 13, 2026": the full name screen readers hear for a day. */
export function longDay(key: string): string {
  const [y, m, d] = parts(key);
  return new Date(y, m, d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

/** Day of the week, 0 = Sunday. */
export function weekdayOf(key: string): number {
  const [y, m, d] = parts(key);
  return new Date(y, m, d).getDay();
}

/** The same day of the month in another year/month (0-based month), kept inside that month. */
export function withMonth(key: string, year: number, month: number): string {
  const d = Number(key.slice(8));
  const last = new Date(year, month + 1, 0).getDate();
  return dayKey(new Date(year, month, Math.min(d, last)));
}

export const yearOf = (key: string) => Number(key.slice(0, 4));

/** First year of the 12-year page that holds `year` (2016–2027 for 2026). */
export const yearPageStart = (year: number) => Math.floor(year / 12) * 12;

/** Short month names in the user's language: "Jan" … "Dec". */
export function monthNames(): string[] {
  return Array.from({ length: 12 }, (_, m) => new Date(2000, m, 1).toLocaleDateString(undefined, { month: "short" }));
}

/** Can any day of this month (0-based) be picked within the bounds? */
export function monthInRange(year: number, month: number, min?: string, max?: string): boolean {
  const first = dayKey(new Date(year, month, 1));
  const last = dayKey(new Date(year, month + 1, 0));
  return (!min || last >= min) && (!max || first <= max);
}

/** Can any day of this year be picked within the bounds? */
export function yearInRange(year: number, min?: string, max?: string): boolean {
  return (!min || `${year}-12-31` >= min) && (!max || `${year}-01-01` <= max);
}
