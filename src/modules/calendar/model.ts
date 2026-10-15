import { addDays, dayOf, type Item } from "../../core";

export const EVENT = "event";

/** Other item types the calendar also places on the grid (read-only, by type name). */
export const ALSO_SHOWN = ["task"];

export type EventData = {
  /** "HH:MM" in 24h. Missing = all-day event. */
  start?: string;
  end?: string;
  location?: string;
};

export type CalendarEvent = Item<EventData>;

export type Repeat = "none" | "daily" | "weekly" | "monthly" | "yearly";

export const REPEAT_LABELS: Record<Repeat, string> = {
  none: "Does not repeat",
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
};

/** Stored in Item.recurrence as a standard RRULE string so other tools can read it later. */
export function toRecurrence(r: Repeat): string | undefined {
  return r === "none" ? undefined : `RRULE:FREQ=${r.toUpperCase()}`;
}

export function fromRecurrence(rule: string | undefined): Repeat {
  const freq = rule?.match(/FREQ=(\w+)/)?.[1]?.toLowerCase();
  return freq === "daily" || freq === "weekly" || freq === "monthly" || freq === "yearly" ? freq : "none";
}

/** Build Item.scheduledFor: "YYYY-MM-DD" for all-day, "YYYY-MM-DDTHH:MM" (local) when timed. */
export function toScheduled(day: string, start?: string): string {
  return start ? `${day}T${start}` : day;
}

const parts = (key: string) => key.split("-").map(Number) as [number, number, number];
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate(); // m is 1-based

/**
 * Every day ("YYYY-MM-DD") in [from, to] on which this item occurs.
 * Non-repeating items occur once, on their scheduled day.
 */
export function occurrences(item: Item, from: string, to: string): string[] {
  if (!item.scheduledFor) return [];
  const base = dayOf(item.scheduledFor);
  const repeat = fromRecurrence(item.recurrence);
  if (repeat === "none") return base >= from && base <= to ? [base] : [];
  if (base > to) return [];

  const out: string[] = [];
  const [, bm, bd] = parts(base);

  if (repeat === "daily" || repeat === "weekly") {
    const step = repeat === "daily" ? 1 : 7;
    let cursor = base;
    if (cursor < from) {
      // Jump close to `from` instead of walking day by day from the start.
      const gap = Math.floor((Date.parse(from) - Date.parse(base)) / 86_400_000);
      cursor = addDays(base, Math.floor(gap / step) * step);
    }
    for (; cursor <= to; cursor = addDays(cursor, step)) if (cursor >= from) out.push(cursor);
    return out;
  }

  // Monthly / yearly: same day number; skipped in months that don't have it (e.g. the 31st).
  const [fy, fm] = parts(from);
  const [ty, tm] = parts(to);
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? (y++, (m = 1)) : m++) {
    if (repeat === "yearly" && m !== bm) continue;
    if (bd > daysInMonth(y, m)) continue;
    const key = `${y}-${String(m).padStart(2, "0")}-${String(bd).padStart(2, "0")}`;
    if (key >= base && key >= from && key <= to) out.push(key);
  }
  return out;
}

/** "9:00 AM" style label for an "HH:MM" string. */
export function formatTime(hhmm?: string): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
