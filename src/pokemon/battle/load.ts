import { getMove, getSpecies } from "../dex/api";
import { defaultMoveset } from "../dex/moves";
import { natureOf, rollIndividual } from "../dex/individual";
import type { MoveData } from "../dex/types";
import { pokemonLevel } from "../levels";
import { displayName, individualOf, type OwnedPokemon } from "../owned";
import { COMMON_DEX } from "../rarity";
import { makeBattler } from "./build";
import type { Rng } from "./rng";
import type { Battler } from "./types";

/**
 * Turning Pokémon into battlers: loads species and move data (from the cache, or PokéAPI),
 * works out level, stats and moves. The only part of battle/ that waits on the network.
 */

/** The moves a Pokémon knows at its level (the latest four level-up moves). Moves that fail to load are left out. */
async function movesFor(learnset: { move: string; level: number }[], level: number): Promise<MoveData[]> {
  const slugs = defaultMoveset(learnset, level);
  const loaded = await Promise.allSettled(slugs.map((s) => getMove(s)));
  const moves = loaded.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (moves.length) return moves;
  // Nothing known (or nothing loaded): every Pokémon can at least Tackle.
  return [await getMove("tackle")];
}

/** One of your Pokémon, at full health, with its current level, IVs, EVs and nature. */
export async function loadOwnedBattler(p: OwnedPokemon, gainedExp: number): Promise<Battler> {
  const species = await getSpecies(p.data.dex);
  const level = pokemonLevel(gainedExp, species.growthRate ?? p.data.growthRate).level;
  const { pid, ivs, evs } = individualOf(p);
  return makeBattler({
    key: `p:${p.id}`,
    ownedId: p.id,
    name: displayName(p),
    species,
    level,
    ivs,
    evs,
    nature: natureOf(pid),
    shiny: p.data.shiny,
    moves: await movesFor(species.learnset, level),
  });
}

/** A wild Pokémon: random individual (from the battle's RNG), wild moveset. */
export async function loadWildBattler(dex: number, level: number, rng: Rng, key = "w:0"): Promise<Battler> {
  const species = await getSpecies(dex);
  const ind = rollIndividual(() => Math.floor(rng.next() * 2 ** 32) >>> 0);
  return makeBattler({
    key,
    name: species.name,
    species,
    level,
    ivs: ind.ivs,
    evs: ind.evs,
    nature: natureOf(ind.pid),
    shiny: rng.chance(1 / 4096),
    moves: await movesFor(species.learnset, level),
  });
}

/** A wild encounter for a team: a random non-legendary near the team's average level. */
export function pickWildEncounter(teamLevels: number[], rng: Rng): { dex: number; level: number } {
  const avg = teamLevels.length ? teamLevels.reduce((a, b) => a + b, 0) / teamLevels.length : 5;
  const level = Math.max(2, Math.min(100, Math.round(avg) + rng.int(-2, 1)));
  return { dex: COMMON_DEX[Math.floor(rng.next() * COMMON_DEX.length)], level };
}
