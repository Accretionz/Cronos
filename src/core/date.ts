/** Date helpers that work in the user's local time zone. */

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" for the given date in local time. */
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(): string {
  return dayKey(new Date());
}

/** Day key of an ISO timestamp or date string, in local time. */
export function dayOf(value: string): string {
  // Plain "YYYY-MM-DD" is already a local day; don't let Date() shift it to UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return dayKey(new Date(value));
}

/** Add whole days to a "YYYY-MM-DD" key. */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + days));
}

/** Friendly label: "Today", "Tomorrow", "Yesterday", or "Mon, Oct 12". */
export function formatDay(key: string): string {
  const today = todayKey();
  if (key === today) return "Today";
  if (key === addDays(today, 1)) return "Tomorrow";
  if (key === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  const sameYear = y === new Date().getFullYear();
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
