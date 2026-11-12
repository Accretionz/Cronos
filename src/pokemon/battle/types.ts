import type { BattleStat, GrowthRate, MoveCategory, MoveMeta, Stats } from "../dex/types";

/**
 * The battle system's data. Everything here is plain JSON (no classes, no functions), so a
 * battle can be saved mid-fight, sent between devices, or replayed from its seed later.
 */

/** 0 = the player's side, 1 = the opponent's. */
export type SideIndex = 0 | 1;

export type MajorStatus = "brn" | "par" | "psn" | "tox" | "slp" | "frz";

export const STATUS_LABEL: Record<MajorStatus, string> = { brn: "BRN", par: "PAR", psn: "PSN", tox: "PSN", slp: "SLP", frz: "FRZ" };

/** A move as it's used in battle: its data plus how many uses are left. */
export interface BattleMove {
  slug: string;
  name: string;
  type: string;
  category: MoveCategory;
  power: number | null;
  accuracy: number | null;
  priority: number;
  target: string;
  meta: MoveMeta;
  pp: number;
  maxPp: number;
}

export type Stages = Record<BattleStat, number>;

/** One Pokémon in a battle. */
export interface Battler {
  /** Unique within the battle. */
  key: string;
  /** The owned Pokémon it is, for the player's side (rewards go here). */
  ownedId?: string;
  dex: number;
  /** What the battle calls it (nickname or species name). */
  name: string;
  species: string;
  shiny: boolean;
  types: string[];
  level: number;
  /** Calculated stats (HP is the maximum). */
  stats: Stats;
  hp: number;
  moves: BattleMove[];
  status: MajorStatus | null;
  /** Sleep turns left, or the badly-poisoned counter. */
  statusTurns: number;
  stages: Stages;
  /** Effects that end when it leaves the field. */
  volatile: { confusion?: number; flinch?: boolean };
  /** For rewards when it's defeated. */
  baseExp: number;
  evYield: Stats;
  growthRate: GrowthRate;
}

export interface BattleSide {
  name: string;
  battlers: Battler[];
  /** Index of the one on the field. */
  active: number;
}

export type BattleKind = "wild" | "trainer";

export type BattleOutcome = "win" | "lose" | "run";

export interface BattleState {
  id: string;
  kind: BattleKind;
  turn: number;
  /** RNG state: the same state + the same choices = the same battle. */
  seed: number;
  sides: [BattleSide, BattleSide];
  /** The player must send in another Pokémon before the next turn. */
  needsSwitch: boolean;
  outcome: BattleOutcome | null;
  escapeAttempts: number;
  /** For each opponent (by key), the player's Pokémon that fought it (EXP is shared among them). */
  faced: Record<string, string[]>;
}

export type BattleAction =
  | { kind: "move"; index: number }
  | { kind: "switch"; index: number }
  | { kind: "run" };

/**
 * What happened, in order. Every event has `text` for the battle log; the rest is for
 * drawing (HP bars, animations). A turn's result is a list of these.
 */
export type BattleEvent = { text: string } & (
  | { t: "turn"; turn: number }
  | { t: "move"; side: SideIndex; move: string; type: string }
  | { t: "miss"; side: SideIndex }
  | { t: "damage"; side: SideIndex; amount: number; hp: number; maxHp: number; effectiveness: number; crit: boolean }
  | { t: "heal"; side: SideIndex; amount: number; hp: number; maxHp: number }
  | { t: "status"; side: SideIndex; status: MajorStatus | null }
  | { t: "stat"; side: SideIndex; stat: BattleStat; change: number }
  | { t: "cant"; side: SideIndex }
  | { t: "faint"; side: SideIndex }
  | { t: "switch"; side: SideIndex; index: number; hp: number; maxHp: number }
  | { t: "info" }
  | { t: "end"; outcome: BattleOutcome }
);

export interface BattleRewards {
  /** EXP for each of the player's Pokémon (by owned id). */
  exp: Record<string, number>;
  /** Effort values earned, by owned id. */
  evs: Record<string, Stats>;
}
