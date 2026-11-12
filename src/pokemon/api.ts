import { getSpecies } from "./dex/api";
import type { PokemonInfo } from "./species";

/** Name, types and rarity for a National Dex number (from the cached Pokédex data; see dex/api.ts). */
export async function fetchPokemon(dex: number): Promise<PokemonInfo> {
  const s = await getSpecies(dex);
  return { dex: s.dex, name: s.name, types: s.types, rarity: s.rarity, generation: s.generation };
}

/** Start downloading an image and resolve once it's ready (or failed), so the reveal doesn't show a blank. */
export function preloadImage(url: string, timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(false), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}
