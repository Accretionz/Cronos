import { calcStats, type Nature } from "../dex/stats";
import type { MoveData, SpeciesData, Stats } from "../dex/types";
import { emptyStages } from "./mechanics";
import { plainMeta } from "./engine";
import type { BattleMove, Battler } from "./types";

/** A move ready for battle (full PP). */
export function battleMove(m: MoveData): BattleMove {
  return {
    slug: m.slug,
    name: m.name,
    type: m.type,
    category: m.category,
    power: m.power,
    accuracy: m.accuracy,
    priority: m.priority,
    target: m.target,
    meta: m.meta ?? plainMeta(),
    pp: Math.max(1, m.pp),
    maxPp: Math.max(1, m.pp),
  };
}

export interface BattlerInput {
  key: string;
  ownedId?: string;
  name: string;
  species: SpeciesData;
  level: number;
  ivs: Stats;
  evs: Stats;
  nature: Nature;
  shiny: boolean;
  moves: MoveData[];
}

/** A Pokémon at full health, ready to battle. Stats come from the games' formula (dex/stats.ts). */
export function makeBattler(i: BattlerInput): Battler {
  const stats = calcStats(i.species.baseStats, i.ivs, i.evs, i.level, i.nature);
  return {
    key: i.key,
    ownedId: i.ownedId,
    dex: i.species.dex,
    name: i.name,
    species: i.species.name,
    shiny: i.shiny,
    types: i.species.types,
    level: i.level,
    stats,
    hp: stats.hp,
    moves: i.moves.slice(0, 4).map(battleMove),
    status: null,
    statusTurns: 0,
    stages: emptyStages(),
    volatile: {},
    baseExp: i.species.baseExp || 50,
    evYield: i.species.evYield,
    growthRate: i.species.growthRate,
  };
}
