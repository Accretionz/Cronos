import { useItems, type Item } from "../core";
import { DEFAULT_GROWTH_RATE, expAtLevel, levelFromExp, type LevelProgress } from "./dex/growth";
import type { GrowthRate } from "./dex/types";

/**
 * Pokémon levels use the real EXP curves (dex/growth.ts), so a Slow Pokémon needs
 * 1,250,000 EXP for Lv. 100 and a Fast one 800,000, exactly as in the games.
 *
 * A Pokémon's EXP = the EXP for its starting level + everything it has gained. Gains are
 * "pokemon-xp" entries, one per thing it earned EXP for, so they're idempotent and can be
 * taken back. Battles can add entries the same way later.
 */
export const POKEMON_XP = "pokemon-xp";

/** Every Pokémon arrives at this level, like a freshly caught one. */
export const START_LEVEL = 5;

/**
 * Training: each point of XP you earn is worth this much EXP to each team member. With
 * ~150 XP a day, a Medium Fast Pokémon reaches Lv. 20 in about 5 days, Lv. 50 in about
 * 12 weeks and Lv. 100 in about 2 years.
 */
export const EXP_PER_XP = 10;

export type PokemonLevel = LevelProgress;

/** Level and progress from the EXP gained since it arrived. */
export function pokemonLevel(gainedExp: number, rate: GrowthRate = DEFAULT_GROWTH_RATE): PokemonLevel {
  return levelFromExp(rate, expAtLevel(rate, START_LEVEL) + Math.max(0, gainedExp));
}

export interface PokemonXpData extends Record<string, unknown> {
  pokemonId: string;
  /** The achievement it came from (the same key as the player's XP award). */
  key: string;
  /** The player XP it came from. */
  amount: number;
  /** EXP it gave the Pokémon (missing on entries from before real EXP curves: amount × EXP_PER_XP). */
  exp?: number;
}
export type PokemonXpEntry = Item<PokemonXpData>;

export const pokemonXpId = (pokemonId: string, key: string) => `pxp:${pokemonId}:${key}`;

export const expOfEntry = (e: PokemonXpEntry) =>
  typeof e.data.exp === "number" ? e.data.exp : Math.round((Number(e.data.amount) || 0) * EXP_PER_XP);

/** EXP gained per Pokémon id. */
export function expByPokemon(entries: PokemonXpEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) out.set(e.data.pokemonId, (out.get(e.data.pokemonId) ?? 0) + expOfEntry(e));
  return out;
}

/** Live EXP gained for every Pokémon. */
export function usePokemonExp(): Map<string, number> {
  return expByPokemon(useItems({ type: POKEMON_XP }) as PokemonXpEntry[]);
}
