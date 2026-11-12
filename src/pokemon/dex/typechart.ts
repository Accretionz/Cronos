/**
 * Type effectiveness (Gen VI onward, with Fairy). The foundation for battle damage:
 * effectiveness("electric", ["water", "flying"]) === 4.
 */
export const TYPES = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
] as const;
export type PokemonType = (typeof TYPES)[number];

type Row = { double?: PokemonType[]; half?: PokemonType[]; none?: PokemonType[] };

const CHART: Record<PokemonType, Row> = {
  normal: { half: ["rock", "steel"], none: ["ghost"] },
  fire: { double: ["grass", "ice", "bug", "steel"], half: ["fire", "water", "rock", "dragon"] },
  water: { double: ["fire", "ground", "rock"], half: ["water", "grass", "dragon"] },
  electric: { double: ["water", "flying"], half: ["electric", "grass", "dragon"], none: ["ground"] },
  grass: { double: ["water", "ground", "rock"], half: ["fire", "grass", "poison", "flying", "bug", "dragon", "steel"] },
  ice: { double: ["grass", "ground", "flying", "dragon"], half: ["fire", "water", "ice", "steel"] },
  fighting: { double: ["normal", "ice", "rock", "dark", "steel"], half: ["poison", "flying", "psychic", "bug", "fairy"], none: ["ghost"] },
  poison: { double: ["grass", "fairy"], half: ["poison", "ground", "rock", "ghost"], none: ["steel"] },
  ground: { double: ["fire", "electric", "poison", "rock", "steel"], half: ["grass", "bug"], none: ["flying"] },
  flying: { double: ["grass", "fighting", "bug"], half: ["electric", "rock", "steel"] },
  psychic: { double: ["fighting", "poison"], half: ["psychic", "steel"], none: ["dark"] },
  bug: { double: ["grass", "psychic", "dark"], half: ["fire", "fighting", "poison", "flying", "ghost", "steel", "fairy"] },
  rock: { double: ["fire", "ice", "flying", "bug"], half: ["fighting", "ground", "steel"] },
  ghost: { double: ["psychic", "ghost"], half: ["dark"], none: ["normal"] },
  dragon: { double: ["dragon"], half: ["steel"], none: ["fairy"] },
  dark: { double: ["psychic", "ghost"], half: ["fighting", "dark", "fairy"] },
  steel: { double: ["ice", "rock", "fairy"], half: ["fire", "water", "electric", "steel"] },
  fairy: { double: ["fighting", "dragon", "dark"], half: ["fire", "poison", "steel"] },
};

const isType = (t: string): t is PokemonType => (TYPES as readonly string[]).includes(t);

/** Multiplier for one attacking type against one defending type. Unknown types count as neutral. */
export function typeMultiplier(attack: string, defend: string): number {
  if (!isType(attack) || !isType(defend)) return 1;
  const row = CHART[attack];
  if (row.none?.includes(defend)) return 0;
  if (row.double?.includes(defend)) return 2;
  if (row.half?.includes(defend)) return 0.5;
  return 1;
}

/** Multiplier against a Pokémon with one or two types: 0, 0.25, 0.5, 1, 2 or 4. */
export function effectiveness(attack: string, defenderTypes: string[]): number {
  return defenderTypes.reduce((m, t) => m * typeMultiplier(attack, t), 1);
}

/** For a defender: what each attacking type does to it. */
export function weaknesses(defenderTypes: string[]): Record<PokemonType, number> {
  const out = {} as Record<PokemonType, number>;
  for (const t of TYPES) out[t] = effectiveness(t, defenderTypes);
  return out;
}
