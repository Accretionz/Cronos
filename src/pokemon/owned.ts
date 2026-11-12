import type { Item, ItemStore, NewItem } from "../core";
import { isGrowthRate } from "./dex/growth";
import { individualFromSeed, isStats, rollIndividual, type Individual } from "./dex/individual";
import type { GrowthRate, Stats } from "./dex/types";
import type { Rarity } from "./species";

/**
 * Pokémon the user owns. One item per Pokémon (two Pikachu = two items), separate from
 * how it was obtained (e.g. the "pokemon-summon" log). Features that work with "your
 * Pokémon" (the Field, and later a team, battles, evolutions...) read these items.
 *
 * Grow it by adding optional fields to `data` (level, friendship, held item...) and,
 * when a field changes shape, an upgrade step in `upgradeOwned`.
 */
export const OWNED_POKEMON = "pokemon";

/** Where an owned Pokémon is: roaming the field, or resting in storage. */
export type PokemonHome = "field" | "storage";

/** How many Pokémon can be out in the field at once. */
export const FIELD_CAPACITY = 24;

/** The species facts every owned Pokémon carries (copied in, so it works offline). */
export interface PokemonSpeciesFields {
  dex: number;
  /** Species name, e.g. "Mr. Mime". */
  name: string;
  types: string[];
  rarity: Rarity;
  shiny: boolean;
}

export interface OwnedPokemonData extends PokemonSpeciesFields, Record<string, unknown> {
  /** Optional name the user gives it. */
  nickname?: string;
  home: PokemonHome;
  /** How it was obtained, e.g. "summon". */
  source: string;
  /** The record it came from (e.g. the summon), so it's never created twice. */
  sourceId?: string;
  /** 0..5 when it's on the team (see team.ts). */
  teamSlot?: number;
  /** Its species' EXP curve (from PokéAPI). Filled in by fillSpeciesFacts() if missing. */
  growthRate?: GrowthRate;
  /** Personality value: decides nature, gender and ability (see dex/individual.ts). */
  pid?: number;
  /** Individual values, 0-31 per stat, fixed for life. */
  ivs?: Stats;
  /** Effort values, earned in battle (0 for now). */
  evs?: Stats;
}

export type OwnedPokemon = Item<OwnedPokemonData>;

export function displayName(p: OwnedPokemon): string {
  return p.data.nickname?.trim() || p.data.name;
}

export const inField = (all: OwnedPokemon[]) => all.filter((p) => p.data.home === "field");
export const inStorage = (all: OwnedPokemon[]) => all.filter((p) => p.data.home !== "field");

/** New Pokémon join the field while there's room, otherwise they go to storage. */
export function homeForNewPokemon(existing: OwnedPokemon[]): PokemonHome {
  return inField(existing).length < FIELD_CAPACITY ? "field" : "storage";
}

/** Its PID, IVs and EVs (made up from its id, consistently, if it predates them). */
export function individualOf(p: OwnedPokemon): Individual {
  const seeded = individualFromSeed(p.id);
  return {
    pid: typeof p.data.pid === "number" ? p.data.pid >>> 0 : seeded.pid,
    ivs: isStats(p.data.ivs) ? p.data.ivs : seeded.ivs,
    evs: isStats(p.data.evs) ? p.data.evs : seeded.evs,
  };
}

/** The item to create for a newly obtained Pokémon. Rolls its PID and IVs unless given. */
export function newOwnedPokemon(
  species: PokemonSpeciesFields,
  existing: OwnedPokemon[],
  source: string,
  sourceId?: string,
  extra: { growthRate?: GrowthRate; individual?: Individual } = {},
): NewItem<OwnedPokemonData> {
  const { dex, name, types, rarity, shiny } = species;
  const { pid, ivs, evs } = extra.individual ?? rollIndividual();
  return {
    type: OWNED_POKEMON,
    title: name,
    data: {
      dex, name, types: [...types], rarity, shiny, home: homeForNewPokemon(existing), source, sourceId,
      ...(extra.growthRate ? { growthRate: extra.growthRate } : {}),
      pid, ivs, evs,
    },
  };
}

/** Stable id for a Pokémon made from a source record, so two tabs can't create it twice. */
export const ownedIdFor = (source: string, sourceId: string) => `pokemon:${source}:${sourceId}`;

/**
 * Make sure every source record (e.g. each summon) has its owned Pokémon. Creates the
 * missing ones quietly (it's a data upgrade, not something the user did). The newest
 * fill free field spots first. Safe to run any number of times. Returns how many it made.
 */
export async function ensureOwned(
  store: ItemStore,
  source: string,
  records: { id: string; createdAt: string; data: PokemonSpeciesFields }[],
): Promise<number> {
  const owned = store.query({ type: OWNED_POKEMON }) as OwnedPokemon[];
  const done = new Set(owned.filter((p) => p.data.source === source).map((p) => p.data.sourceId));
  const missing = records
    .filter((r) => !done.has(r.id) && !store.get(ownedIdFor(source, r.id)))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  let free = FIELD_CAPACITY - inField(owned).length;
  const now = new Date().toISOString();
  for (const r of missing) {
    const { dex, name, types, rarity, shiny } = r.data;
    const item: OwnedPokemon = {
      id: ownedIdFor(source, r.id),
      type: OWNED_POKEMON,
      title: name,
      status: "open",
      tags: [],
      data: {
        dex, name, types: [...(types ?? [])], rarity, shiny: Boolean(shiny), home: free-- > 0 ? "field" : "storage", source, sourceId: r.id,
        ...individualFromSeed(ownedIdFor(source, r.id)),
      },
      createdAt: r.createdAt,
      updatedAt: now,
    };
    await store.putQuietly(item);
  }
  return missing.length;
}

/** Move a Pokémon between the field and storage. Returns false if the field is full. */
export async function setHome(store: ItemStore, p: OwnedPokemon, home: PokemonHome): Promise<boolean> {
  if (p.data.home === home) return true;
  if (home === "field") {
    const fieldCount = inField(store.query({ type: OWNED_POKEMON }) as OwnedPokemon[]).length;
    if (fieldCount >= FIELD_CAPACITY) return false;
  }
  const data: OwnedPokemonData = { ...p.data, home };
  if (home === "storage") delete data.teamSlot; // the team is always out in the field
  await store.update(p.id, { data });
  return true;
}

export async function setNickname(store: ItemStore, p: OwnedPokemon, nickname: string): Promise<void> {
  const clean = nickname.trim().slice(0, 24);
  const data: OwnedPokemonData = { ...p.data };
  if (clean && clean !== p.data.name) data.nickname = clean;
  else delete data.nickname;
  await store.update(p.id, { title: clean || p.data.name, data });
}

/** Fill in fields older records may lack. Returns the item unchanged when it's current. */
export function upgradeOwned(item: Item): Item | null {
  const d = item.data as Partial<OwnedPokemonData>;
  if (typeof d.dex !== "number") return null; // not something we can fix
  const home: PokemonHome = d.home === "field" ? "field" : "storage";
  const fixed = {
    ...d,
    name: typeof d.name === "string" && d.name ? d.name : item.title || `#${d.dex}`,
    types: Array.isArray(d.types) ? d.types : [],
    rarity: d.rarity === "legendary" || d.rarity === "mythical" ? d.rarity : "common",
    shiny: Boolean(d.shiny),
    home,
    source: typeof d.source === "string" ? d.source : "unknown",
    // Pokémon from before individual values existed get theirs now, derived from their id.
    ...individualOf(item as OwnedPokemon),
  };
  if (d.growthRate !== undefined && !isGrowthRate(d.growthRate)) delete (fixed as Partial<OwnedPokemonData>).growthRate;
  const same = Object.keys(fixed).every((k) => JSON.stringify((fixed as Record<string, unknown>)[k]) === JSON.stringify((d as Record<string, unknown>)[k]));
  return same ? item : { ...item, data: fixed };
}
