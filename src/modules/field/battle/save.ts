import type { EventBus, ItemStore } from "../../../core";
import { addEvs, type BattleRewards } from "../../../pokemon/battle";
import { POKEMON_XP, expByPokemon, pokemonLevel, pokemonXpId, type PokemonXpData, type PokemonXpEntry } from "../../../pokemon/levels";
import { individualOf, type OwnedPokemon } from "../../../pokemon/owned";
import { announceLevelUp } from "../training";

/**
 * Save what a battle earned: EXP (as "pokemon-xp" entries keyed by the battle, so it's
 * counted once even if this runs twice) and effort values on each Pokémon. Announces
 * level-ups and new moves the same way team training does.
 */
export async function saveBattleRewards(store: ItemStore, bus: EventBus, battleId: string, rewards: BattleRewards): Promise<void> {
  const before = expByPokemon(store.query({ type: POKEMON_XP }) as PokemonXpEntry[]);
  const key = `battle:${battleId}`;
  const now = new Date().toISOString();
  for (const [ownedId, exp] of Object.entries(rewards.exp)) {
    const p = store.get(ownedId) as OwnedPokemon | undefined;
    if (!p || !(exp > 0)) continue;
    const id = pokemonXpId(ownedId, key);
    if (store.get(id)) continue;
    const entry: PokemonXpEntry = {
      id,
      type: POKEMON_XP,
      title: "Battle",
      status: "open",
      tags: [],
      data: { pokemonId: ownedId, key, amount: 0, exp } satisfies PokemonXpData,
      createdAt: now,
      updatedAt: now,
    };
    await store.putQuietly(entry);
    const evs = rewards.evs[ownedId];
    if (evs) await store.putQuietly({ ...p, data: { ...p.data, evs: addEvs(individualOf(p).evs, evs) }, updatedAt: now });
    const had = before.get(ownedId) ?? 0;
    const was = pokemonLevel(had, p.data.growthRate).level;
    const is = pokemonLevel(had + exp, p.data.growthRate).level;
    if (is > was) announceLevelUp(bus, p, was, is);
  }
}
