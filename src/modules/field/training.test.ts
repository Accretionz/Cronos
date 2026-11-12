import { describe, expect, it } from "vitest";
import { POKEMON_XP, expByPokemon, pokemonLevel, type PokemonXpEntry } from "../../pokemon/levels";
import { OWNED_POKEMON, newOwnedPokemon, type OwnedPokemon } from "../../pokemon/owned";
import { addToTeam } from "../../pokemon/team";
import { makeStore, settle } from "../../test/helpers";
import { startLedger } from "../game/ledger";
import { startTraining } from "./training";

// Integration test: the Level module's XP ledger feeding team training.
async function setup() {
  const ctx = await makeStore();
  const notes: string[] = [];
  ctx.bus.on("app.notify", ({ text }) => notes.push(text));
  startLedger(ctx.bus, ctx.store);
  startTraining(ctx.bus, ctx.store);
  const make = async (name: string) =>
    (await ctx.store.create(newOwnedPokemon({ dex: 25, name, types: ["electric"], rarity: "common", shiny: false }, [], "test"))) as OwnedPokemon;
  const xpOf = () => expByPokemon(ctx.store.query({ type: POKEMON_XP }) as PokemonXpEntry[]);
  return { ...ctx, notes, make, xpOf };
}

describe("team training", () => {
  it("team members earn the player's XP; others don't", async () => {
    const { bus, store, make, xpOf } = await setup();
    const a = await make("Pikachu");
    const b = await make("Eevee");
    await addToTeam(store, a);
    bus.emit("xp.award", { key: "daily:x:2026-10-21", amount: 25, reason: "Run", source: "dailies" });
    await settle();
    expect(xpOf().get(a.id)).toBe(250); // 25 XP × 10 EXP per XP
    expect(xpOf().get(b.id)).toBeUndefined();
  });

  it("the same award never counts twice, and un-checking takes it back", async () => {
    const { bus, store, make, xpOf } = await setup();
    const a = await make("Pikachu");
    await addToTeam(store, a);
    const award = { key: "daily:x:2026-10-21", amount: 25, reason: "Run", source: "dailies" };
    bus.emit("xp.award", award);
    bus.emit("xp.award", award);
    await settle();
    expect(xpOf().get(a.id)).toBe(250);
    bus.emit("xp.revoke", { key: award.key });
    await settle();
    expect(xpOf().get(a.id) ?? 0).toBe(0);
  });

  it("a quick check-uncheck-check ends with exactly one award", async () => {
    const { bus, store, make, xpOf } = await setup();
    const a = await make("Pikachu");
    await addToTeam(store, a);
    const award = { key: "daily:x:2026-10-21", amount: 50, reason: "Run", source: "dailies" };
    bus.emit("xp.award", award);
    bus.emit("xp.revoke", { key: award.key });
    bus.emit("xp.award", award);
    bus.emit("xp.revoke", { key: award.key });
    bus.emit("xp.award", award);
    await settle();
    await settle();
    expect(xpOf().get(a.id)).toBe(500);
  });

  it("announces level-ups", async () => {
    const { bus, store, make, notes, xpOf } = await setup();
    const a = await make("Sparky");
    await addToTeam(store, a);
    bus.emit("xp.award", { key: "big", amount: 80, reason: "Big day", source: "test" });
    await settle();
    // 80 XP → 800 EXP; Medium Fast from Lv. 5 (125 EXP) to 925 EXP is Lv. 9 (729-999).
    expect(pokemonLevel(xpOf().get(a.id)!).level).toBe(9);
    expect(notes).toContain("Sparky grew to Lv. 9!");
    expect((store.query({ type: OWNED_POKEMON }) as OwnedPokemon[]).length).toBe(1);
  });
});
