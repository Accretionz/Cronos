import type { ItemStore } from "../core";
import { getSpecies } from "./dex/api";
import { OWNED_POKEMON, type OwnedPokemon } from "./owned";

/**
 * Owned Pokémon carry a few species facts so levels work offline (types, growth rate).
 * Pokémon saved before a fact existed get it here from PokéAPI (cached), quietly.
 * Safe to run any time; skips what's already filled and retries next start if offline.
 */
export async function fillSpeciesFacts(store: ItemStore): Promise<number> {
  const missing = (store.query({ type: OWNED_POKEMON }) as OwnedPokemon[]).filter((p) => !p.data.growthRate);
  let filled = 0;
  for (const dex of [...new Set(missing.map((p) => p.data.dex))]) {
    let growthRate;
    try {
      growthRate = (await getSpecies(dex)).growthRate;
    } catch {
      continue; // offline: try again next time
    }
    for (const p of missing.filter((x) => x.data.dex === dex)) {
      const current = store.get(p.id) as OwnedPokemon | undefined;
      if (!current || current.data.growthRate) continue;
      await store.putQuietly({ ...current, data: { ...current.data, growthRate }, updatedAt: new Date().toISOString() });
      filled++;
    }
  }
  return filled;
}
