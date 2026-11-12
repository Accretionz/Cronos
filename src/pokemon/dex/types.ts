import type { Rarity } from "../species";

/**
 * The shapes the rest of the app uses for Pokémon game data. Everything from PokéAPI is
 * turned into these (dex/parse.ts), so features never touch raw API JSON.
 */

/** The six stats, in game order. */
export type StatId = "hp" | "atk" | "def" | "spa" | "spd" | "spe";
export const STAT_IDS: readonly StatId[] = ["hp", "atk", "def", "spa", "spd", "spe"];
export const STAT_LABELS: Record<StatId, string> = { hp: "HP", atk: "Attack", def: "Defense", spa: "Sp. Atk", spd: "Sp. Def", spe: "Speed" };
export const STAT_SHORT: Record<StatId, string> = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };
export type Stats = Record<StatId, number>;

/** PokéAPI's names for the six experience curves. */
export type GrowthRate = "slow" | "medium" | "fast" | "medium-slow" | "slow-then-very-fast" | "fast-then-very-slow";

export type MoveCategory = "physical" | "special" | "status";

export interface AbilityRef {
  /** PokéAPI name, e.g. "static". */
  slug: string;
  name: string;
  hidden: boolean;
  slot: number;
}

export interface LearnsetEntry {
  move: string;
  level: number;
}

/** Everything about a species that doesn't change between individual Pokémon. */
export interface SpeciesData {
  dex: number;
  slug: string;
  name: string;
  /** "Mouse Pokémon" */
  genus: string;
  /** Latest English Pokédex entry. */
  flavor: string;
  types: string[];
  baseStats: Stats;
  /** Effort values given when defeated (for battles later). */
  evYield: Stats;
  abilities: AbilityRef[];
  growthRate: GrowthRate;
  /** Base EXP given when defeated (for battles later). */
  baseExp: number;
  captureRate: number;
  baseHappiness: number;
  /** In eighths female: -1 = genderless, 0 = always male, 8 = always female. */
  genderRate: number;
  /** Meters and kilograms. */
  height: number;
  weight: number;
  rarity: Rarity;
  generation: number;
  evolutionChainId: number | null;
  /** Level-up moves from the newest game that has them. */
  learnset: LearnsetEntry[];
  /** Which game the learnset comes from, e.g. "scarlet-violet". */
  learnsetVersion: string | null;
  /** Moves it can learn other ways (TM, egg, tutor) in that game. */
  otherMoves: string[];
}

export interface MoveData {
  id: number;
  slug: string;
  name: string;
  type: string;
  category: MoveCategory;
  /** null for moves with no fixed power (status moves, OHKO, variable power). */
  power: number | null;
  /** null means it never misses. */
  accuracy: number | null;
  pp: number;
  priority: number;
  /** Short English description, with the effect chance filled in. */
  effect: string;
  effectChance: number | null;
  /** e.g. "selected-pokemon", "all-opponents", "user". */
  target: string;
  /** Battle effects. Missing on data cached before battles existed (treat as plain damage). */
  meta?: MoveMeta;
}

/** Stats that battle stages apply to (accuracy and evasion are battle-only). */
export type BattleStat = "atk" | "def" | "spa" | "spd" | "spe" | "acc" | "eva";

/** What a move does beyond its power, from PokéAPI's move "meta" (see battle/). */
export interface MoveMeta {
  /**
   * PokéAPI's effect category: "damage", "ailment", "net-good-stats", "heal", "damage+ailment",
   * "swagger", "damage+lower", "damage+raise", "damage+heal", "ohko", "whole-field-effect",
   * "field-effect", "force-switch", "unique".
   */
  category: string;
  /** "paralysis", "burn", "poison", "sleep", "freeze", "confusion"… or null. */
  ailment: string | null;
  /** Percent; 0 on status moves means it always applies (if the move hits). */
  ailmentChance: number;
  flinchChance: number;
  /** Extra critical-hit stages. */
  critRate: number;
  /** Percent of damage dealt: positive heals the user, negative is recoil. */
  drain: number;
  /** Percent of the user's max HP healed (negative: lost). */
  healing: number;
  minHits: number | null;
  maxHits: number | null;
  /** Percent chance for statChanges on damaging moves (0 = always). */
  statChance: number;
  statChanges: { stat: BattleStat; change: number }[];
}

export const GENDER_SYMBOL = { male: "♂", female: "♀", genderless: "" } as const;
export type Gender = keyof typeof GENDER_SYMBOL;
