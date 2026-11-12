/**
 * A small seeded random number generator (mulberry32). The battle keeps the state in
 * BattleState.seed, so the same start + the same choices always play out the same way.
 */
export interface Rng {
  /** 0 <= n < 1 */
  next(): number;
  /** Whole number in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** True with this probability (0..1). */
  chance(p: number): boolean;
  /** The state to store back into the battle. */
  state(): number;
}

export function rngFrom(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => p >= 1 || (p > 0 && next() < p),
    state: () => a,
  };
}

/** A fresh seed for a new battle. */
export function newSeed(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) return crypto.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * 2 ** 32) >>> 0;
}
