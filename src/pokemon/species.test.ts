import { describe, expect, it } from "vitest";
import { artworkUrl, dexLabel, generationNumber, parsePokemon, spriteUrl } from "./species";

describe("labels and urls", () => {
  it("pads dex numbers", () => {
    expect(dexLabel(25)).toBe("#0025");
    expect(dexLabel(1025)).toBe("#1025");
  });
  it("builds PokéAPI sprite urls", () => {
    expect(spriteUrl(25)).toBe("https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png");
    expect(spriteUrl(25, true)).toBe("https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/25.png");
    expect(artworkUrl(1000)).toBe(
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1000.png",
    );
  });
  it("reads generation numerals", () => {
    expect(["generation-i", "generation-iv", "generation-vi", "generation-ix"].map(generationNumber)).toEqual([1, 4, 6, 9]);
    expect(generationNumber(undefined)).toBe(0);
  });
});

describe("parsePokemon", () => {
  it("uses the English name, ordered types and rarity", () => {
    const info = parsePokemon(
      { id: 122, name: "mr-mime", types: [{ slot: 2, type: { name: "fairy" } }, { slot: 1, type: { name: "psychic" } }] },
      {
        id: 122,
        name: "mr-mime",
        is_legendary: false,
        is_mythical: false,
        generation: { name: "generation-i" },
        names: [
          { name: "Barrierd", language: { name: "de" } },
          { name: "Mr. Mime", language: { name: "en" } },
        ],
      },
    );
    expect(info).toEqual({ dex: 122, name: "Mr. Mime", types: ["psychic", "fairy"], rarity: "common", generation: 1 });
  });
  it("marks legendary and mythical, and falls back to the slug for a name", () => {
    expect(parsePokemon({ id: 150, name: "mewtwo" }, { id: 150, name: "mewtwo", is_legendary: true }).rarity).toBe("legendary");
    const mew = parsePokemon({ id: 151, name: "mew" }, { id: 151, name: "mew", is_mythical: true, is_legendary: false });
    expect(mew.rarity).toBe("mythical");
    expect(mew.name).toBe("Mew");
    expect(parsePokemon({ id: 1, name: "x" }, { id: 785, name: "tapu-koko" }).name).toBe("Tapu Koko");
  });
});
