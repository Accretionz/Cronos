import { effectiveness } from "../dex/typechart";
import type { BattleStat, MoveMeta } from "../dex/types";
import { chooseAction } from "./ai";
import {
  MAX_STAGE,
  STAT_NAMES,
  effectiveSpeed,
  escapeChance,
  hitChance,
  hitCount,
  immuneToStatus,
  rollDamage,
} from "./mechanics";
import { rngFrom, type Rng } from "./rng";
import type {
  BattleAction,
  BattleEvent,
  BattleKind,
  BattleMove,
  BattleSide,
  BattleState,
  Battler,
  MajorStatus,
  SideIndex,
} from "./types";

/**
 * The battle engine: one function per decision point, each taking a state and returning a
 * new state plus what happened (events). It never mutates what it's given and never
 * touches the clock, the network or the store, so it runs the same in the app, in tests,
 * on a server, or in a future multiplayer mode.
 *
 *   let b = createBattle({ ... });
 *   ({ state: b, events } = resolveTurn(b, { kind: "move", index: 0 }));
 *   if (b.needsSwitch) ({ state: b, events } = sendIn(b, 2));
 *
 * Singles only (one Pokémon per side on the field). Not yet: abilities, held items,
 * weather, terrain, two-turn moves, and moves with special rules (they act as plain
 * damage, or "nothing happens" if they deal none). Add them in useMove().
 */

export interface NewBattle {
  id: string;
  kind: BattleKind;
  player: { name: string; battlers: Battler[] };
  foe: { name: string; battlers: Battler[] };
  seed: number;
}

export function createBattle(n: NewBattle): BattleState {
  const firstAlive = (list: Battler[]) => Math.max(0, list.findIndex((b) => b.hp > 0));
  const state: BattleState = {
    id: n.id,
    kind: n.kind,
    turn: 0,
    seed: n.seed >>> 0,
    sides: [
      { name: n.player.name, battlers: structuredClone(n.player.battlers), active: firstAlive(n.player.battlers) },
      { name: n.foe.name, battlers: structuredClone(n.foe.battlers), active: firstAlive(n.foe.battlers) },
    ],
    needsSwitch: false,
    outcome: null,
    escapeAttempts: 0,
    faced: {},
  };
  noteFacing(state);
  return state;
}

export const activeOf = (s: BattleState, side: SideIndex): Battler => s.sides[side].battlers[s.sides[side].active];
export const other = (side: SideIndex): SideIndex => (side === 0 ? 1 : 0);
export const usableMoves = (b: Battler) => b.moves.map((_, i) => i).filter((i) => b.moves[i].pp > 0);

/** Can `side` switch to the Pokémon at `index`? */
export function canSwitchTo(s: BattleState, side: SideIndex, index: number): boolean {
  const b = s.sides[side].battlers[index];
  return Boolean(b) && b.hp > 0 && index !== s.sides[side].active;
}

/** Introductory lines for the start of a battle. */
export function openingEvents(s: BattleState): BattleEvent[] {
  const foe = activeOf(s, 1);
  const me = activeOf(s, 0);
  return [
    { t: "info", text: s.kind === "wild" ? `A wild ${foe.name} appeared!` : `${s.sides[1].name} sent out ${foe.name}!` },
    { t: "info", text: `Go! ${me.name}!` },
  ];
}

/** Play one turn: the player's choice, the opponent's (from the AI unless given), and end-of-turn effects. */
export function resolveTurn(state: BattleState, action: BattleAction, foeAction?: BattleAction): { state: BattleState; events: BattleEvent[] } {
  if (state.outcome) return { state, events: [] };
  if (state.needsSwitch) throw new Error("Send in a Pokémon first (sendIn).");
  const s = structuredClone(state);
  const rng = rngFrom(s.seed);
  const ev: BattleEvent[] = [];
  s.turn++;
  ev.push({ t: "turn", turn: s.turn, text: "" });

  if (action.kind === "switch" && !canSwitchTo(s, 0, action.index)) throw new Error("Can't switch to that Pokémon.");
  if (action.kind === "move" && activeOf(s, 0).moves.length && !activeOf(s, 0).moves[action.index]) throw new Error("No such move.");

  // Running happens before anything else.
  if (action.kind === "run") {
    if (s.kind !== "wild") {
      ev.push({ t: "info", text: "There's no running from a trainer battle!" });
      s.turn--;
      return finish(s, rng, ev);
    }
    s.escapeAttempts++;
    if (rng.chance(escapeChance(effectiveSpeed(activeOf(s, 0)), effectiveSpeed(activeOf(s, 1)), s.escapeAttempts))) {
      s.outcome = "run";
      ev.push({ t: "end", outcome: "run", text: "Got away safely!" });
      return finish(s, rng, ev);
    }
    ev.push({ t: "info", text: "Couldn't get away!" });
  }

  const foeChoice = foeAction ?? chooseAction(s, 1, rng);
  const order = turnOrder(s, rng, [
    { side: 0, action },
    { side: 1, action: foeChoice },
  ]);
  for (const { side, action: a } of order) {
    if (s.outcome) break;
    const me = activeOf(s, side);
    if (me.hp <= 0) continue;
    if (a.kind === "switch") doSwitch(s, side, a.index, ev);
    else if (a.kind === "move") {
      useMove(s, side, a.index, rng, ev);
      if (checkFaints(s, ev)) break;
    }
  }

  if (!s.outcome) endOfTurn(s, rng, ev);
  return finish(s, rng, ev);
}

/** After the player's Pokémon fainted: send in another. */
export function sendIn(state: BattleState, index: number): { state: BattleState; events: BattleEvent[] } {
  if (!state.needsSwitch) throw new Error("Nothing to replace.");
  if (!canSwitchTo(state, 0, index)) throw new Error("Can't send that Pokémon in.");
  const s = structuredClone(state);
  const rng = rngFrom(s.seed);
  const ev: BattleEvent[] = [];
  s.needsSwitch = false;
  doSwitch(s, 0, index, ev);
  return finish(s, rng, ev);
}

function finish(s: BattleState, rng: Rng, events: BattleEvent[]) {
  s.seed = rng.state();
  return { state: s, events };
}

/* ---------- Order ---------- */

function turnOrder(s: BattleState, rng: Rng, choices: { side: SideIndex; action: BattleAction }[]) {
  const rank = (c: { side: SideIndex; action: BattleAction }) => {
    if (c.action.kind !== "move") return { bracket: 1, priority: 0, speed: 0 }; // switching (and running) go first
    const me = activeOf(s, c.side);
    const move = me.moves[c.action.index];
    return { bracket: 0, priority: move && move.pp > 0 ? move.priority : 0, speed: effectiveSpeed(me) };
  };
  const tie = rng.next() < 0.5;
  return [...choices].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra.bracket !== rb.bracket) return rb.bracket - ra.bracket;
    if (ra.priority !== rb.priority) return rb.priority - ra.priority;
    if (ra.speed !== rb.speed) return rb.speed - ra.speed;
    return tie ? -1 : 1;
  });
}

/* ---------- Switching ---------- */

function doSwitch(s: BattleState, side: SideIndex, index: number, ev: BattleEvent[]) {
  const team = s.sides[side];
  const leaving = team.battlers[team.active];
  // Stat stages and volatile effects end when a Pokémon leaves the field.
  leaving.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 };
  leaving.volatile = {};
  if (leaving.status === "tox") leaving.statusTurns = 0;
  team.active = index;
  const b = team.battlers[index];
  const text =
    side === 0
      ? leaving.hp > 0
        ? `${leaving.name}, come back! Go! ${b.name}!`
        : `Go! ${b.name}!`
      : `${s.kind === "wild" ? "The wild" : team.name} sent out ${b.name}!`;
  ev.push({ t: "switch", side, index, hp: b.hp, maxHp: b.stats.hp, text });
  noteFacing(s);
}

/** Remember which of the player's Pokémon fought which opponent (for sharing EXP). */
function noteFacing(s: BattleState) {
  const foe = activeOf(s, 1);
  const me = activeOf(s, 0);
  const list = (s.faced[foe.key] ??= []);
  if (!list.includes(me.key)) list.push(me.key);
}

/* ---------- Moves ---------- */

const STRUGGLE: BattleMove = {
  slug: "struggle",
  name: "Struggle",
  type: "???",
  category: "physical",
  power: 50,
  accuracy: null,
  priority: 0,
  target: "selected-pokemon",
  pp: 1,
  maxPp: 1,
  meta: plainMeta(),
};

export function plainMeta(): MoveMeta {
  return { category: "damage", ailment: null, ailmentChance: 0, flinchChance: 0, critRate: 0, drain: 0, healing: 0, minHits: null, maxHits: null, statChance: 0, statChanges: [] };
}

/** Can this Pokémon act this turn? Handles sleep, freeze, paralysis, flinching and confusion. */
function canAct(s: BattleState, side: SideIndex, me: Battler, rng: Rng, ev: BattleEvent[]): boolean {
  if (me.status === "frz") {
    if (rng.chance(0.2)) {
      me.status = null;
      ev.push({ t: "status", side, status: null, text: `${me.name} thawed out!` });
    } else {
      ev.push({ t: "cant", side, text: `${me.name} is frozen solid!` });
      return false;
    }
  }
  if (me.status === "slp") {
    if (me.statusTurns > 0) {
      me.statusTurns--;
      ev.push({ t: "cant", side, text: `${me.name} is fast asleep.` });
      return false;
    }
    me.status = null;
    ev.push({ t: "status", side, status: null, text: `${me.name} woke up!` });
  }
  if (me.volatile.flinch) {
    ev.push({ t: "cant", side, text: `${me.name} flinched and couldn't move!` });
    return false;
  }
  if (me.volatile.confusion) {
    me.volatile.confusion--;
    if (me.volatile.confusion <= 0) {
      delete me.volatile.confusion;
      ev.push({ t: "info", text: `${me.name} snapped out of its confusion!` });
    } else {
      ev.push({ t: "info", text: `${me.name} is confused!` });
      if (rng.chance(1 / 3)) {
        const self: BattleMove = { ...STRUGGLE, slug: "confusion-hit", name: "", power: 40 };
        const { damage } = rollDamage(self, me, me, rng, { forceCrit: false });
        ev.push({ t: "cant", side, text: "It hurt itself in its confusion!" });
        hurt(s, side, damage, ev, 1, false, true);
        return false;
      }
    }
  }
  if (me.status === "par" && rng.chance(0.25)) {
    ev.push({ t: "cant", side, text: `${me.name} is paralyzed! It can't move!` });
    return false;
  }
  return true;
}

function useMove(s: BattleState, side: SideIndex, index: number, rng: Rng, ev: BattleEvent[]) {
  const me = activeOf(s, side);
  const foeSide = other(side);
  const foe = activeOf(s, foeSide);
  if (!canAct(s, side, me, rng, ev)) return;

  const chosen = me.moves[index];
  const move = chosen && chosen.pp > 0 ? chosen : STRUGGLE;
  if (move === STRUGGLE) ev.push({ t: "info", text: `${me.name} has no moves left!` });
  else chosen.pp--;
  ev.push({ t: "move", side, move: move.name, type: move.type, text: `${me.name} used ${move.name}!` });

  const selfTarget = move.target === "user" || move.target === "users-field" || move.target === "user-and-allies";
  const m = move.meta;

  // One-hit KO moves.
  if (m.category === "ohko") {
    if (me.level < foe.level || effectiveness(move.type, foe.types) === 0) {
      ev.push({ t: "info", text: `It doesn't affect ${foe.name}…` });
      return;
    }
    if (!rng.chance((30 + me.level - foe.level) / 100)) return void ev.push({ t: "miss", side, text: `${me.name}'s attack missed!` });
    hurt(s, foeSide, foe.hp, ev, 1, false);
    ev.push({ t: "info", text: "It's a one-hit KO!" });
    return;
  }

  // Does it hit? (Moves aimed at the user always do.)
  if (!selfTarget && !rng.chance(hitChance(move, me, foe))) {
    ev.push({ t: "miss", side, text: `${me.name}'s attack missed!` });
    return;
  }

  if (move.category !== "status") {
    const eff = effectiveness(move.type, foe.types);
    if (eff === 0) {
      ev.push({ t: "info", text: `It doesn't affect ${foe.name}…` });
      return;
    }
    const hits = hitCount(move, rng);
    let total = 0;
    let landed = 0;
    for (let i = 0; i < hits && foe.hp > 0 && me.hp > 0; i++) {
      const roll = rollDamage(move, me, foe, rng);
      landed++;
      total += hurt(s, foeSide, roll.damage, ev, roll.effectiveness, roll.crit);
      if (roll.crit) ev.push({ t: "info", text: "A critical hit!" });
    }
    if (eff > 1) ev.push({ t: "info", text: "It's super effective!" });
    else if (eff < 1) ev.push({ t: "info", text: "It's not very effective…" });
    if (hits > 1) ev.push({ t: "info", text: `Hit ${landed} time${landed === 1 ? "" : "s"}!` });

    // Drain and recoil.
    if (m.drain > 0 && total > 0 && me.hp > 0) heal(s, side, Math.max(1, Math.floor((total * m.drain) / 100)), ev, `${foe.name} had its energy drained!`);
    if (m.drain < 0 && total > 0 && me.hp > 0) {
      ev.push({ t: "info", text: `${me.name} is damaged by recoil!` });
      hurt(s, side, Math.max(1, Math.floor((total * -m.drain) / 100)), ev, 1, false, true);
    }
    if (move === STRUGGLE && me.hp > 0) {
      ev.push({ t: "info", text: `${me.name} is damaged by recoil!` });
      hurt(s, side, Math.max(1, Math.floor(me.stats.hp / 4)), ev, 1, false, true);
    }
    if (m.healing && me.hp > 0) heal(s, side, Math.floor((me.stats.hp * m.healing) / 100), ev);

    // Added effects, if the target is still standing.
    if (foe.hp > 0) {
      if (m.ailment && m.ailmentChance > 0 && rng.chance(m.ailmentChance / 100)) inflict(s, foeSide, m.ailment, move, rng, ev, false);
      if (m.flinchChance > 0 && rng.chance(m.flinchChance / 100)) foe.volatile.flinch = true;
    }
    if (m.statChanges.length && (m.statChance === 0 || rng.chance(m.statChance / 100))) {
      const toUser = m.category === "damage+raise";
      if (toUser ? me.hp > 0 : foe.hp > 0) for (const c of m.statChanges) changeStage(s, toUser ? side : foeSide, c.stat, c.change, ev, false);
    }
    return;
  }

  // Status moves.
  let did = false;
  if (m.category === "heal" || (m.healing > 0 && selfTarget)) {
    if (me.hp >= me.stats.hp) ev.push({ t: "info", text: `${me.name}'s HP is full!` });
    else heal(s, side, Math.max(1, Math.floor((me.stats.hp * (m.healing || 50)) / 100)), ev);
    did = true;
  }
  if (m.statChanges.length) {
    const toUser = selfTarget || m.category === "net-good-stats";
    for (const c of m.statChanges) did = changeStage(s, toUser ? side : foeSide, c.stat, c.change, ev, true) || did;
  }
  if (m.ailment) {
    if (move.type === "electric" && m.ailment === "paralysis" && effectiveness("electric", foe.types) === 0) {
      ev.push({ t: "info", text: `It doesn't affect ${foe.name}…` });
      return;
    }
    did = inflict(s, foeSide, m.ailment, move, rng, ev, true) || did;
    if (!did) return; // "But it failed!" already said
  }
  if (!did) ev.push({ t: "info", text: "But nothing happened!" });
}

/** Take HP from `side`'s active Pokémon. Returns the damage actually dealt. */
function hurt(s: BattleState, side: SideIndex, amount: number, ev: BattleEvent[], eff: number, crit: boolean, quiet = false): number {
  const b = activeOf(s, side);
  const dealt = Math.min(b.hp, Math.max(0, Math.floor(amount)));
  b.hp -= dealt;
  ev.push({ t: "damage", side, amount: dealt, hp: b.hp, maxHp: b.stats.hp, effectiveness: quiet ? 1 : eff, crit, text: "" });
  if (b.hp === 0) ev.push({ t: "faint", side, text: `${side === 1 && s.kind === "wild" ? "The wild " : ""}${b.name} fainted!` });
  return dealt;
}

function heal(s: BattleState, side: SideIndex, amount: number, ev: BattleEvent[], text?: string) {
  const b = activeOf(s, side);
  const gained = Math.min(b.stats.hp - b.hp, Math.max(0, Math.floor(amount)));
  if (gained <= 0) return;
  b.hp += gained;
  ev.push({ t: "heal", side, amount: gained, hp: b.hp, maxHp: b.stats.hp, text: text ?? `${b.name} regained health!` });
}

const AILMENT: Record<string, MajorStatus | "confusion" | undefined> = {
  paralysis: "par",
  burn: "brn",
  poison: "psn",
  sleep: "slp",
  freeze: "frz",
  confusion: "confusion",
};

const STATUS_TEXT: Record<MajorStatus, string> = {
  par: "is paralyzed! It may be unable to move!",
  brn: "was burned!",
  psn: "was poisoned!",
  tox: "was badly poisoned!",
  slp: "fell asleep!",
  frz: "was frozen solid!",
};

/** Give a status. `primary`: it's what the move is for, so say so when it fails. */
function inflict(s: BattleState, side: SideIndex, ailment: string, move: BattleMove, rng: Rng, ev: BattleEvent[], primary: boolean): boolean {
  const b = activeOf(s, side);
  const kind = AILMENT[ailment];
  if (!kind) {
    if (primary) ev.push({ t: "info", text: "But nothing happened!" });
    return false;
  }
  if (kind === "confusion") {
    if (b.volatile.confusion) {
      if (primary) ev.push({ t: "info", text: `${b.name} is already confused!` });
      return false;
    }
    b.volatile.confusion = rng.int(2, 5);
    ev.push({ t: "info", text: `${b.name} became confused!` });
    return true;
  }
  const status: MajorStatus = kind === "psn" && move.slug === "toxic" ? "tox" : kind;
  if (b.status || immuneToStatus(b.types, status)) {
    if (primary) ev.push({ t: "info", text: b.status ? "But it failed!" : `It doesn't affect ${b.name}…` });
    return false;
  }
  b.status = status;
  b.statusTurns = status === "slp" ? rng.int(1, 3) : 0;
  ev.push({ t: "status", side, status, text: `${b.name} ${STATUS_TEXT[status]}` });
  return true;
}

/** Raise or lower a stat stage. Returns whether it changed. */
function changeStage(s: BattleState, side: SideIndex, stat: BattleStat, change: number, ev: BattleEvent[], primary: boolean): boolean {
  const b = activeOf(s, side);
  const before = b.stages[stat];
  const after = Math.max(-MAX_STAGE, Math.min(MAX_STAGE, before + change));
  const name = `${b.name}'s ${STAT_NAMES[stat]}`;
  if (after === before) {
    if (primary) ev.push({ t: "info", text: `${name} won't go any ${change > 0 ? "higher" : "lower"}!` });
    return false;
  }
  b.stages[stat] = after;
  const size = Math.abs(after - before);
  const how = change > 0 ? (size >= 3 ? "rose drastically" : size === 2 ? "rose sharply" : "rose") : size >= 3 ? "severely fell" : size === 2 ? "harshly fell" : "fell";
  ev.push({ t: "stat", side, stat, change: after - before, text: `${name} ${how}!` });
  return true;
}

/* ---------- End of turn ---------- */

function endOfTurn(s: BattleState, rng: Rng, ev: BattleEvent[]) {
  const sides: SideIndex[] = effectiveSpeed(activeOf(s, 0)) >= effectiveSpeed(activeOf(s, 1)) ? [0, 1] : [1, 0];
  for (const side of sides) {
    const b = activeOf(s, side);
    if (b.hp <= 0) continue;
    if (b.status === "brn") {
      ev.push({ t: "info", text: `${b.name} is hurt by its burn!` });
      hurt(s, side, Math.max(1, Math.floor(b.stats.hp / 16)), ev, 1, false, true);
    } else if (b.status === "psn") {
      ev.push({ t: "info", text: `${b.name} is hurt by poison!` });
      hurt(s, side, Math.max(1, Math.floor(b.stats.hp / 8)), ev, 1, false, true);
    } else if (b.status === "tox") {
      b.statusTurns = Math.min(15, b.statusTurns + 1);
      ev.push({ t: "info", text: `${b.name} is hurt by poison!` });
      hurt(s, side, Math.max(1, Math.floor((b.stats.hp * b.statusTurns) / 16)), ev, 1, false, true);
    }
  }
  for (const side of [0, 1] as SideIndex[]) delete activeOf(s, side).volatile.flinch;
  checkFaints(s, ev);
  void rng;
}

/** After damage: replace fainted Pokémon or end the battle. Returns true when the turn should stop. */
function checkFaints(s: BattleState, ev: BattleEvent[]): boolean {
  const mine = activeOf(s, 0);
  const theirs = activeOf(s, 1);
  if (mine.hp > 0 && theirs.hp > 0) return false;
  const alive = (side: SideIndex) => s.sides[side].battlers.some((b) => b.hp > 0);

  if (!alive(1)) {
    s.outcome = "win";
    ev.push({ t: "end", outcome: "win", text: s.kind === "wild" ? `You defeated the wild ${theirs.name}!` : `You defeated ${s.sides[1].name}!` });
    return true;
  }
  if (!alive(0)) {
    s.outcome = "lose";
    ev.push({ t: "end", outcome: "lose", text: "You have no Pokémon left that can fight!" });
    return true;
  }
  if (theirs.hp <= 0) {
    const next = s.sides[1].battlers.findIndex((b) => b.hp > 0);
    doSwitch(s, 1, next, ev);
  }
  if (mine.hp <= 0) s.needsSwitch = true;
  return true;
}

/** The player's Pokémon, as listed for switching. */
export const sideOf = (s: BattleState, side: SideIndex): BattleSide => s.sides[side];
