import { generationNumber } from "../species";
import { isGrowthRate } from "./growth";
import type {
  AbilityRef,
  BattleStat,
  GrowthRate,
  LearnsetEntry,
  MoveCategory,
  MoveData,
  MoveMeta,
  SpeciesData,
  StatId,
  Stats,
} from "./types";

/* The parts of PokéAPI's responses we read. Everything is optional: the API is external. */
type Named = { name: string; url?: string };
type Lang = { language: Named };
export interface ApiPokemonFull {
  id: number;
  name: string;
  base_experience?: number | null;
  height?: number;
  weight?: number;
  types?: { slot: number; type: Named }[];
  stats?: { base_stat: number; effort: number; stat: Named }[];
  abilities?: { is_hidden: boolean; slot: number; ability: Named }[];
  moves?: { move: Named; version_group_details: { level_learned_at: number; move_learn_method: Named; version_group: Named }[] }[];
}
export interface ApiSpeciesFull {
  id: number;
  name: string;
  is_legendary?: boolean;
  is_mythical?: boolean;
  generation?: Named;
  growth_rate?: Named;
  gender_rate?: number;
  capture_rate?: number;
  base_happiness?: number | null;
  evolution_chain?: { url: string } | null;
  names?: ({ name: string } & Lang)[];
  genera?: ({ genus: string } & Lang)[];
  flavor_text_entries?: ({ flavor_text: string; version?: Named } & Lang)[];
}
export interface ApiMove {
  id: number;
  name: string;
  accuracy: number | null;
  power: number | null;
  pp: number | null;
  priority: number;
  effect_chance: number | null;
  type: Named;
  damage_class: Named | null;
  target?: Named;
  names?: ({ name: string } & Lang)[];
  effect_entries?: ({ short_effect: string; effect: string } & Lang)[];
  flavor_text_entries?: ({ flavor_text: string } & Lang)[];
  meta?: {
    ailment?: Named;
    ailment_chance?: number;
    category?: Named;
    crit_rate?: number;
    drain?: number;
    flinch_chance?: number;
    healing?: number;
    max_hits?: number | null;
    min_hits?: number | null;
    max_turns?: number | null;
    min_turns?: number | null;
    stat_chance?: number;
  } | null;
  stat_changes?: { change: number; stat: Named }[];
}

/** PokéAPI stat names for battle stages (accuracy and evasion included). */
const STAGE_STAT: Record<string, BattleStat> = {
  attack: "atk",
  defense: "def",
  "special-attack": "spa",
  "special-defense": "spd",
  speed: "spe",
  accuracy: "acc",
  evasion: "eva",
};

const API_STAT: Record<string, StatId> = {
  hp: "hp",
  attack: "atk",
  defense: "def",
  "special-attack": "spa",
  "special-defense": "spd",
  speed: "spe",
};

/** Newest first. The learnset comes from the first of these the Pokémon has level-up moves in. */
export const VERSION_GROUPS = [
  "scarlet-violet", "the-teal-mask", "the-indigo-disk", "legends-arceus", "brilliant-diamond-and-shining-pearl",
  "sword-shield", "the-isle-of-armor", "the-crown-tundra", "lets-go-pikachu-lets-go-eevee", "ultra-sun-ultra-moon",
  "sun-moon", "omega-ruby-alpha-sapphire", "x-y", "black-2-white-2", "black-white", "heartgold-soulsilver",
  "platinum", "diamond-pearl", "emerald", "firered-leafgreen", "ruby-sapphire", "crystal", "gold-silver", "yellow", "red-blue",
];

/** "mr-mime" → "Mr Mime", "solar-beam" → "Solar Beam". */
export function slugToName(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const english = <T extends Lang>(list: T[] | undefined): T | undefined => list?.find((x) => x.language?.name === "en");

/** Pokédex text comes with line breaks and form feeds from the original games. */
const cleanText = (s: string) => s.replace(/[\n\f\r­]+/g, " ").replace(/\s+/g, " ").trim();

function statsFrom(list: ApiPokemonFull["stats"], pick: "base_stat" | "effort"): Stats {
  const out = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } as Stats;
  for (const s of list ?? []) {
    const id = API_STAT[s.stat?.name];
    if (id) out[id] = Number(s[pick]) || 0;
  }
  return out;
}

/** Pick the newest game with level-up moves, and split moves into its learnset and the rest. */
export function learnsetFrom(moves: ApiPokemonFull["moves"]): { version: string | null; learnset: LearnsetEntry[]; other: string[] } {
  const byVersion = new Map<string, LearnsetEntry[]>();
  for (const m of moves ?? []) {
    for (const d of m.version_group_details ?? []) {
      if (d.move_learn_method?.name !== "level-up") continue;
      const v = d.version_group?.name;
      if (!v) continue;
      if (!byVersion.has(v)) byVersion.set(v, []);
      byVersion.get(v)!.push({ move: m.move.name, level: Number(d.level_learned_at) || 0 });
    }
  }
  const version = VERSION_GROUPS.find((v) => byVersion.get(v)?.length) ?? [...byVersion.keys()][0] ?? null;
  const learnset = version ? [...byVersion.get(version)!].sort((a, b) => a.level - b.level) : [];
  const other: string[] = [];
  for (const m of moves ?? []) {
    const inVersion = m.version_group_details?.some((d) => d.version_group?.name === version && d.move_learn_method?.name !== "level-up");
    if (inVersion && !other.includes(m.move.name)) other.push(m.move.name);
  }
  return { version, learnset, other: other.sort() };
}

const chainId = (url: string | undefined) => {
  const m = url?.match(/evolution-chain\/(\d+)/);
  return m ? Number(m[1]) : null;
};

/** /pokemon/{id} + /pokemon-species/{id} → SpeciesData. */
export function parseSpecies(p: ApiPokemonFull, s: ApiSpeciesFull): SpeciesData {
  const { version, learnset, other } = learnsetFrom(p.moves);
  const flavors = (s.flavor_text_entries ?? []).filter((f) => f.language?.name === "en");
  const latestFlavor = flavors[flavors.length - 1]?.flavor_text ?? "";
  const abilities: AbilityRef[] = (p.abilities ?? [])
    .map((a) => ({ slug: a.ability.name, name: slugToName(a.ability.name), hidden: Boolean(a.is_hidden), slot: a.slot }))
    .sort((a, b) => a.slot - b.slot);
  return {
    dex: s.id ?? p.id,
    slug: s.name || p.name,
    name: english(s.names)?.name || slugToName(s.name || p.name),
    genus: english(s.genera)?.genus ?? "",
    flavor: cleanText(latestFlavor),
    types: [...(p.types ?? [])].sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
    baseStats: statsFrom(p.stats, "base_stat"),
    evYield: statsFrom(p.stats, "effort"),
    abilities,
    growthRate: isGrowthRate(s.growth_rate?.name) ? (s.growth_rate!.name as GrowthRate) : "medium",
    baseExp: Number(p.base_experience) || 0,
    captureRate: Number(s.capture_rate) || 0,
    baseHappiness: Number(s.base_happiness) || 0,
    genderRate: typeof s.gender_rate === "number" ? s.gender_rate : 4,
    height: (Number(p.height) || 0) / 10,
    weight: (Number(p.weight) || 0) / 10,
    rarity: s.is_mythical ? "mythical" : s.is_legendary ? "legendary" : "common",
    generation: generationNumber(s.generation?.name),
    evolutionChainId: chainId(s.evolution_chain?.url),
    learnset,
    learnsetVersion: version,
    otherMoves: other,
  };
}

/** /move/{name} → MoveData. */
export function parseMove(m: ApiMove): MoveData {
  const chance = m.effect_chance ?? null;
  const effectRaw = english(m.effect_entries)?.short_effect ?? english(m.flavor_text_entries)?.flavor_text ?? "";
  const category = (m.damage_class?.name ?? "status") as MoveCategory;
  return {
    id: m.id,
    slug: m.name,
    name: english(m.names)?.name || slugToName(m.name),
    type: m.type?.name ?? "normal",
    category: category === "physical" || category === "special" ? category : "status",
    power: m.power ?? null,
    accuracy: m.accuracy ?? null,
    pp: Number(m.pp) || 0,
    priority: Number(m.priority) || 0,
    effect: cleanText(effectRaw.replace(/\$effect_chance/g, String(chance ?? ""))),
    effectChance: chance,
    target: m.target?.name ?? "selected-pokemon",
    meta: parseMoveMeta(m),
  };
}

/** What a move does besides damage (status, stat changes, drain, multi-hit…), for battles. */
function parseMoveMeta(m: ApiMove): MoveMeta {
  const meta = m.meta ?? {};
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const ailment = meta.ailment?.name && meta.ailment.name !== "none" ? meta.ailment.name : null;
  return {
    category: meta.category?.name ?? (m.damage_class?.name === "status" ? "unique" : "damage"),
    ailment,
    ailmentChance: n(meta.ailment_chance),
    flinchChance: n(meta.flinch_chance),
    critRate: n(meta.crit_rate),
    drain: n(meta.drain),
    healing: n(meta.healing),
    minHits: meta.min_hits ?? null,
    maxHits: meta.max_hits ?? null,
    statChance: n(meta.stat_chance),
    statChanges: (m.stat_changes ?? [])
      .map((c) => ({ stat: STAGE_STAT[c.stat?.name ?? ""], change: n(c.change) }))
      .filter((c): c is { stat: BattleStat; change: number } => Boolean(c.stat) && c.change !== 0),
  };
}

