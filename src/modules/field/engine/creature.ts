import type { Rarity } from "../../../pokemon/species";
import { hashString, seededRng, type Vec } from "./math";
import type { Movement } from "./tilemap";

/** What the field needs to know about a Pokémon. Built from an owned Pokémon item. */
export interface CreatureSpec {
  id: string;
  dex: number;
  /** Name to show (nickname if it has one). */
  name: string;
  types: string[];
  shiny: boolean;
  rarity: Rarity;
  /** Shown on its label. */
  level?: number;
  /** On the player's team (marked with a star). */
  team?: boolean;
}

export type EmoteKind = "heart" | "note" | "exclaim" | "question" | "sleep" | "sparkle";

export interface Emote {
  kind: EmoteKind;
  start: number;
  until: number;
}

/** What a Pokémon is doing. Add new behaviors as new kinds (e.g. "eat", "play", "train"). */
export type Activity =
  | { kind: "arrive"; until: number }
  | { kind: "idle"; until: number; nextLook: number }
  | { kind: "walk"; path: Vec[]; reason: "wander" | "command" }
  | { kind: "sleep"; until: number; nextZ: number }
  | { kind: "react"; until: number }
  | { kind: "greet"; until: number; with: string };

/** Fixed traits per Pokémon, derived from its id so they're the same every visit. */
export interface Personality {
  /** 0..1: how often it wanders instead of resting. */
  energy: number;
  /** 0..1: how often it stops to greet others. */
  sociable: number;
  /** World units per second. */
  speed: number;
}

/** Flying types fly, Water types swim, everyone else walks. */
export function movementFor(types: string[]): Movement {
  if (types.includes("flying")) return "fly";
  if (types.includes("water")) return "swim";
  return "walk";
}

export function personalityFor(id: string, movement: Movement): Personality {
  const rng = seededRng(hashString(id));
  const energy = 0.35 + rng() * 0.6;
  return {
    energy,
    sociable: 0.2 + rng() * 0.8,
    speed: (movement === "fly" ? 62 : 40) + energy * 26,
  };
}

/** One Pokémon in the world. Plain data; the World moves it and the Renderer draws it. */
export class Creature {
  spec: CreatureSpec;
  readonly movement: Movement;
  readonly personality: Personality;
  pos: Vec;
  /** -1 = facing left (how front sprites are drawn), 1 = facing right (drawn mirrored). */
  facing: -1 | 1 = -1;
  activity: Activity;
  emote: Emote | null = null;
  /** Grows while walking; drives the walking hop. */
  stride = 0;
  /** When the current hop (tap reaction) started, or -1. */
  hopStart = -1;
  /** When it appeared, for the arrival animation. */
  bornAt: number;
  /** No greeting again before this time. */
  greetReadyAt = 0;

  constructor(spec: CreatureSpec, pos: Vec, now: number) {
    this.spec = spec;
    this.movement = movementFor(spec.types);
    this.personality = personalityFor(spec.id, this.movement);
    this.pos = { ...pos };
    this.bornAt = now;
    this.activity = { kind: "idle", until: now + 0.5, nextLook: now + 1 };
  }

  get id() {
    return this.spec.id;
  }

  get busy(): boolean {
    const k = this.activity.kind;
    return k === "react" || k === "greet" || k === "arrive" || (k === "walk" && this.activity.reason === "command");
  }

  showEmote(kind: EmoteKind, now: number, seconds = 1.6) {
    this.emote = { kind, start: now, until: now + seconds };
  }
}
