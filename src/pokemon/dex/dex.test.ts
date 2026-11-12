import { describe, expect, it } from "vitest";
import { GROWTH_RATES, expAtLevel, levelFromExp } from "./growth";
import { abilityOf, genderOf, individualFromSeed, natureOf, rollIndividual } from "./individual";
import { defaultMoveset, movesLearnedBetween, upcomingMoves } from "./moves";
import { learnsetFrom, parseMove, parseSpecies, slugToName, type ApiPokemonFull, type ApiSpeciesFull } from "./parse";
import { NATURES, calcStat, calcStats, natureEffect } from "./stats";
import { effectiveness, typeMultiplier } from "./typechart";
import type { Stats } from "./types";

describe("EXP curves match the games (values from PokéAPI's /growth-rate tables)", () => {
  const known: Record<string, Record<number, number>> = {
    "slow-then-very-fast": { 1: 0, 2: 15, 5: 237, 10: 1800, 49: 120001, 50: 125000, 51: 131324, 67: 249633, 68: 257834, 69: 267406, 98: 583539, 99: 591882, 100: 600000 },
    "fast-then-very-slow": { 1: 0, 2: 4, 5: 65, 10: 540, 14: 1591, 15: 1957, 16: 2457, 35: 42017, 36: 46656, 37: 50653, 50: 142500, 99: 1571884, 100: 1640000 },
    "medium-slow": { 1: 0, 2: 9, 3: 57, 5: 135, 10: 560, 50: 117360, 100: 1059860 },
    fast: { 1: 0, 2: 6, 5: 100, 7: 274, 10: 800, 50: 100000, 100: 800000 },
    slow: { 1: 0, 2: 10, 5: 156, 7: 428, 10: 1250, 50: 156250, 100: 1250000 },
    medium: { 1: 0, 2: 8, 5: 125, 10: 1000, 50: 125000, 100: 1000000 },
  };
  for (const [rate, levels] of Object.entries(known)) {
    it(rate, () => {
      for (const [lv, exp] of Object.entries(levels)) expect([Number(lv), expAtLevel(rate as never, Number(lv))]).toEqual([Number(lv), exp]);
    });
  }

  it("works out the level from EXP, for every curve and level", () => {
    for (const rate of GROWTH_RATES) {
      for (let lv = 1; lv <= 100; lv++) {
        expect(levelFromExp(rate, expAtLevel(rate, lv)).level).toBe(lv);
        if (lv > 1) expect(levelFromExp(rate, expAtLevel(rate, lv) - 1).level).toBe(lv - 1);
      }
    }
    expect(levelFromExp("medium", 150)).toEqual({ level: 5, exp: 150, into: 25, needed: 91, toNext: 66 });
  });
});

describe("stats", () => {
  it("match the games' formula (Bulbapedia's Lv. 78 Adamant Garchomp example)", () => {
    const base: Stats = { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 };
    const ivs: Stats = { hp: 24, atk: 12, def: 30, spa: 16, spd: 23, spe: 5 };
    const evs: Stats = { hp: 74, atk: 190, def: 91, spa: 48, spd: 84, spe: 23 };
    expect(calcStats(base, ivs, evs, 78, "Adamant")).toEqual({ hp: 289, atk: 278, def: 193, spa: 135, spd: 171, spe: 171 });
  });
  it("natures raise one stat and lower another (five are neutral)", () => {
    expect(NATURES.length).toBe(25);
    expect(natureEffect("Adamant")).toEqual({ up: "atk", down: "spa" });
    expect(natureEffect("Timid")).toEqual({ up: "spe", down: "atk" });
    expect(natureEffect("Modest")).toEqual({ up: "spa", down: "atk" });
    expect(natureEffect("Hardy")).toEqual({ up: null, down: null });
    expect(NATURES.filter((n) => natureEffect(n).up === null)).toEqual(["Hardy", "Docile", "Serious", "Bashful", "Quirky"]);
    expect(calcStat("spe", 100, 31, 252, 100, "Jolly")).toBe(328);
  });
});

describe("individual values", () => {
  it("nature, gender and ability come from the PID like in the games", () => {
    expect(natureOf(0)).toBe("Hardy");
    expect(natureOf(3)).toBe("Adamant");
    expect(natureOf(25 + 13)).toBe("Jolly");
    expect([genderOf(30, 1), genderOf(31, 1), genderOf(126, 4), genderOf(127, 4)]).toEqual(["female", "male", "female", "male"]);
    expect([genderOf(5, -1), genderOf(5, 0), genderOf(255, 8)]).toEqual(["genderless", "male", "female"]);
    const abilities = [
      { slug: "overgrow", name: "Overgrow", hidden: false, slot: 1 },
      { slug: "chlorophyll", name: "Chlorophyll", hidden: true, slot: 3 },
    ];
    expect(abilityOf(7, abilities)!.slug).toBe("overgrow");
    const two = [...abilities, { slug: "leaf-guard", name: "Leaf Guard", hidden: false, slot: 2 }];
    expect([abilityOf(0, two)!.slug, abilityOf(1, two)!.slug]).toEqual(["overgrow", "leaf-guard"]);
  });
  it("IVs are 0-31, EVs start at 0, seeded ones repeat", () => {
    for (let i = 0; i < 200; i++) {
      const ind = rollIndividual();
      expect(Object.values(ind.ivs).every((v) => v >= 0 && v <= 31 && Number.isInteger(v))).toBe(true);
      expect(Object.values(ind.evs).every((v) => v === 0)).toBe(true);
    }
    expect(individualFromSeed("abc")).toEqual(individualFromSeed("abc"));
    expect(individualFromSeed("abc")).not.toEqual(individualFromSeed("abd"));
  });
});

describe("moves", () => {
  const learnset = [
    { move: "thunder-shock", level: 1 },
    { move: "growl", level: 1 },
    { move: "tail-whip", level: 1 },
    { move: "quick-attack", level: 1 },
    { move: "thunder-wave", level: 4 },
    { move: "double-team", level: 8 },
    { move: "thunderbolt", level: 36 },
    { move: "volt-switch", level: 0 },
  ];
  it("knows the last four moves learned by its level", () => {
    expect(defaultMoveset(learnset, 5)).toEqual(["tail-whip", "quick-attack", "volt-switch", "thunder-wave"]);
    expect(defaultMoveset(learnset, 8)).toEqual(["quick-attack", "volt-switch", "thunder-wave", "double-team"]);
    expect(defaultMoveset(learnset, 36)).toEqual(["volt-switch", "thunder-wave", "double-team", "thunderbolt"]);
    expect(defaultMoveset([], 50)).toEqual([]);
  });
  it("lists what's learned on the way up, and what's next", () => {
    expect(movesLearnedBetween(learnset, 5, 36)).toEqual(["double-team", "thunderbolt"]);
    expect(upcomingMoves(learnset, 8).map((e) => e.move)).toEqual(["thunderbolt"]);
  });
});

describe("type matchups", () => {
  it("multiply across two types", () => {
    expect(effectiveness("electric", ["water", "flying"])).toBe(4);
    expect(effectiveness("ground", ["flying"])).toBe(0);
    expect(effectiveness("fire", ["water", "rock"])).toBe(0.25);
    expect(effectiveness("fairy", ["dragon", "dark"])).toBe(4);
    expect(typeMultiplier("normal", "ghost")).toBe(0);
    expect(typeMultiplier("steel", "fairy")).toBe(2);
    expect(typeMultiplier("made-up", "water")).toBe(1);
  });
});

describe("PokéAPI parsing", () => {
  const pokemon: ApiPokemonFull = {
    id: 25, name: "pikachu", base_experience: 112, height: 4, weight: 60,
    types: [{ slot: 1, type: { name: "electric" } }],
    stats: [
      { base_stat: 35, effort: 0, stat: { name: "hp" } }, { base_stat: 55, effort: 0, stat: { name: "attack" } },
      { base_stat: 40, effort: 0, stat: { name: "defense" } }, { base_stat: 50, effort: 0, stat: { name: "special-attack" } },
      { base_stat: 50, effort: 0, stat: { name: "special-defense" } }, { base_stat: 90, effort: 2, stat: { name: "speed" } },
    ],
    abilities: [{ is_hidden: true, slot: 3, ability: { name: "lightning-rod" } }, { is_hidden: false, slot: 1, ability: { name: "static" } }],
    moves: [
      { move: { name: "thunderbolt" }, version_group_details: [
        { level_learned_at: 36, move_learn_method: { name: "level-up" }, version_group: { name: "scarlet-violet" } },
        { level_learned_at: 26, move_learn_method: { name: "level-up" }, version_group: { name: "red-blue" } },
        { level_learned_at: 0, move_learn_method: { name: "machine" }, version_group: { name: "scarlet-violet" } },
      ] },
      { move: { name: "thunder-shock" }, version_group_details: [{ level_learned_at: 1, move_learn_method: { name: "level-up" }, version_group: { name: "scarlet-violet" } }] },
      { move: { name: "surf" }, version_group_details: [{ level_learned_at: 0, move_learn_method: { name: "machine" }, version_group: { name: "red-blue" } }] },
    ],
  };
  const species: ApiSpeciesFull = {
    id: 25, name: "pikachu", growth_rate: { name: "medium" }, gender_rate: 4, capture_rate: 190, base_happiness: 50,
    generation: { name: "generation-i" }, evolution_chain: { url: "https://pokeapi.co/api/v2/evolution-chain/10/" },
    names: [{ name: "Pikachu", language: { name: "en" } }],
    genera: [{ genus: "Mouse Pokémon", language: { name: "en" } }],
    flavor_text_entries: [
      { flavor_text: "Old\ftext", language: { name: "en" } },
      { flavor_text: "It stores\nelectricity in its\fcheeks.", language: { name: "en" } },
      { flavor_text: "Japanisch", language: { name: "de" } },
    ],
  };

  it("turns species + pokemon into SpeciesData", () => {
    const s = parseSpecies(pokemon, species);
    expect([s.dex, s.name, s.genus, s.growthRate, s.genderRate, s.captureRate, s.height, s.weight, s.baseExp, s.evolutionChainId]).toEqual(
      [25, "Pikachu", "Mouse Pokémon", "medium", 4, 190, 0.4, 6, 112, 10],
    );
    expect(s.baseStats).toEqual({ hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 });
    expect(s.evYield.spe).toBe(2);
    expect(s.abilities.map((a) => [a.slug, a.hidden])).toEqual([["static", false], ["lightning-rod", true]]);
    expect(s.learnsetVersion).toBe("scarlet-violet");
    expect(s.learnset).toEqual([{ move: "thunder-shock", level: 1 }, { move: "thunderbolt", level: 36 }]);
    expect(s.otherMoves).toEqual(["thunderbolt"]);
    expect(s.flavor).toBe("It stores electricity in its cheeks.");
  });

  it("falls back to older games when the newest has no learnset", () => {
    const { version, learnset } = learnsetFrom([
      { move: { name: "tackle" }, version_group_details: [{ level_learned_at: 1, move_learn_method: { name: "level-up" }, version_group: { name: "red-blue" } }] },
    ]);
    expect([version, learnset]).toEqual(["red-blue", [{ move: "tackle", level: 1 }]]);
  });

  it("parses a move", () => {
    const m = parseMove({
      id: 85, name: "thunderbolt", accuracy: 100, power: 90, pp: 15, priority: 0, effect_chance: 10,
      type: { name: "electric" }, damage_class: { name: "special" }, target: { name: "selected-pokemon" },
      names: [{ name: "Thunderbolt", language: { name: "en" } }],
      effect_entries: [{ short_effect: "Has a $effect_chance% chance to paralyze the target.", effect: "", language: { name: "en" } }],
    });
    expect(m).toEqual({ id: 85, slug: "thunderbolt", name: "Thunderbolt", type: "electric", category: "special", power: 90, accuracy: 100, pp: 15, priority: 0, effect: "Has a 10% chance to paralyze the target.", effectChance: 10, target: "selected-pokemon", meta: m.meta });
    expect(m.meta!.category).toBe("damage"); // no "meta" in this sample: plain damage
    expect(slugToName("will-o-wisp")).toBe("Will O Wisp");
  });
});
