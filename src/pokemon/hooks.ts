import { useItems } from "../core";
import { OWNED_POKEMON, type OwnedPokemon } from "./owned";

/** All owned Pokémon, live. Oldest first. */
export function useOwnedPokemon(): OwnedPokemon[] {
  return useItems({ type: OWNED_POKEMON }) as OwnedPokemon[];
}
