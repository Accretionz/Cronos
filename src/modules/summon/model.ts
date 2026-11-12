import type { Item } from "../../core";
import type { Rarity } from "../../pokemon/species";

/** One saved summon (a log entry). The Pokémon you get is a separate "pokemon" item (see src/pokemon/owned.ts). */
export const SUMMON = "pokemon-summon";

export interface SummonData extends Record<string, unknown> {
  dex: number;
  name: string;
  types: string[];
  rarity: Rarity;
  shiny: boolean;
  /** Which machine it came from (missing on summons from before there were machines). */
  machine?: string;
  /** What it cost in Gacha Points. */
  cost?: number;
}

export type Summon = Item<SummonData>;

export interface SummonStats {
  total: number;
  /** Different Pokémon seen at least once. */
  unique: number;
  shinies: number;
}

export function summonStats(summons: Summon[]): SummonStats {
  return {
    total: summons.length,
    unique: new Set(summons.map((s) => s.data.dex)).size,
    shinies: summons.filter((s) => s.data.shiny).length,
  };
}

/** Newest first. */
export function recentSummons(summons: Summon[], limit: number): Summon[] {
  return [...summons]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .slice(0, limit);
}

/** Poké Ball designs drawn by BallArt. */
export type BallKind = "poke" | "great" | "ultra" | "master" | "premier" | "luxury";
