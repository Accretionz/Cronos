import { STAT_IDS, type StatId, type Stats } from "./types";

/**
 * Natures, in the games' internal order (nature = PID mod 25). Each raises one stat by 10%
 * and lowers another by 10%; the five where they'd be the same stat are neutral.
 */
export const NATURES = [
  "Hardy", "Lonely", "Brave", "Adamant", "Naughty",
  "Bold", "Docile", "Relaxed", "Impish", "Lax",
  "Timid", "Hasty", "Serious", "Jolly", "Naive",
  "Modest", "Mild", "Quiet", "Bashful", "Rash",
  "Calm", "Gentle", "Sassy", "Careful", "Quirky",
] as const;
export type Nature = (typeof NATURES)[number];

/** The order natures cycle through stats (not the display order). */
const NATURE_STATS: StatId[] = ["atk", "def", "spe", "spa", "spd"];

export interface NatureEffect {
  up: StatId | null;
  down: StatId | null;
}

export function natureEffect(nature: Nature): NatureEffect {
  const i = NATURES.indexOf(nature);
  const up = NATURE_STATS[Math.floor(i / 5)];
  const down = NATURE_STATS[i % 5];
  return up === down ? { up: null, down: null } : { up, down };
}

export function natureMultiplier(nature: Nature, stat: StatId): number {
  const { up, down } = natureEffect(nature);
  return stat === up ? 1.1 : stat === down ? 0.9 : 1;
}

export const MAX_IV = 31;
export const MAX_EV = 252;
export const MAX_TOTAL_EVS = 510;

/** One stat, using the main-series formula (Gen III onward). Shedinja's 1 HP isn't special-cased. */
export function calcStat(stat: StatId, base: number, iv: number, ev: number, level: number, nature: Nature): number {
  const core = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100);
  if (stat === "hp") return core + level + 10;
  return Math.floor((core + 5) * natureMultiplier(nature, stat));
}

export function calcStats(base: Stats, ivs: Stats, evs: Stats, level: number, nature: Nature): Stats {
  const out = {} as Stats;
  for (const s of STAT_IDS) out[s] = calcStat(s, base[s], ivs[s], evs[s], level, nature);
  return out;
}

export const statTotal = (s: Stats) => STAT_IDS.reduce((sum, k) => sum + s[k], 0);

export const zeroStats = (): Stats => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
