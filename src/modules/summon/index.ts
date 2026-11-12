import type { AppModule } from "../../core";
import { POINTS_ENTRY, ensureOwned, startWallet } from "../../pokemon";
import { SUMMON, type Summon } from "./model";
import { SummonPage } from "./SummonPage";
import { PointsWidget } from "./PointsWidget";

/**
 * Pokémon gacha. Five machines (machines.ts) cost Gacha Points, which dailies award.
 * Each summon writes a "pokemon-summon" log entry and a "pokemon" (the Pokémon you own).
 * This module also runs the wallet (src/pokemon/wallet.ts) that records points.
 * Pokémon data and sprites come from PokéAPI (https://pokeapi.co) at runtime.
 */
export const summonModule: AppModule = {
  id: "summon",
  name: "Summon",
  icon: "⊖",
  description: "Spend Gacha Points on Pokémon summons.",
  itemTypes: [SUMMON, POINTS_ENTRY],
  page: SummonPage,
  widgets: [{ id: "points", title: "Gacha Points", component: PointsWidget, order: 5, slot: "stat" }],
  init({ bus, store }) {
    // Summons made before owned Pokémon existed (or interrupted mid-save) get their Pokémon now.
    void ensureOwned(store, "summon", store.query({ type: SUMMON }) as Summon[]).catch((err) =>
      console.error("[summon] couldn't add Pokémon from past summons", err),
    );
    return startWallet(bus, store);
  },
};
