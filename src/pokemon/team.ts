import type { ItemStore } from "../core";
import { FIELD_CAPACITY, OWNED_POKEMON, inField, type OwnedPokemon, type OwnedPokemonData } from "./owned";

/** The team: up to six Pokémon that travel with you and earn XP when you do. */
export const TEAM_SIZE = 6;

export const onTeam = (p: OwnedPokemon) => typeof p.data.teamSlot === "number";

/** Team members in slot order. */
export function teamOf(all: OwnedPokemon[]): OwnedPokemon[] {
  return all.filter(onTeam).sort((a, b) => (a.data.teamSlot as number) - (b.data.teamSlot as number));
}

export type AddToTeamResult = "added" | "already" | "team-full" | "field-full";

/** Put a Pokémon on the team (team members are always out in the field). */
export async function addToTeam(store: ItemStore, p: OwnedPokemon): Promise<AddToTeamResult> {
  if (onTeam(p)) return "already";
  const all = store.query({ type: OWNED_POKEMON }) as OwnedPokemon[];
  const team = teamOf(all);
  if (team.length >= TEAM_SIZE) return "team-full";
  if (p.data.home !== "field" && inField(all).length >= FIELD_CAPACITY) return "field-full";
  const used = new Set(team.map((t) => t.data.teamSlot));
  let slot = 0;
  while (used.has(slot)) slot++;
  await store.update(p.id, { data: { ...p.data, teamSlot: slot, home: "field" } });
  return "added";
}

export async function removeFromTeam(store: ItemStore, p: OwnedPokemon): Promise<void> {
  if (!onTeam(p)) return;
  const data: OwnedPokemonData = { ...p.data };
  delete data.teamSlot;
  await store.update(p.id, { data });
}
