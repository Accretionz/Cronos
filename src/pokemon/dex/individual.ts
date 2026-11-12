import { MAX_IV, NATURES, zeroStats, type Nature } from "./stats";
import { STAT_IDS, type AbilityRef, type Gender, type Stats } from "./types";

/**
 * What makes one Pokémon different from another of the same species, the way the games do it:
 * a 32-bit personality value (PID) that decides nature, gender and ability, plus IVs (0-31,
 * fixed at birth) and EVs (earned from battles; all 0 for now).
 */
export interface Individual {
  pid: number;
  ivs: Stats;
  evs: Stats;
}

type Rng32 = () => number;

/** A random unsigned 32-bit number (crypto when available). */
function random32(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) return crypto.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * 2 ** 32) >>> 0;
}

/** A new, random individual. */
export function rollIndividual(next: Rng32 = random32): Individual {
  const pid = next() >>> 0;
  const ivs = {} as Stats;
  for (const s of STAT_IDS) ivs[s] = next() % (MAX_IV + 1);
  return { pid, ivs, evs: zeroStats() };
}

/** The same individual every time for a given seed (used to fill in Pokémon made before IVs existed). */
export function individualFromSeed(seed: string): Individual {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  let a = h >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  return rollIndividual(next);
}

/** Nature = PID mod 25. */
export const natureOf = (pid: number): Nature => NATURES[(pid >>> 0) % 25];

/** Gender threshold for each gender rate (eighths female), as in Gen III onward. */
const GENDER_THRESHOLD: Record<number, number> = { 1: 31, 2: 63, 3: 95, 4: 127, 5: 159, 6: 191, 7: 223 };

export function genderOf(pid: number, genderRate: number): Gender {
  if (genderRate < 0) return "genderless";
  if (genderRate === 0) return "male";
  if (genderRate >= 8) return "female";
  return (pid & 0xff) < (GENDER_THRESHOLD[genderRate] ?? Math.round((genderRate / 8) * 256) - 1) ? "female" : "male";
}

/** Regular (non-hidden) ability: the PID's lowest bit picks between the species' two. */
export function abilityOf(pid: number, abilities: AbilityRef[]): AbilityRef | null {
  const regular = abilities.filter((a) => !a.hidden).sort((a, b) => a.slot - b.slot);
  if (!regular.length) return abilities[0] ?? null;
  return regular[(pid & 1) % regular.length];
}

/** Sum of IVs as a rough "how good" score (0-186). */
export const ivTotal = (ivs: Stats) => STAT_IDS.reduce((s, k) => s + ivs[k], 0);

export function isStats(v: unknown): v is Stats {
  return Boolean(v) && typeof v === "object" && STAT_IDS.every((k) => typeof (v as Record<string, unknown>)[k] === "number");
}
