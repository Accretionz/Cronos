import type { GrowthRate } from "./types";

/**
 * Experience curves, exactly as in the main games (and PokéAPI's /growth-rate tables).
 * Each returns the total EXP a Pokémon has on reaching `level`. Level 1 is 0 EXP.
 */
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 100;

export const GROWTH_RATES: readonly GrowthRate[] = ["fast", "medium", "medium-slow", "slow", "slow-then-very-fast", "fast-then-very-slow"];

/** The names players know them by. */
export const GROWTH_LABELS: Record<GrowthRate, string> = {
  fast: "Fast",
  medium: "Medium Fast",
  "medium-slow": "Medium Slow",
  slow: "Slow",
  "slow-then-very-fast": "Erratic",
  "fast-then-very-slow": "Fluctuating",
};

export const DEFAULT_GROWTH_RATE: GrowthRate = "medium";

export function isGrowthRate(v: unknown): v is GrowthRate {
  return typeof v === "string" && (GROWTH_RATES as readonly string[]).includes(v);
}

const f = Math.floor;

function formula(rate: GrowthRate, n: number): number {
  const n3 = n * n * n;
  switch (rate) {
    case "fast":
      return f((4 * n3) / 5);
    case "medium":
      return n3;
    case "medium-slow":
      return f((6 * n3 - 75 * n * n + 500 * n - 700) / 5);
    case "slow":
      return f((5 * n3) / 4);
    case "slow-then-very-fast": // Erratic
      if (n <= 50) return f((n3 * (100 - n)) / 50);
      if (n <= 68) return f((n3 * (150 - n)) / 100);
      if (n <= 98) return f((n3 * (1274 + (n % 3) ** 2 - 9 * (n % 3) - 20 * f(n / 3))) / 1000);
      return f((n3 * (160 - n)) / 100);
    case "fast-then-very-slow": // Fluctuating
      if (n <= 15) return f((n3 * (f((n + 1) / 3) + 24)) / 50);
      if (n <= 36) return f((n3 * (n + 14)) / 50);
      return f((n3 * (f(n / 2) + 32)) / 50);
  }
}

const tables = new Map<GrowthRate, number[]>();

/** Total EXP at the start of `level` (index 1..100). */
function table(rate: GrowthRate): number[] {
  let t = tables.get(rate);
  if (!t) {
    t = [0, 0];
    for (let lv = 2; lv <= MAX_LEVEL; lv++) t[lv] = formula(rate, lv);
    tables.set(rate, t);
  }
  return t;
}

export function expAtLevel(rate: GrowthRate, level: number): number {
  return table(rate)[Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.floor(level)))];
}

export interface LevelProgress {
  level: number;
  /** Total EXP. */
  exp: number;
  /** EXP into this level, and the size of this level (both 0 at Lv. 100). */
  into: number;
  needed: number;
  /** EXP still to go to the next level. */
  toNext: number;
}

export function levelFromExp(rate: GrowthRate, exp: number): LevelProgress {
  const t = table(rate);
  const e = Math.max(0, Math.floor(exp));
  let level = MIN_LEVEL;
  while (level < MAX_LEVEL && e >= t[level + 1]) level++;
  if (level >= MAX_LEVEL) return { level: MAX_LEVEL, exp: e, into: 0, needed: 0, toNext: 0 };
  const into = e - t[level];
  const needed = t[level + 1] - t[level];
  return { level, exp: e, into, needed, toNext: needed - into };
}
