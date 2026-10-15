import { addDays, dayOf, type Item } from "../../core";

/** One XP award in the ledger. Total XP is the sum of all entries. */
export const XP_ENTRY = "xp";

export type XpData = {
  amount: number;
  /** Unique key from whoever awarded it, e.g. "daily:<id>:<date>". Prevents double awards. */
  key: string;
  /** Module that awarded it, e.g. "dailies". */
  source: string;
};

export type XpEntry = Item<XpData>;

// Game events, added to the app's event list without touching the core.
declare module "../../core/bus" {
  interface EventMap {
    /** XP was actually recorded (duplicates and revoked awards don't fire this). */
    "game.xpGained": { amount: number; reason: string; total: number };
    "game.levelUp": { level: number; total: number };
  }
}

/* ---------- Levels ---------- */

/** XP needed to go from `level` to `level + 1`: 100, 150, 200, 250, … */
export function xpForNextLevel(level: number): number {
  return 100 + 50 * (level - 1);
}

export interface LevelInfo {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level takes in total. */
  needed: number;
  total: number;
}

export function levelFromXp(total: number): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, total);
  while (remaining >= xpForNextLevel(level)) {
    remaining -= xpForNextLevel(level);
    level++;
  }
  return { level, into: remaining, needed: xpForNextLevel(level), total: Math.max(0, total) };
}

/** A little flavor for the level badge. */
export function levelTitle(level: number): string {
  const titles = ["Beginner", "Apprentice", "Organizer", "Planner", "Strategist", "Taskmaster", "Time Lord", "Legend"];
  return titles[Math.min(Math.floor((level - 1) / 3), titles.length - 1)];
}

/* ---------- Totals ---------- */

export function totalXp(entries: XpEntry[]): number {
  return entries.reduce((sum, e) => sum + e.data.amount, 0);
}

/** XP earned on a day, or across the 7 days ending on it. */
export function xpOn(entries: XpEntry[], day: string): number {
  return totalXp(entries.filter((e) => e.scheduledFor && dayOf(e.scheduledFor) === day));
}

export function xpInWeek(entries: XpEntry[], lastDay: string): number {
  const first = addDays(lastDay, -6);
  return totalXp(entries.filter((e) => e.scheduledFor && dayOf(e.scheduledFor) >= first && dayOf(e.scheduledFor) <= lastDay));
}
