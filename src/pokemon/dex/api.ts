import { getCached, peekCached, putCached } from "./cache";
import { parseMove, parseSpecies, type ApiMove, type ApiPokemonFull, type ApiSpeciesFull } from "./parse";
import type { MoveData, SpeciesData } from "./types";

/** PokéAPI: free, public, no key needed. https://pokeapi.co */
export const POKEAPI = "https://pokeapi.co/api/v2";

const inflight = new Map<string, Promise<unknown>>();

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${POKEAPI}/${path}`);
  if (!res.ok) throw new Error(`PokéAPI answered ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

/** Cache first, then the network. Concurrent requests for the same thing share one fetch. Failures aren't cached. */
function load<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = (async () => {
      const cached = await getCached<T>(key);
      if (cached !== undefined) return cached;
      const value = await fetcher();
      await putCached(key, value);
      return value;
    })();
    inflight.set(key, p);
    p.finally(() => inflight.delete(key)).catch(() => {});
  }
  return p;
}

/** Everything about a species: stats, abilities, growth rate, learnset, Pokédex text. */
export function getSpecies(dex: number): Promise<SpeciesData> {
  return load(`species:${dex}`, async () => {
    const [pokemon, species] = await Promise.all([getJson<ApiPokemonFull>(`pokemon/${dex}`), getJson<ApiSpeciesFull>(`pokemon-species/${dex}`)]);
    return parseSpecies(pokemon, species);
  });
}

/** One move's details (type, category, power, accuracy, PP, effect). */
export function getMove(slug: string): Promise<MoveData> {
  return load(`move:${slug}`, async () => parseMove(await getJson<ApiMove>(`move/${slug}`)));
}

/** Already loaded this session (no waiting), or undefined. */
export const peekSpecies = (dex: number) => peekCached<SpeciesData>(`species:${dex}`);
export const peekMove = (slug: string) => peekCached<MoveData>(`move:${slug}`);
