import { effectiveness } from "../dex/typechart";
import type { BattleStat } from "../dex/types";
import type { Rng } from "./rng";
import type { BattleMove, Battler, Stages } from "./types";

/**
 * The main-series formulas (Gen V onward, without abilities, items or weather for now).
 * Pure functions: give them the numbers, get the numbers back.
 */

export const MAX_STAGE = 6;

export const emptyStages = (): Stages => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 });

/** Attack/Defense/Sp. Atk/Sp. Def/Speed stage multiplier: +1 = ×1.5, +6 = ×4, −6 = ×0.25. */
export function statStageMultiplier(stage: number): number {
  const s = Math.max(-MAX_STAGE, Math.min(MAX_STAGE, stage));
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

/** Accuracy/evasion stage multiplier: +1 = ×4/3, −6 = ×1/3. */
export function accuracyStageMultiplier(stage: number): number {
  const s = Math.max(-MAX_STAGE, Math.min(MAX_STAGE, stage));
  return s >= 0 ? (3 + s) / 3 : 3 / (3 - s);
}

/** Speed used for turn order: stages, and paralysis halves it. */
export function effectiveSpeed(b: Battler): number {
  const speed = Math.floor(b.stats.spe * statStageMultiplier(b.stages.spe));
  return b.status === "par" ? Math.floor(speed / 2) : speed;
}

/** Chance of a critical hit by stage: 1/24, 1/8, 1/2, then always. */
export function critChance(stage: number): number {
  return [1 / 24, 1 / 8, 1 / 2][Math.max(0, stage)] ?? 1;
}

/** Does it hit? Moves with no accuracy never miss. */
export function hitChance(move: BattleMove, user: Battler, target: Battler): number {
  if (move.accuracy === null) return 1;
  const stage = Math.max(-MAX_STAGE, Math.min(MAX_STAGE, user.stages.acc - target.stages.eva));
  return Math.min(1, (move.accuracy / 100) * accuracyStageMultiplier(stage));
}

/** Moves with set damage instead of power. */
export const FIXED_DAMAGE: Record<string, (user: Battler, target: Battler) => number> = {
  "seismic-toss": (u) => u.level,
  "night-shade": (u) => u.level,
  "dragon-rage": () => 40,
  "sonic-boom": () => 20,
  "super-fang": (_u, t) => Math.max(1, Math.floor(t.hp / 2)),
  "natures-madness": (_u, t) => Math.max(1, Math.floor(t.hp / 2)),
  endeavor: (u, t) => Math.max(0, t.hp - u.hp),
};

/** Power for damaging moves PokéAPI lists without one (varies in the games): a fair middle value. */
export const VARIABLE_POWER = 60;

export interface DamageRoll {
  damage: number;
  effectiveness: number;
  crit: boolean;
}

/**
 * Damage for one hit:
 *   base = ⌊⌊⌊2·Lv/5 + 2⌋ · Power · A/D⌋ / 50⌋ + 2
 * then ×1.5 critical, ×(85–100)% random, ×1.5 same-type (STAB), × type effectiveness,
 * ×0.5 if a burned Pokémon uses a physical move. Each step rounds down, at least 1 if it can hit.
 */
export function rollDamage(move: BattleMove, user: Battler, target: Battler, rng: Rng, opts: { forceCrit?: boolean; randomFactor?: number } = {}): DamageRoll {
  const eff = effectiveness(move.type, target.types);
  if (eff === 0) return { damage: 0, effectiveness: 0, crit: false };
  const fixed = FIXED_DAMAGE[move.slug];
  if (fixed) return { damage: Math.min(target.hp, fixed(user, target)), effectiveness: 1, crit: false };

  const physical = move.category === "physical";
  const crit = opts.forceCrit ?? rng.chance(critChance(move.meta.critRate));
  const atkStat = physical ? "atk" : "spa";
  const defStat = physical ? "def" : "spd";
  // A critical hit ignores the attacker's drops and the defender's boosts.
  const atkStage = crit ? Math.max(0, user.stages[atkStat]) : user.stages[atkStat];
  const defStage = crit ? Math.min(0, target.stages[defStat]) : target.stages[defStat];
  const A = Math.max(1, Math.floor(user.stats[atkStat] * statStageMultiplier(atkStage)));
  const D = Math.max(1, Math.floor(target.stats[defStat] * statStageMultiplier(defStage)));
  const power = move.power ?? VARIABLE_POWER;

  let dmg = Math.floor(Math.floor((Math.floor((2 * user.level) / 5 + 2) * power * A) / D) / 50) + 2;
  if (crit) dmg = Math.floor(dmg * 1.5);
  const random = opts.randomFactor ?? rng.int(85, 100);
  dmg = Math.floor((dmg * random) / 100);
  if (user.types.includes(move.type)) dmg = Math.floor(dmg * 1.5);
  dmg = Math.floor(dmg * eff);
  if (physical && user.status === "brn") dmg = Math.floor(dmg / 2);
  return { damage: Math.max(1, dmg), effectiveness: eff, crit };
}

/** How many times a multi-hit move hits: 2–5 (35/35/15/15%), or its fixed count. */
export function hitCount(move: BattleMove, rng: Rng): number {
  const { minHits, maxHits } = move.meta;
  if (!minHits || !maxHits) return 1;
  if (minHits === maxHits) return minHits;
  if (minHits === 2 && maxHits === 5) {
    const r = rng.next();
    return r < 0.35 ? 2 : r < 0.7 ? 3 : r < 0.85 ? 4 : 5;
  }
  return rng.int(minHits, maxHits);
}

/** Major statuses each type is immune to. */
export function immuneToStatus(types: string[], status: string): boolean {
  if (status === "par") return types.includes("electric");
  if (status === "brn") return types.includes("fire");
  if (status === "psn" || status === "tox") return types.includes("poison") || types.includes("steel");
  if (status === "frz") return types.includes("ice");
  return false;
}

/** Escape from a wild battle (Gen III–IV formula). Faster always escapes. */
export function escapeChance(playerSpeed: number, foeSpeed: number, attempts: number): number {
  if (playerSpeed >= foeSpeed || foeSpeed === 0) return 1;
  const odds = Math.floor((playerSpeed * 128) / foeSpeed) + 30 * attempts;
  return Math.min(1, odds / 256);
}

/** EXP for defeating a Pokémon (Gen I–IV, without scaling): ⌊base EXP × level / 7⌋, ×1.5 against a trainer. */
export function expYield(baseExp: number, level: number, trainer: boolean): number {
  const exp = Math.floor((baseExp * level) / 7);
  return Math.max(1, trainer ? Math.floor(exp * 1.5) : exp);
}

export const STAT_NAMES: Record<BattleStat, string> = {
  atk: "Attack",
  def: "Defense",
  spa: "Sp. Atk",
  spd: "Sp. Def",
  spe: "Speed",
  acc: "accuracy",
  eva: "evasiveness",
};
