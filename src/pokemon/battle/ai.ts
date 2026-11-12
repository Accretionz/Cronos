import { effectiveness } from "../dex/typechart";
import { rollDamage } from "./mechanics";
import type { Rng } from "./rng";
import type { BattleAction, BattleState, SideIndex } from "./types";

/**
 * How the computer picks a move. Wild Pokémon pick at random from the moves they can use
 * (as in the games). Trainers score each move by the damage it would do (or how useful its
 * effect is) and usually pick the best. Add smarter trainers here (switching, items).
 */
export function chooseAction(s: BattleState, side: SideIndex, rng: Rng): BattleAction {
  const me = s.sides[side].battlers[s.sides[side].active];
  const foe = s.sides[side === 0 ? 1 : 0].battlers[s.sides[side === 0 ? 1 : 0].active];
  const usable = me.moves.map((_, i) => i).filter((i) => me.moves[i].pp > 0);
  if (!usable.length) return { kind: "move", index: 0 }; // the engine turns this into Struggle
  if (s.kind === "wild") return { kind: "move", index: usable[Math.floor(rng.next() * usable.length)] };

  const score = (i: number) => {
    const m = me.moves[i];
    if (m.category === "status") {
      if (m.meta.ailment && !foe.status && !foe.volatile.confusion) return 25;
      if (m.meta.statChanges.some((c) => c.change > 0) && me.stages[m.meta.statChanges[0].stat] < 2) return 15;
      if (m.meta.healing > 0) return me.hp < me.stats.hp / 2 ? 60 : 0;
      return 5;
    }
    if (effectiveness(m.type, foe.types) === 0) return 0;
    const { damage } = rollDamage(m, me, foe, rng, { forceCrit: false, randomFactor: 92 });
    const acc = (m.accuracy ?? 100) / 100;
    return (damage >= foe.hp ? 200 + damage : damage) * acc;
  };
  const ranked = usable.map((i) => ({ i, v: score(i) })).sort((a, b) => b.v - a.v);
  // Mostly the best move; sometimes the second best, so it isn't fully predictable.
  const pick = ranked.length > 1 && rng.chance(0.2) ? ranked[1] : ranked[0];
  return { kind: "move", index: pick.i };
}
