import { COMMON_DEX, LEGENDARY_DEX, MYTHICAL_DEX } from "../../pokemon/rarity";
import type { Rarity } from "../../pokemon/species";
import type { BallKind } from "./model";

export type MachineId = "poke" | "great" | "ultra" | "master" | "luxury";

/**
 * A gacha machine: what it costs and what comes out. To add one, add an entry here and a
 * look in MACHINE_THEMES (GachaMachine.tsx). Odds are shown to the player as-is.
 */
export interface Machine {
  id: MachineId;
  name: string;
  /** The ball it's themed on (and the capsule it drops for ordinary pulls). */
  ball: BallKind;
  /** Price in Gacha Points. */
  cost: number;
  blurb: string;
  /** Chance a pull is Legendary / Mythical (0..1). The rest are ordinary Pokémon. */
  legendary: number;
  mythical: number;
  /** 1 in this many pulls is shiny (1 = every pull). */
  shinyOneIn: number;
}

export const MACHINES: readonly Machine[] = [
  { id: "poke", name: "Poké Ball", ball: "poke", cost: 50, legendary: 0.01, mythical: 0.003, shinyOneIn: 256, blurb: "Any Pokémon. Legendaries and shinies are rare." },
  { id: "great", name: "Great Ball", ball: "great", cost: 120, legendary: 0.03, mythical: 0.01, shinyOneIn: 128, blurb: "Better odds of a rare Pokémon." },
  { id: "ultra", name: "Ultra Ball", ball: "ultra", cost: 250, legendary: 0.08, mythical: 0.03, shinyOneIn: 64, blurb: "The best odds of a rare Pokémon." },
  { id: "master", name: "Master Ball", ball: "master", cost: 800, legendary: 0.8, mythical: 0.2, shinyOneIn: 64, blurb: "Legendary and Mythical Pokémon only." },
  { id: "luxury", name: "Luxury Ball", ball: "luxury", cost: 500, legendary: 0.01, mythical: 0.003, shinyOneIn: 1, blurb: "Every Pokémon is shiny." },
];

export const DEFAULT_MACHINE: MachineId = "poke";

export function machineById(id: string | null | undefined): Machine {
  return MACHINES.find((m) => m.id === id) ?? MACHINES[0];
}

export interface Pull {
  dex: number;
  shiny: boolean;
  /** Which pool it came from. (The Pokémon's own rarity still comes from PokéAPI.) */
  tier: Rarity;
}

const POOLS: Record<Rarity, readonly number[]> = { common: COMMON_DEX, legendary: LEGENDARY_DEX, mythical: MYTHICAL_DEX };

/** One pull: roll the tier, pick a Pokémon from that pool, then roll for shiny. */
export function pull(machine: Machine, rng: () => number = Math.random): Pull {
  const r = rng();
  const tier: Rarity = r < machine.mythical ? "mythical" : r < machine.mythical + machine.legendary ? "legendary" : "common";
  const pool = POOLS[tier];
  const dex = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  const shiny = machine.shinyOneIn <= 1 || rng() < 1 / machine.shinyOneIn;
  return { dex, shiny, tier };
}

const BALL_RANK: Partial<Record<BallKind, number>> = { poke: 0, great: 1, ultra: 2, master: 3 };

/**
 * The capsule that drops. It's the machine's own ball, upgraded when something rare is
 * inside (Ultra for a Legendary, Master for a Mythical) so the drop hints at the result.
 * Master and Luxury machines always use their own ball.
 */
export function ballFor(machine: Machine, rarity: Rarity): BallKind {
  if (machine.id === "master" || machine.id === "luxury") return machine.ball;
  const want: BallKind = rarity === "mythical" ? "master" : rarity === "legendary" ? "ultra" : machine.ball;
  return (BALL_RANK[want] ?? 0) > (BALL_RANK[machine.ball] ?? 0) ? want : machine.ball;
}

/** 0.987 → "98.7%", 0.01 → "1%". */
const percent = (p: number) => `${Math.round(p * 1000) / 10}%`;

/** The odds, as shown to the player. */
export function oddsOf(machine: Machine): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const common = 1 - machine.legendary - machine.mythical;
  if (common > 0.0001) out.push({ label: "Common", value: percent(common) });
  out.push({ label: "Legendary", value: percent(machine.legendary) });
  out.push({ label: "Mythical", value: percent(machine.mythical) });
  out.push({ label: "Shiny", value: machine.shinyOneIn <= 1 ? "Always" : `1 in ${machine.shinyOneIn}` });
  return out;
}
