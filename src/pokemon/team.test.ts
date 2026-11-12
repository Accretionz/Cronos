import { describe, expect, it } from "vitest";
import { makeStore } from "../test/helpers";
import { START_LEVEL, pokemonLevel } from "./levels";
import { FIELD_CAPACITY, OWNED_POKEMON, newOwnedPokemon, setHome, type OwnedPokemon, type PokemonSpeciesFields } from "./owned";
import { TEAM_SIZE, addToTeam, onTeam, removeFromTeam, teamOf } from "./team";

const eevee: PokemonSpeciesFields = { dex: 133, name: "Eevee", types: ["normal"], rarity: "common", shiny: false };
type Store = Awaited<ReturnType<typeof makeStore>>["store"];
const owned = (store: Store) => store.query({ type: OWNED_POKEMON }) as OwnedPokemon[];
const fresh = (store: Store, id: string) => store.get(id) as OwnedPokemon;

describe("Pokémon levels", () => {
  it("start at Lv. 5 on the species' own EXP curve", () => {
    expect(pokemonLevel(0)).toEqual({ level: START_LEVEL, exp: 125, into: 0, needed: 91, toNext: 91 }); // Medium Fast: 5³ → 6³
    expect(pokemonLevel(0, "slow").exp).toBe(156);
    expect(pokemonLevel(90).level).toBe(5);
    expect(pokemonLevel(91).level).toBe(6);
    expect(pokemonLevel(1_000_000 - 125).level).toBe(100);
    expect(pokemonLevel(10_000_000, "fast-then-very-slow")).toEqual({ level: 100, exp: 10_000_065, into: 0, needed: 0, toNext: 0 });
  });
});

describe("team", () => {
  it("holds six, in slot order, and refills the first free slot", async () => {
    const { store } = await makeStore();
    for (let i = 0; i < 8; i++) await store.create(newOwnedPokemon(eevee, owned(store), "test", `s${i}`));
    const all = owned(store);
    for (let i = 0; i < TEAM_SIZE; i++) expect(await addToTeam(store, fresh(store, all[i].id))).toBe("added");
    expect(await addToTeam(store, fresh(store, all[6].id))).toBe("team-full");
    expect(await addToTeam(store, fresh(store, all[0].id))).toBe("already");
    await removeFromTeam(store, fresh(store, all[2].id));
    expect(await addToTeam(store, fresh(store, all[7].id))).toBe("added");
    const team = teamOf(owned(store));
    expect(team.map((p) => p.data.teamSlot)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(team[2].id).toBe(all[7].id);
  });

  it("joining brings a Pokémon out of storage; storage takes it off the team", async () => {
    const { store } = await makeStore();
    for (let i = 0; i < FIELD_CAPACITY + 1; i++) await store.create(newOwnedPokemon(eevee, owned(store), "test", `s${i}`));
    const stored = owned(store).find((p) => p.data.home === "storage")!;
    expect(await addToTeam(store, stored)).toBe("field-full");
    const someone = owned(store).find((p) => p.data.home === "field")!;
    await setHome(store, someone, "storage");
    expect(await addToTeam(store, fresh(store, stored.id))).toBe("added");
    expect(fresh(store, stored.id).data.home).toBe("field");
    await setHome(store, fresh(store, stored.id), "storage");
    expect(onTeam(fresh(store, stored.id))).toBe(false);
  });
});
