import { describe, expect, it } from "vitest";
import { parseMove } from "../dex/parse";
import type { MoveMeta, Stats } from "../dex/types";
import { chooseAction } from "./ai";
import { createBattle, plainMeta, resolveTurn, sendIn } from "./engine";
import { accuracyStageMultiplier, critChance, effectiveSpeed, emptyStages, escapeChance, expYield, hitCount, rollDamage, statStageMultiplier } from "./mechanics";
import { addEvs, battleRewards } from "./rewards";
import { rngFrom } from "./rng";
import type { BattleMove, BattleState, Battler } from "./types";

const stats = (s: Partial<Stats> = {}): Stats => ({ hp: 100, atk: 50, def: 50, spa: 50, spd: 50, spe: 50, ...s });
const move = (slug: string, o: Omit<Partial<BattleMove>, "meta"> & { meta?: Partial<MoveMeta> } = {}): BattleMove => ({
  slug,
  name: o.name ?? slug,
  type: o.type ?? "normal",
  category: o.category ?? "physical",
  power: o.power === undefined ? 40 : o.power,
  accuracy: o.accuracy === undefined ? 100 : o.accuracy,
  priority: o.priority ?? 0,
  target: o.target ?? "selected-pokemon",
  pp: o.pp ?? 20,
  maxPp: o.maxPp ?? 20,
  meta: { ...plainMeta(), ...(o.meta ?? {}) },
});
let n = 0;
const mon = (o: Partial<Battler> = {}): Battler => {
  const st = o.stats ?? stats();
  return {
    key: o.key ?? `k${++n}`,
    ownedId: o.ownedId,
    dex: 1,
    name: o.name ?? "Mon",
    species: o.name ?? "Mon",
    shiny: false,
    types: o.types ?? ["normal"],
    level: o.level ?? 50,
    stats: st,
    hp: o.hp ?? st.hp,
    moves: o.moves ?? [move("tackle")],
    status: o.status ?? null,
    statusTurns: o.statusTurns ?? 0,
    stages: o.stages ?? emptyStages(),
    volatile: o.volatile ?? {},
    baseExp: o.baseExp ?? 64,
    evYield: o.evYield ?? { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 1 },
    growthRate: "medium",
  };
};
const battle = (player: Battler[], foe: Battler[], kind: "wild" | "trainer" = "wild", seed = 1): BattleState =>
  createBattle({ id: "b", kind, player: { name: "You", battlers: player }, foe: { name: "Rival", battlers: foe }, seed });
const texts = (ev: { text: string }[]) => ev.map((e) => e.text).filter(Boolean);
const useMove = (i = 0) => ({ kind: "move" as const, index: i });

describe("battle formulas", () => {
  it("matches the games' damage formula (Bulbapedia's Glaceon vs Garchomp example: 168–196)", () => {
    const glaceon = mon({ level: 75, types: ["ice"], stats: stats({ atk: 123 }) });
    const garchomp = mon({ types: ["dragon", "ground"], stats: stats({ hp: 300, def: 163 }) });
    const iceFang = move("ice-fang", { type: "ice", power: 65 });
    const rng = rngFrom(1);
    const low = rollDamage(iceFang, glaceon, garchomp, rng, { forceCrit: false, randomFactor: 85 });
    const high = rollDamage(iceFang, glaceon, garchomp, rng, { forceCrit: false, randomFactor: 100 });
    expect([low.damage, high.damage, high.effectiveness]).toEqual([168, 196, 4]);
    const crit = rollDamage(iceFang, glaceon, garchomp, rng, { forceCrit: true, randomFactor: 100 });
    expect(crit.damage).toBe(292); // 33 → 49 (critical) → 73 (STAB) → 292 (×4)
  });

  it("stage multipliers, crit chances, escape odds and EXP", () => {
    expect([statStageMultiplier(1), statStageMultiplier(6), statStageMultiplier(-1), statStageMultiplier(-6)]).toEqual([1.5, 4, 2 / 3, 0.25]);
    expect([accuracyStageMultiplier(1), accuracyStageMultiplier(-6)]).toEqual([4 / 3, 1 / 3]);
    expect([critChance(0), critChance(1), critChance(2), critChance(3)]).toEqual([1 / 24, 1 / 8, 1 / 2, 1]);
    expect(escapeChance(100, 50, 1)).toBe(1);
    expect(escapeChance(50, 100, 1)).toBe(94 / 256);
    expect([expYield(64, 10, false), expYield(64, 10, true)]).toEqual([91, 136]);
  });

  it("burn halves physical damage; paralysis halves speed", () => {
    const a = mon({ stats: stats({ atk: 100 }) });
    const t = mon();
    const tackle = move("tackle", { power: 80 });
    const normal = rollDamage(tackle, a, t, rngFrom(1), { forceCrit: false, randomFactor: 100 }).damage;
    const burned = rollDamage(tackle, { ...a, status: "brn" }, t, rngFrom(1), { forceCrit: false, randomFactor: 100 }).damage;
    expect(burned).toBe(Math.floor(normal / 2));
    expect(effectiveSpeed(mon({ stats: stats({ spe: 101 }), status: "par" }))).toBe(50);
    expect(effectiveSpeed(mon({ stats: stats({ spe: 100 }), stages: { ...emptyStages(), spe: 2 } }))).toBe(200);
  });

  it("multi-hit moves hit 2–5 times", () => {
    const m = move("double-slap", { meta: { minHits: 2, maxHits: 5 } });
    const rng = rngFrom(7);
    const counts = new Set(Array.from({ length: 200 }, () => hitCount(m, rng)));
    expect([...counts].sort()).toEqual([2, 3, 4, 5]);
    expect(hitCount(move("double-kick", { meta: { minHits: 2, maxHits: 2 } }), rng)).toBe(2);
  });
});

describe("battle turns", () => {
  it("the faster Pokémon moves first; priority beats speed", () => {
    const slow = mon({ name: "Slow", stats: stats({ spe: 10 }), moves: [move("tackle"), move("quick-attack", { priority: 1 })] });
    const fast = mon({ name: "Fast", stats: stats({ spe: 90 }) });
    let r = resolveTurn(battle([slow], [fast]), useMove(0), useMove(0));
    expect(texts(r.events).filter((t) => t.includes("used"))).toEqual(["Fast used tackle!", "Slow used tackle!"]);
    r = resolveTurn(battle([slow], [fast]), useMove(1), useMove(0));
    expect(texts(r.events).filter((t) => t.includes("used"))[0]).toBe("Slow used quick-attack!");
  });

  it("is deterministic: the same seed and choices play out the same", () => {
    const make = () => battle([mon({ key: "a", name: "A" })], [mon({ key: "b", name: "B" })], "wild", 42);
    const a = resolveTurn(make(), useMove());
    const b = resolveTurn(make(), useMove());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("doesn't change the state it's given", () => {
    const s = battle([mon()], [mon()]);
    const before = JSON.stringify(s);
    resolveTurn(s, useMove());
    expect(JSON.stringify(s)).toBe(before);
  });

  it("winning, switching in the next foe, and losing", () => {
    const strong = move("mega-punch", { power: 250 });
    const me = mon({ name: "Me", stats: stats({ spe: 99, atk: 200 }), moves: [strong] });
    const foes = [mon({ name: "F1", hp: 1 }), mon({ name: "F2", hp: 1 })];
    let r = resolveTurn(battle([me], foes), useMove(), useMove());
    expect(texts(r.events)).toContain("The wild F1 fainted!");
    expect(r.state.sides[1].active).toBe(1);
    expect(r.state.outcome).toBe(null);
    r = resolveTurn(r.state, useMove(), useMove());
    expect(r.state.outcome).toBe("win");
    // Losing
    const weak = mon({ name: "Weak", hp: 1, stats: stats({ spe: 1 }) });
    const r2 = resolveTurn(battle([weak], [mon({ name: "Foe", stats: stats({ spe: 99 }), moves: [strong] })]), useMove(), useMove());
    expect(r2.state.outcome).toBe("lose");
  });

  it("when your Pokémon faints you choose who goes next", () => {
    const strong = move("mega-punch", { power: 250 });
    const r = resolveTurn(battle([mon({ name: "A", hp: 1, stats: stats({ spe: 1 }) }), mon({ name: "B" })], [mon({ stats: stats({ spe: 99 }), moves: [strong] })]), useMove(), useMove());
    expect(r.state.needsSwitch).toBe(true);
    let threw = false;
    try {
      resolveTurn(r.state, useMove());
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    const s2 = sendIn(r.state, 1);
    expect(s2.state.sides[0].active).toBe(1);
    expect(texts(s2.events)).toEqual(["Go! B!"]);
  });

  it("status moves: paralysis, immunities, stat drops and their limits", () => {
    const tw = move("thunder-wave", { type: "electric", category: "status", power: null, accuracy: 90, meta: { category: "ailment", ailment: "paralysis" } });
    let r = resolveTurn(battle([mon({ moves: [tw], stats: stats({ spe: 99 }) })], [mon({ name: "Foe" })], "wild", 3), useMove(), useMove());
    expect(r.state.sides[1].battlers[0].status).toBe("par");
    r = resolveTurn(battle([mon({ moves: [tw], stats: stats({ spe: 99 }) })], [mon({ name: "Dug", types: ["ground"] })], "wild", 3), useMove(), useMove());
    expect(texts(r.events)).toContain("It doesn't affect Dug…");
    const growl = move("growl", { category: "status", power: null, target: "all-opponents", meta: { category: "net-bad-stats", statChanges: [{ stat: "atk", change: -1 }] } });
    r = resolveTurn(battle([mon({ moves: [growl], stats: stats({ spe: 99 }) })], [mon({ name: "Foe" })]), useMove(), useMove());
    expect(r.state.sides[1].battlers[0].stages.atk).toBe(-1);
    expect(texts(r.events)).toContain("Foe's Attack fell!");
    const floor = mon({ name: "Foe", stages: { ...emptyStages(), atk: -6 } });
    r = resolveTurn(battle([mon({ moves: [growl], stats: stats({ spe: 99 }) })], [floor]), useMove(), useMove());
    expect(texts(r.events)).toContain("Foe's Attack won't go any lower!");
    const sd = move("swords-dance", { category: "status", power: null, target: "user", meta: { category: "net-good-stats", statChanges: [{ stat: "atk", change: 2 }] } });
    r = resolveTurn(battle([mon({ name: "Me", moves: [sd] })], [mon()]), useMove(), useMove());
    expect(r.state.sides[0].battlers[0].stages.atk).toBe(2);
    expect(texts(r.events)).toContain("Me's Attack rose sharply!");
  });

  it("poison and burn hurt at the end of each turn; toxic gets worse", () => {
    const harmless = move("splash", { category: "status", power: null, meta: { category: "unique" } });
    let s = battle([mon({ name: "P", status: "psn", moves: [harmless] })], [mon({ moves: [harmless] })]);
    let r = resolveTurn(s, useMove(), useMove());
    expect(r.state.sides[0].battlers[0].hp).toBe(100 - 12);
    expect(texts(r.events)).toContain("But nothing happened!");
    s = battle([mon({ name: "T", status: "tox", moves: [harmless] })], [mon({ moves: [harmless] })]);
    r = resolveTurn(s, useMove(), useMove());
    r = resolveTurn(r.state, useMove(), useMove());
    expect(r.state.sides[0].battlers[0].hp).toBe(100 - 6 - 12);
  });

  it("sleep lasts 1–3 turns; a fire type can't be burned", () => {
    const harmless = move("splash", { category: "status", power: null, meta: { category: "unique" } });
    let s = battle([mon({ name: "Z", status: "slp", statusTurns: 2 })], [mon({ moves: [harmless] })]);
    let r = resolveTurn(s, useMove(), useMove());
    expect(texts(r.events)).toContain("Z is fast asleep.");
    r = resolveTurn(r.state, useMove(), useMove());
    r = resolveTurn(r.state, useMove(), useMove());
    expect(texts(r.events)).toContain("Z woke up!");
    const wisp = move("will-o-wisp", { type: "fire", category: "status", power: null, meta: { category: "ailment", ailment: "burn" } });
    s = battle([mon({ moves: [wisp], stats: stats({ spe: 99 }) })], [mon({ name: "Char", types: ["fire"], moves: [harmless] })]);
    r = resolveTurn(s, useMove(), useMove());
    expect(r.state.sides[1].battlers[0].status).toBe(null);
    expect(texts(r.events)).toContain("It doesn't affect Char…");
  });

  it("drain heals the user, recoil hurts it, and Struggle happens with no PP", () => {
    const drain = move("giga-drain", { type: "grass", category: "special", power: 75, meta: { category: "damage+heal", drain: 50 } });
    let r = resolveTurn(battle([mon({ name: "D", hp: 50, moves: [drain], stats: stats({ spe: 99 }) })], [mon({ name: "T", moves: [move("splash", { category: "status", power: null })] })]), useMove(), useMove());
    expect(r.state.sides[0].battlers[0].hp).toBeGreaterThan(50);
    const empty = mon({ name: "E", moves: [move("tackle", { pp: 0 })], stats: stats({ spe: 99 }) });
    r = resolveTurn(battle([empty], [mon({ moves: [move("splash", { category: "status", power: null })] })]), useMove(), useMove());
    expect(texts(r.events)).toContain("E used Struggle!");
    expect(r.state.sides[0].battlers[0].hp).toBe(75); // recoil: a quarter of max HP
  });

  it("running: faster always gets away; never from a trainer", () => {
    let r = resolveTurn(battle([mon({ stats: stats({ spe: 99 }) })], [mon({ stats: stats({ spe: 10 }) })]), { kind: "run" });
    expect(r.state.outcome).toBe("run");
    r = resolveTurn(battle([mon()], [mon()], "trainer"), { kind: "run" });
    expect(r.state.outcome).toBe(null);
    expect(r.state.turn).toBe(0);
  });

  it("switching uses the turn and resets stat changes", () => {
    const a = mon({ name: "A", stages: { ...emptyStages(), atk: 2 } });
    const r = resolveTurn(battle([a, mon({ name: "B" })], [mon({ name: "F" })]), { kind: "switch", index: 1 }, useMove());
    expect(texts(r.events)[0]).toBe("A, come back! Go! B!");
    expect(r.state.sides[0].battlers[0].stages.atk).toBe(0);
    expect(texts(r.events)).toContain("F used tackle!");
  });
});

describe("battle AI and rewards", () => {
  it("trainers pick the move that knocks out; wild Pokémon pick any usable move", () => {
    const foe = mon({ name: "Foe", types: ["water"], moves: [move("tackle", { power: 40 }), move("thunderbolt", { type: "electric", category: "special", power: 90 })] });
    const me = mon({ types: ["water"] });
    const s = battle([me], [foe], "trainer");
    const picks = new Set(Array.from({ length: 20 }, (_, i) => (chooseAction(s, 1, rngFrom(i)) as { index: number }).index));
    expect(picks.has(1)).toBe(true);
    const wild = battle([me], [foe], "wild");
    const wildPicks = new Set(Array.from({ length: 40 }, (_, i) => (chooseAction(wild, 1, rngFrom(i)) as { index: number }).index));
    expect([...wildPicks].sort()).toEqual([0, 1]);
  });

  it("EXP and EVs go to the Pokémon that fought and are still standing", () => {
    const strong = move("mega-punch", { power: 250 });
    const a = mon({ name: "A", ownedId: "own-a", stats: stats({ spe: 99, atk: 300 }), moves: [strong] });
    const b = mon({ name: "B", ownedId: "own-b" });
    const foe = mon({ name: "F", level: 10, baseExp: 64, evYield: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 2 } });
    const r = resolveTurn(battle([a, b], [foe]), useMove(), useMove());
    expect(r.state.outcome).toBe("win");
    const rewards = battleRewards(r.state);
    expect(rewards.exp).toEqual({ "own-a": 91 });
    expect(rewards.evs["own-a"].spe).toBe(2);
    expect(addEvs({ hp: 250, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, { hp: 5, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }).hp).toBe(252);
    const nearCap = { hp: 252, atk: 252, def: 4, spa: 0, spd: 0, spe: 0 };
    expect(addEvs(nearCap, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 9 }).spe).toBe(2); // 510 total
  });

  it("reads battle effects from PokéAPI move data", () => {
    const m = parseMove({
      id: 1, name: "close-combat", accuracy: 100, power: 120, pp: 5, priority: 0, effect_chance: null,
      type: { name: "fighting" }, damage_class: { name: "physical" },
      meta: { category: { name: "damage+raise" }, ailment: { name: "none" }, crit_rate: 0, drain: 0, healing: 0, flinch_chance: 0, stat_chance: 100, min_hits: null, max_hits: null },
      stat_changes: [{ change: -1, stat: { name: "defense" } }, { change: -1, stat: { name: "special-defense" } }],
    });
    expect(m.meta!.category).toBe("damage+raise");
    expect(m.meta!.ailment).toBe(null);
    expect(m.meta!.statChanges).toEqual([{ stat: "def", change: -1 }, { stat: "spd", change: -1 }]);
  });
});
