import type { EventBus, EventMap, ItemStore } from "../../core";
// Specific files rather than the library's index, so this stays free of UI code.
import { peekMove, peekSpecies } from "../../pokemon/dex/api";
import { movesLearnedBetween } from "../../pokemon/dex/moves";
import { slugToName } from "../../pokemon/dex/parse";
import { EXP_PER_XP, POKEMON_XP, expByPokemon, pokemonLevel, pokemonXpId, type PokemonXpData, type PokemonXpEntry } from "../../pokemon/levels";
import { OWNED_POKEMON, displayName, type OwnedPokemon } from "../../pokemon/owned";
import { teamOf } from "../../pokemon/team";

declare module "../../core/bus" {
  interface EventMap {
    /** A Pokémon reached a new level (later: a hook for evolution). */
    "pokemon.levelUp": { pokemonId: string; level: number; previousLevel: number };
  }
}

/**
 * Team training: whenever the player's XP is recorded, every Pokémon on the team gains
 * EXP (XP × EXP_PER_XP) on its own species' curve; when the player's XP is taken back, so is
 * theirs. Listens to the Level module's confirmed events (not the raw awards), so duplicates
 * and quick check-uncheck sequences stay in step with the player's XP.
 */
export function startTraining(bus: EventBus, store: ItemStore): () => void {
  let queue: Promise<unknown> = Promise.resolve();
  const run = (job: () => Promise<void>) => {
    queue = queue.then(job).catch((err) => console.error("[field] training error", err));
  };
  const entries = () => store.query({ type: POKEMON_XP }) as PokemonXpEntry[];

  const gained = ({ key, amount, reason }: EventMap["game.xpGained"]) =>
    run(async () => {
      if (!key || !(amount > 0)) return;
      const team = teamOf(store.query({ type: OWNED_POKEMON }) as OwnedPokemon[]);
      if (!team.length) return;
      const before = expByPokemon(entries());
      const exp = Math.round(amount * EXP_PER_XP);
      const now = new Date().toISOString();
      for (const p of team) {
        const id = pokemonXpId(p.id, key);
        if (store.get(id)) continue;
        const entry: PokemonXpEntry = {
          id,
          type: POKEMON_XP,
          title: reason,
          status: "open",
          tags: [],
          data: { pokemonId: p.id, key, amount: Math.round(amount), exp } satisfies PokemonXpData,
          createdAt: now,
          updatedAt: now,
        };
        await store.putQuietly(entry);
        const had = before.get(p.id) ?? 0;
        const was = pokemonLevel(had, p.data.growthRate).level;
        const is = pokemonLevel(had + exp, p.data.growthRate).level;
        if (is > was) announceLevelUp(bus, p, was, is);
      }
    });

  const revoked = ({ key }: EventMap["game.xpRevoked"]) =>
    run(async () => {
      for (const e of entries().filter((x) => x.data.key === key)) await store.remove(e.id);
    });

  const offGained = bus.on("game.xpGained", gained);
  const offRevoked = bus.on("game.xpRevoked", revoked);
  return () => {
    offGained();
    offRevoked();
  };
}

/** Toasts (and the levelUp event) for a Pokémon that grew, plus any moves it learned on the way. */
export function announceLevelUp(bus: EventBus, p: OwnedPokemon, was: number, is: number) {
  const name = displayName(p);
  bus.emit("pokemon.levelUp", { pokemonId: p.id, level: is, previousLevel: was });
  bus.emit("app.notify", { text: `${name} grew to Lv. ${is}!`, icon: "▲" });
  // New moves, if its learnset is already loaded (no waiting on the network here).
  const species = peekSpecies(p.data.dex);
  if (!species) return;
  for (const slug of movesLearnedBetween(species.learnset, was, is)) {
    bus.emit("app.notify", { text: `${name} learned ${peekMove(slug)?.name ?? slugToName(slug)}!`, icon: "✦" });
  }
}
