import { DEX_SIZE } from "./species";

/**
 * National Dex numbers PokéAPI marks as Legendary or Mythical (checked October 2026, through
 * #1025). Used to build summon pools without downloading every species. The rarity shown
 * on a summoned Pokémon still comes from PokéAPI itself.
 * Paradox Pokémon and Ultra Beasts are not Legendary in PokéAPI, so they're common here.
 */
export const LEGENDARY_DEX: readonly number[] = [
  144, 145, 146, 150, // Gen I
  243, 244, 245, 249, 250, // Gen II
  377, 378, 379, 380, 381, 382, 383, 384, // Gen III
  480, 481, 482, 483, 484, 485, 486, 487, 488, // Gen IV
  638, 639, 640, 641, 642, 643, 644, 645, 646, // Gen V
  716, 717, 718, // Gen VI
  772, 773, 785, 786, 787, 788, 789, 790, 791, 792, 800, // Gen VII
  888, 889, 890, 891, 892, 894, 895, 896, 897, 898, 905, // Gen VIII
  1001, 1002, 1003, 1004, 1007, 1008, 1014, 1015, 1016, 1017, 1024, // Gen IX
];

export const MYTHICAL_DEX: readonly number[] = [
  151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025,
];

const special = new Set([...LEGENDARY_DEX, ...MYTHICAL_DEX]);

/** Everyone else: the "common" pool. */
export const COMMON_DEX: readonly number[] = Array.from({ length: DEX_SIZE }, (_, i) => i + 1).filter((n) => !special.has(n));
