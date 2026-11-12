import { MAX_EV, MAX_TOTAL_EVS } from "../dex/stats";
import { STAT_IDS, type Stats } from "../dex/types";
import { expYield } from "./mechanics";
import type { BattleRewards, BattleState } from "./types";

/**
 * What the player's Pokémon earned: for every opponent that fainted, each of the player's
 * Pokémon that fought it and is still standing gets its EXP yield and effort values.
 */
export function battleRewards(s: BattleState): BattleRewards {
  const exp: Record<string, number> = {};
  const evs: Record<string, Stats> = {};
  const mine = new Map(s.sides[0].battlers.map((b) => [b.key, b]));
  for (const foe of s.sides[1].battlers) {
    if (foe.hp > 0) continue;
    const gain = expYield(foe.baseExp, foe.level, s.kind === "trainer");
    for (const key of s.faced[foe.key] ?? []) {
      const b = mine.get(key);
      if (!b?.ownedId || b.hp <= 0) continue;
      exp[b.ownedId] = (exp[b.ownedId] ?? 0) + gain;
      const e = (evs[b.ownedId] ??= { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
      for (const st of STAT_IDS) e[st] += foe.evYield[st] ?? 0;
    }
  }
  return { exp, evs };
}

/** Add earned EVs within the limits (252 per stat, 510 in total). */
export function addEvs(current: Stats, gained: Stats): Stats {
  const out = { ...current };
  let total = STAT_IDS.reduce((sum, k) => sum + out[k], 0);
  for (const k of STAT_IDS) {
    const room = Math.min(MAX_EV - out[k], MAX_TOTAL_EVS - total);
    const add = Math.max(0, Math.min(room, gained[k]));
    out[k] += add;
    total += add;
  }
  return out;
}
