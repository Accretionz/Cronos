import { addDays, dayOf, type Item } from "../../core";

export const JOB = "job-application";

/** Gacha Points for each application you submit. */
export const APPLY_POINTS = 10;

export type JobStatus = "saved" | "applied" | "interviewing" | "offer" | "rejected" | "withdrawn";

/** In pipeline order. */
export const STATUSES: JobStatus[] = ["saved", "applied", "interviewing", "offer", "rejected", "withdrawn"];

export const STATUS_LABEL: Record<JobStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

/** Where the application ends up once it's no longer moving. */
export const CLOSED: JobStatus[] = ["rejected", "withdrawn"];

export const SOURCES = ["LinkedIn", "Indeed", "Company site", "Referral", "Recruiter", "Job board", "Other"];

export type JobData = {
  company: string;
  status: JobStatus;
  /** Day the application was sent ("YYYY-MM-DD"). Set once it's past "saved". */
  appliedOn?: string;
  location?: string;
  url?: string;
  salary?: string;
  source?: string;
  /** Day to check in (a reminder on the Today page). */
  followUpOn?: string;
  notes?: string;
  /** Every status change, oldest first. */
  history: { status: JobStatus; day: string }[];
};

export type JobApplication = Item<JobData>;

/** Sent: anything past "saved" counts, including a later rejection. */
export const isSubmitted = (d: Pick<JobData, "appliedOn">) => Boolean(d.appliedOn);

/** The key for this application's GP award: one per application, ever. */
export const applyPointsKey = (id: string) => `job:${id}`;

/**
 * The data after moving to `status` on `today`. Moving past "saved" stamps the applied day
 * (once); moving back to "saved" clears it (it wasn't really sent). History records the move.
 */
export function withStatus(data: JobData, status: JobStatus, today: string): JobData {
  if (data.status === status) return data;
  const appliedOn = status === "saved" ? undefined : (data.appliedOn ?? today);
  return { ...data, status, appliedOn, history: [...(data.history ?? []), { status, day: today }] };
}

/** Fill in anything missing from an older or synced record. */
export function readJob(raw: Record<string, unknown> | undefined): JobData {
  const d = (raw ?? {}) as Partial<JobData>;
  const status = STATUSES.includes(d.status as JobStatus) ? (d.status as JobStatus) : "saved";
  return {
    ...d,
    company: typeof d.company === "string" ? d.company : "",
    status,
    history: Array.isArray(d.history) ? d.history : [],
  } as JobData;
}

/* ---------- Views ---------- */

export type JobFilter = "active" | JobStatus | "closed" | "all";

export function matchesFilter(d: JobData, f: JobFilter): boolean {
  if (f === "all") return true;
  if (f === "active") return !CLOSED.includes(d.status);
  if (f === "closed") return CLOSED.includes(d.status);
  return d.status === f;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Every word must appear in the role, company, location, source or notes. */
export function matchesSearch(app: JobApplication, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const d = app.data;
  const hay = fold([app.title, d.company, d.location, d.source, d.notes].filter(Boolean).join(" "));
  return words.every((w) => hay.includes(w));
}

/** Follow-ups that are due (today or overdue), soonest first. Closed applications don't need one. */
export function dueFollowUps(apps: JobApplication[], today: string): JobApplication[] {
  return apps
    .filter((a) => a.data.followUpOn && a.data.followUpOn <= today && !CLOSED.includes(a.data.status) && a.data.status !== "offer")
    .sort((a, b) => (a.data.followUpOn! < b.data.followUpOn! ? -1 : 1));
}

/** Newest activity first: applied day (or added day for saved ones). */
export function sortApps(apps: JobApplication[]): JobApplication[] {
  const key = (a: JobApplication) => a.data.appliedOn ?? dayOf(a.createdAt);
  return [...apps].sort((a, b) => (key(a) !== key(b) ? (key(a) < key(b) ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));
}

export interface JobStats {
  /** Applications sent, ever. */
  applied: number;
  /** Sent in the last 7 days (today included). */
  thisWeek: number;
  /** Currently interviewing. */
  interviewing: number;
  offers: number;
  /** Share of sent applications that got past "applied" (an interview or an offer), 0–1. */
  responseRate: number;
  counts: Record<JobStatus, number>;
}

export function jobStats(apps: JobApplication[], today: string): JobStats {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>;
  let applied = 0;
  let thisWeek = 0;
  let responded = 0;
  const weekStart = addDays(today, -6);
  for (const a of apps) {
    const d = a.data;
    counts[d.status]++;
    if (!isSubmitted(d)) continue;
    applied++;
    if (d.appliedOn! >= weekStart && d.appliedOn! <= today) thisWeek++;
    if (d.status === "interviewing" || d.status === "offer" || d.history.some((h) => h.status === "interviewing" || h.status === "offer")) responded++;
  }
  return { applied, thisWeek, interviewing: counts.interviewing, offers: counts.offer, responseRate: applied ? responded / applied : 0, counts };
}

/** "today", "yesterday", "3 days ago", "Oct 3" (older than a week). */
export function daysAgo(day: string, today: string): string {
  if (day === today) return "today";
  if (day === addDays(today, -1)) return "yesterday";
  for (let n = 2; n <= 6; n++) if (day === addDays(today, -n)) return `${n} days ago`;
  const [y, m, dd] = day.split("-").map(Number);
  const sameYear = y === Number(today.slice(0, 4));
  return new Date(y, m - 1, dd).toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/** Turn a typed link into one that opens: adds https:// when it's missing. Null when it isn't a web address. */
export function cleanUrl(input: string | undefined): string | null {
  const t = (input ?? "").trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    return u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
}
