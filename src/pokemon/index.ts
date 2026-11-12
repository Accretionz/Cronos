/**
 * Shared Pokémon library. Pokémon features (modules) may import from here; this folder
 * itself only imports from core and ui, never from a module. See ARCHITECTURE.md.
 */
export * from "./species";
export * from "./api";
export * from "./owned";
export * from "./wallet";
export * from "./rarity";
export * from "./levels";
export * from "./team";
export * from "./dex";
export * from "./facts";
export * from "./hooks";
export * from "./components";
export { PokemonSummary } from "./summary/PokemonSummary";
