import { describe, expect, it } from "vitest";
import { makeStore } from "../test/helpers";
import {
  FIELD_CAPACITY,
  OWNED_POKEMON,
  displayName,
  ensureOwned,
  homeForNewPokemon,
  inField,
  newOwnedPokemon,
  setHome,
  setNickname,
  upgradeOwned,
  type OwnedPokemon,
  type PokemonSpeciesFields,
} from "./owned";

const pika: PokemonSpeciesFields = { dex: 25, name: "Pikachu", types: ["electric"], rarity: "common", shiny: false };
const summon = (id: string, at: string, dex = 25) => ({ id, createdAt: at, data: { ...pika, dex } });
const owned = (store: Awaited<ReturnType<typeof makeStore>>["store"]) => store.query({ type: OWNED_POKEMON }) as OwnedPokemon[];

describe("owned Pokémon", () => {
  it("new Pokémon go to the field until it's full", async () => {
    const { store } = await makeStore();
    for (let i = 0; i < FIELD_CAPACITY + 2; i++) await store.create(newOwnedPokemon(pika, owned(store), "summon", `s${i}`));
    const all = owned(store);
    expect(inField(all).length).toBe(FIELD_CAPACITY);
    expect(all.filter((p) => p.data.home === "storage").length).toBe(2);
    expect(homeForNewPokemon(all)).toBe("storage");
  });

  it("ensureOwned creates one Pokémon per past summon, once, newest into the field first", async () => {
    const { store, events } = await makeStore();
    const records = Array.from({ length: FIELD_CAPACITY + 3 }, (_, i) => summon(`s${i}`, `2026-10-${String(1 + (i % 28)).padStart(2, "0")}T${String(10 + Math.floor(i / 28)).padStart(2, "0")}:00:00Z`));
    expect(await ensureOwned(store, "summon", records)).toBe(records.length);
    expect(await ensureOwned(store, "summon", records)).toBe(0); // idempotent
    const all = owned(store);
    expect(all.length).toBe(records.length);
    expect(inField(all).length).toBe(FIELD_CAPACITY);
    const oldest = all.find((p) => p.data.sourceId === "s0")!;
    expect(oldest.data.home).toBe("storage");
    expect(oldest.createdAt).toBe(records[0].createdAt); // keeps when it was obtained
    expect(events.filter((e) => e.name === "item.created").length).toBe(0); // quiet: not a user action
  });

  it("ensureOwned skips summons that already have their Pokémon", async () => {
    const { store } = await makeStore();
    await store.create(newOwnedPokemon(pika, [], "summon", "s1"));
    expect(await ensureOwned(store, "summon", [summon("s1", "2026-10-01T00:00:00Z"), summon("s2", "2026-10-02T00:00:00Z")])).toBe(1);
    expect(owned(store).length).toBe(2);
  });

  it("moves between field and storage, respecting capacity", async () => {
    const { store } = await makeStore();
    for (let i = 0; i < FIELD_CAPACITY + 1; i++) await store.create(newOwnedPokemon(pika, owned(store), "summon", `s${i}`));
    const stored = owned(store).find((p) => p.data.home === "storage")!;
    expect(await setHome(store, stored, "field")).toBe(false);
    const out = inField(owned(store))[0];
    expect(await setHome(store, out, "storage")).toBe(true);
    expect(await setHome(store, store.get(stored.id) as OwnedPokemon, "field")).toBe(true);
    expect((store.get(stored.id) as OwnedPokemon).data.home).toBe("field");
  });

  it("nicknames", async () => {
    const { store } = await makeStore();
    const p = (await store.create(newOwnedPokemon(pika, [], "summon"))) as OwnedPokemon;
    await setNickname(store, p, "  Sparky  ");
    const named = store.get(p.id) as OwnedPokemon;
    expect([displayName(named), named.title]).toEqual(["Sparky", "Sparky"]);
    await setNickname(store, named, "");
    const cleared = store.get(p.id) as OwnedPokemon;
    expect([displayName(cleared), "nickname" in cleared.data]).toEqual(["Pikachu", false]);
  });

  it("upgradeOwned fills gaps and leaves current items alone", () => {
    const base = { id: "x", type: OWNED_POKEMON, title: "Eevee", status: "open" as const, tags: [], createdAt: "", updatedAt: "" };
    const old = upgradeOwned({ ...base, data: { dex: 133 } })!;
    const { pid, ivs, evs, ...rest } = old.data as Record<string, unknown>;
    expect(rest).toEqual({ dex: 133, name: "Eevee", types: [], rarity: "common", shiny: false, home: "storage", source: "unknown" });
    expect([typeof pid, Object.keys(ivs as object).length, Object.values(evs as object).every((v) => v === 0)]).toEqual(["number", 6, true]);
    expect(upgradeOwned({ ...base, data: { dex: 133 } })!.data).toEqual(old.data); // same id → same IVs every time
    expect(upgradeOwned(old)).toBe(old);
    expect(upgradeOwned({ ...base, data: { nope: true } })).toBeNull();
  });
});
