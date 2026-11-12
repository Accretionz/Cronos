import { describe, expect, it } from "vitest";
import { COMMON_DEX, LEGENDARY_DEX, MYTHICAL_DEX } from "../../pokemon/rarity";
import { DEX_SIZE } from "../../pokemon/species";
import { MACHINES, ballFor, machineById, oddsOf, pull } from "./machines";
import { recentSummons, summonStats, type Summon } from "./model";

const machine = (id: string) => machineById(id);
/** A fake random source that returns these numbers in order. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("rarity pools", () => {
  it("cover the Pokédex once, with no overlaps", () => {
    expect(LEGENDARY_DEX.length).toBe(71);
    expect(MYTHICAL_DEX.length).toBe(23);
    const all = new Set([...COMMON_DEX, ...LEGENDARY_DEX, ...MYTHICAL_DEX]);
    expect(all.size).toBe(DEX_SIZE);
    expect(COMMON_DEX.length + LEGENDARY_DEX.length + MYTHICAL_DEX.length).toBe(DEX_SIZE);
    expect([LEGENDARY_DEX.includes(150), MYTHICAL_DEX.includes(151), COMMON_DEX.includes(25)]).toEqual([true, true, true]);
  });
});

describe("machines", () => {
  it("cost more as the odds get better", () => {
    const [poke, great, ultra] = ["poke", "great", "ultra"].map(machine);
    expect(poke.cost < great.cost && great.cost < ultra.cost).toBe(true);
    expect(poke.legendary < great.legendary && great.legendary < ultra.legendary).toBe(true);
    expect(poke.shinyOneIn > great.shinyOneIn && great.shinyOneIn > ultra.shinyOneIn).toBe(true);
    expect(machine("master").cost).toBeGreaterThan(machine("luxury").cost);
    expect(machine("luxury").cost).toBeGreaterThan(ultra.cost);
  });

  it("rolls the tier, then the Pokémon, then shiny", () => {
    const poke = machine("poke");
    expect(pull(poke, seq(0.5, 0, 0.9))).toEqual({ dex: COMMON_DEX[0], shiny: false, tier: "common" });
    expect(pull(poke, seq(0.001, 0, 0.9))).toEqual({ dex: MYTHICAL_DEX[0], shiny: false, tier: "mythical" });
    expect(pull(poke, seq(0.005, 0.99999, 0.9)).tier).toBe("legendary");
    expect(pull(poke, seq(0.5, 0.5, 0.001)).shiny).toBe(true);
  });

  it("Master gives only Legendaries and Mythicals; Luxury only shinies", () => {
    const master = machine("master");
    const luxury = machine("luxury");
    for (let i = 0; i < 2000; i++) {
      expect(pull(master).tier === "common").toBe(false);
      expect(pull(luxury).shiny).toBe(true);
    }
  });

  it("real odds match the advertised ones (roughly)", () => {
    let state = 12345;
    const rng = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
    const n = 40000;
    for (const m of MACHINES.filter((x) => x.id !== "master")) {
      let rare = 0;
      for (let i = 0; i < n; i++) if (pull(m, rng).tier !== "common") rare++;
      const expected = m.legendary + m.mythical;
      expect(Math.abs(rare / n - expected)).toBeLessThan(0.006);
    }
  });

  it("the capsule hints at what's inside", () => {
    expect(ballFor(machine("poke"), "common")).toBe("poke");
    expect(ballFor(machine("poke"), "legendary")).toBe("ultra");
    expect(ballFor(machine("great"), "mythical")).toBe("master");
    expect(ballFor(machine("ultra"), "common")).toBe("ultra");
    expect(ballFor(machine("master"), "legendary")).toBe("master");
    expect(ballFor(machine("luxury"), "mythical")).toBe("luxury");
  });

  it("shows odds in plain numbers", () => {
    expect(oddsOf(machine("poke"))).toEqual([
      { label: "Common", value: "98.7%" },
      { label: "Legendary", value: "1%" },
      { label: "Mythical", value: "0.3%" },
      { label: "Shiny", value: "1 in 256" },
    ]);
    expect(oddsOf(machine("master")).map((o) => o.value)).toEqual(["80%", "20%", "1 in 64"]);
    const lux = oddsOf(machine("luxury"));
    expect(lux[lux.length - 1].value).toBe("Always");
  });

  it("unknown ids fall back to the Poké Ball machine", () => {
    expect(machineById("nope").id).toBe("poke");
  });
});

describe("history", () => {
  const s = (dex: number, shiny: boolean, at: string) =>
    ({ id: at, type: "pokemon-summon", title: "", status: "open", tags: [], createdAt: at, updatedAt: at,
       data: { dex, name: String(dex), types: [], rarity: "common", shiny } }) as Summon;
  const list = [s(25, false, "2026-10-01T10:00:00Z"), s(25, true, "2026-10-03T10:00:00Z"), s(1, false, "2026-10-02T10:00:00Z")];

  it("counts summons, different Pokémon and shinies", () => {
    expect(summonStats(list)).toEqual({ total: 3, unique: 2, shinies: 1 });
    expect(summonStats([])).toEqual({ total: 0, unique: 0, shinies: 0 });
  });
  it("lists newest first, up to a limit", () => {
    expect(recentSummons(list, 2).map((x) => x.createdAt)).toEqual(["2026-10-03T10:00:00Z", "2026-10-02T10:00:00Z"]);
  });
});
