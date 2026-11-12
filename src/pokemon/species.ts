/**
 * Pokémon species data shared by every Pokémon feature (Summon, Field, and whatever comes next).
 * Pure functions and constants only; PokéAPI access is in api.ts.
 */

/** National Pokédex size (Scarlet/Violet era). Raise this when new Pokémon are added to PokéAPI. */
export const DEX_SIZE = 1025;

export type Rarity = "common" | "legendary" | "mythical";

export interface PokemonInfo {
  dex: number;
  /** Display name, e.g. "Mr. Mime". */
  name: string;
  types: string[];
  rarity: Rarity;
  generation: number;
}

const SPRITES = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

/** The classic in-game pixel sprite. */
export function spriteUrl(dex: number, shiny = false): string {
  return `${SPRITES}/${shiny ? "shiny/" : ""}${dex}.png`;
}

/** The sprite seen from behind (your side of a battle). */
export function backSpriteUrl(dex: number, shiny = false): string {
  return `${SPRITES}/back/${shiny ? "shiny/" : ""}${dex}.png`;
}

/** Larger official artwork, used if the pixel sprite is missing. */
export function artworkUrl(dex: number, shiny = false): string {
  return `${SPRITES}/other/official-artwork/${shiny ? "shiny/" : ""}${dex}.png`;
}

/** "#0025" */
export function dexLabel(dex: number): string {
  return `#${String(dex).padStart(4, "0")}`;
}

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10 };

/** "generation-iv" → 4 */
export function generationNumber(name: string | undefined): number {
  const roman = (name ?? "").split("-")[1]?.toLowerCase() ?? "";
  let total = 0;
  for (let i = 0; i < roman.length; i++) {
    const v = ROMAN[roman[i]] ?? 0;
    const next = ROMAN[roman[i + 1]] ?? 0;
    total += v < next ? -v : v;
  }
  return total;
}

/** "mr-mime" → "Mr Mime" (only used when PokéAPI has no English name). */
function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/* The parts of PokéAPI's responses we use. */
interface ApiPokemon {
  id: number;
  name: string;
  types?: { slot: number; type: { name: string } }[];
}
interface ApiSpecies {
  id: number;
  name: string;
  is_legendary?: boolean;
  is_mythical?: boolean;
  generation?: { name: string };
  names?: { name: string; language: { name: string } }[];
}

/** Turn PokéAPI's /pokemon/{id} and /pokemon-species/{id} responses into what the app needs. */
export function parsePokemon(pokemon: ApiPokemon, species: ApiSpecies): PokemonInfo {
  const english = species.names?.find((n) => n.language.name === "en")?.name;
  return {
    dex: species.id ?? pokemon.id,
    name: english || titleCase(species.name || pokemon.name),
    types: [...(pokemon.types ?? [])].sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
    rarity: species.is_mythical ? "mythical" : species.is_legendary ? "legendary" : "common",
    generation: generationNumber(species.generation?.name),
  };
}

/** Official type colors, used for the type chips. */
export const TYPE_COLORS: Record<string, string> = {
  normal: "#9fa19f",
  fire: "#e62829",
  water: "#2980ef",
  electric: "#fac000",
  grass: "#3fa129",
  ice: "#3dcef3",
  fighting: "#ff8000",
  poison: "#9141cb",
  ground: "#915121",
  flying: "#81b9ef",
  psychic: "#ef4179",
  bug: "#91a119",
  rock: "#afa981",
  ghost: "#704170",
  dragon: "#5060e1",
  dark: "#624d4e",
  steel: "#60a1b8",
  fairy: "#ef70ef",
};

/** Types whose color is light enough to need dark text. */
export const LIGHT_TYPES = new Set(["electric", "ice", "normal", "rock", "flying"]);
