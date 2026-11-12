/**
 * The Pokédex data layer: game data from PokéAPI (cached), and the main-series formulas
 * (EXP curves, stats, natures, individual values, movesets, type matchups). Battle code
 * should build on these rather than re-deriving anything.
 *
 * Pure files (no React, no network): types, growth, stats, individual, moves, typechart, parse.
 */
export * from "./types";
export * from "./growth";
export * from "./stats";
export * from "./individual";
export * from "./moves";
export * from "./typechart";
export * from "./parse";
export * from "./api";
export * from "./hooks";
