import type { AppModule } from "../../core";
import { OWNED_POKEMON, POKEMON_XP, fillSpeciesFacts, upgradeOwned } from "../../pokemon";
import { startTraining } from "./training";
import { FieldPage } from "./FieldPage";

/**
 * The Field: an interactive meadow where your Pokémon roam. The game engine is in ./engine
 * (map, pathfinding, behaviors, camera, renderer), separate from the React page, so new
 * maps, behaviors and activities can be added without touching the UI.
 * Owns the "pokemon" item type (your Pokémon, src/pokemon/owned.ts) and "pokemon-xp"
 * (their XP, src/pokemon/levels.ts). Runs team training (./training.ts).
 */
export const fieldModule: AppModule = {
  id: "field",
  name: "Field",
  icon: "✿",
  description: "Watch your Pokémon roam a meadow and interact with them.",
  itemTypes: [OWNED_POKEMON, POKEMON_XP],
  page: FieldPage,
  upgradeItem: (item) => (item.type === OWNED_POKEMON ? upgradeOwned(item) : null),
  init({ bus, store }) {
    // Pokémon saved before growth rates existed get theirs from the Pokédex (in the background).
    void fillSpeciesFacts(store).catch((err) => console.error("[field] couldn't fill species facts", err));
    // Pokémon on your team earn EXP whenever you earn XP.
    return startTraining(bus, store);
  },
};
