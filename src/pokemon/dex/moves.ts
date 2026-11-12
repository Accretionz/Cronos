import type { LearnsetEntry } from "./types";

/** A Pokémon knows at most this many moves. */
export const MAX_MOVES = 4;

/** Level-up moves listed at level 0 or 1 (and "on evolution") count as known from the start. */
const learnLevel = (e: LearnsetEntry) => Math.max(1, e.level);

/**
 * The moves a Pokémon knows at a level when nobody has picked them: the last four different
 * level-up moves it learned at or below that level, as the games do for wild Pokémon.
 */
export function defaultMoveset(learnset: LearnsetEntry[], level: number): string[] {
  const known: string[] = [];
  const sorted = [...learnset].sort((a, b) => learnLevel(a) - learnLevel(b));
  for (const e of sorted) {
    if (learnLevel(e) > level) break;
    const i = known.indexOf(e.move);
    if (i !== -1) known.splice(i, 1);
    known.push(e.move);
  }
  return known.slice(-MAX_MOVES);
}

/** Moves learned when going from `fromLevel` (exclusive) to `toLevel` (inclusive). */
export function movesLearnedBetween(learnset: LearnsetEntry[], fromLevel: number, toLevel: number): string[] {
  const out: string[] = [];
  for (const e of learnset) {
    const lv = learnLevel(e);
    if (lv > fromLevel && lv <= toLevel && !out.includes(e.move)) out.push(e.move);
  }
  return out;
}

/** The next few moves it will learn above `level`. */
export function upcomingMoves(learnset: LearnsetEntry[], level: number, count = 3): LearnsetEntry[] {
  return [...learnset].filter((e) => learnLevel(e) > level).sort((a, b) => a.level - b.level).slice(0, count);
}
