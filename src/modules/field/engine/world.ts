import { Creature, type CreatureSpec } from "./creature";
import { clamp, dist, randRange, type Rng, type Vec } from "./math";
import { findPath, toWaypoints } from "./pathfinding";
import { TILE, Tile, type Cell, type Movement, type TileMap } from "./tilemap";

/** Where each Pokémon was, so the field looks the same when you come back to the page. */
export type WorldSnapshot = Record<string, { x: number; y: number; facing: -1 | 1 }>;

export interface SyncOptions {
  /** Play the arrival animation for Pokémon that weren't here before (false on first load). */
  animate?: boolean;
  /** Put Pokémon back where they were. */
  restore?: WorldSnapshot;
}

/** Tunable behavior numbers in one place. */
export const BEHAVIOR = {
  /** How far a wander goes, in tiles. */
  wanderRadius: 6,
  /** Pokémon closer than this (world units) gently push apart. */
  personalSpace: 22,
  /** Pokémon this close may stop and greet each other. */
  greetDistance: 46,
  /** Seconds before the same Pokémon greets again. */
  greetCooldown: 25,
  /** Chance per second that two nearby, sociable Pokémon greet. */
  greetChance: 0.35,
} as const;

/**
 * The simulation: Pokémon, what they're doing, and where they are. No drawing and no DOM,
 * so it runs the same in tests. Call update(dt) with a fixed step (see loop.ts).
 */
export class World {
  readonly creatures = new Map<string, Creature>();
  /** Seconds since the world started. */
  time = 0;
  /** True at night: Pokémon sleep more. Set by the host from the clock. */
  night = false;

  constructor(
    readonly map: TileMap,
    private rng: Rng = Math.random,
  ) {}

  /* ---------------- Roster ---------------- */

  /** Make the world's Pokémon match the list: add new ones, update changed ones, remove missing ones. */
  sync(specs: CreatureSpec[], opts: SyncOptions = {}): void {
    const keep = new Set(specs.map((s) => s.id));
    for (const id of [...this.creatures.keys()]) if (!keep.has(id)) this.creatures.delete(id);
    for (const spec of specs) {
      const existing = this.creatures.get(spec.id);
      if (existing) {
        existing.spec = spec;
        continue;
      }
      const saved = opts.restore?.[spec.id];
      const c = new Creature(spec, saved ? { x: saved.x, y: saved.y } : this.randomSpot(), this.time);
      if (saved && this.map.passableAt(saved, c.movement)) c.facing = saved.facing;
      else if (saved) c.pos = this.randomSpot();
      if (opts.animate) {
        c.activity = { kind: "arrive", until: this.time + 0.9 };
        c.showEmote("sparkle", this.time, 1.4);
      } else {
        c.bornAt = -10; // already here: no arrival animation
        c.activity = { kind: "idle", until: this.time + randRange(this.rng, 0.2, 3), nextLook: this.time + 1 };
      }
      this.creatures.set(spec.id, c);
    }
  }

  snapshot(): WorldSnapshot {
    const out: WorldSnapshot = {};
    for (const c of this.creatures.values()) out[c.id] = { x: c.pos.x, y: c.pos.y, facing: c.facing };
    return out;
  }

  /* ---------------- Player actions ---------------- */

  /** The player tapped this Pokémon: it hops and shows a heart. */
  poke(id: string): void {
    const c = this.creatures.get(id);
    if (!c) return;
    c.activity = { kind: "react", until: this.time + 0.9 };
    c.hopStart = this.time;
    c.showEmote("heart", this.time);
  }

  /**
   * Send a Pokémon somewhere. Finds the nearest spot it can reach (a Pokémon that can't
   * swim stops at the shore). Returns where it's going, or null if there's no way there.
   */
  command(id: string, target: Vec): Vec | null {
    const c = this.creatures.get(id);
    if (!c) return null;
    const dest = this.nearestReachable(target, c.movement);
    const path = dest && this.pathTo(c, dest.cell, dest.point);
    if (!dest || !path) {
      c.showEmote("question", this.time);
      return null;
    }
    c.activity = { kind: "walk", path, reason: "command" };
    c.showEmote("exclaim", this.time, 0.9);
    return dest.point;
  }

  /** The Pokémon whose body covers this point (front-most first). `size` gives each one's drawn size. */
  pick(p: Vec, size: (c: Creature) => { w: number; h: number }, pad = 6): Creature | null {
    const hits = [...this.creatures.values()].filter((c) => {
      const { w, h } = size(c);
      const lift = c.movement === "fly" ? FLY_HEIGHT : 0;
      return p.x >= c.pos.x - w / 2 - pad && p.x <= c.pos.x + w / 2 + pad && p.y <= c.pos.y + pad - lift + 4 && p.y >= c.pos.y - h - pad - lift;
    });
    hits.sort((a, b) => b.pos.y - a.pos.y);
    return hits[0] ?? null;
  }

  /* ---------------- Simulation ---------------- */

  update(dt: number): void {
    this.time += dt;
    for (const c of this.creatures.values()) {
      this.think(c);
      this.move(c, dt);
      if (c.emote && this.time > c.emote.until) c.emote = null;
    }
    this.separate();
    this.socialize(dt);
  }

  private think(c: Creature) {
    const a = c.activity;
    const now = this.time;
    switch (a.kind) {
      case "arrive":
      case "react":
        if (now >= a.until) this.rest(c, 1, 3);
        break;
      case "greet":
        if (now >= a.until) {
          c.greetReadyAt = now + BEHAVIOR.greetCooldown;
          this.rest(c, 1, 2.5);
        }
        break;
      case "sleep":
        if (now >= a.nextZ) {
          c.showEmote("sleep", now, 1.8);
          a.nextZ = now + 2.6;
        }
        if (now >= a.until && !(this.night && this.rng() < 0.7)) this.rest(c, 1, 2);
        else if (now >= a.until) a.until = now + randRange(this.rng, 6, 12);
        break;
      case "idle":
        if (now >= a.nextLook) {
          if (this.rng() < 0.45) c.facing = c.facing === 1 ? -1 : 1;
          a.nextLook = now + randRange(this.rng, 1.2, 3.2);
        }
        if (now >= a.until) this.decide(c);
        break;
      case "walk":
        break; // movement handles it
    }
  }

  /** Pick the next thing to do after resting. */
  private decide(c: Creature) {
    const r = this.rng();
    const sleepChance = this.night ? 0.45 : 0.05;
    if (r < sleepChance) {
      c.activity = { kind: "sleep", until: this.time + randRange(this.rng, this.night ? 14 : 6, this.night ? 30 : 14), nextZ: this.time + 0.4 };
      return;
    }
    if (r < sleepChance + 0.25 + c.personality.energy * 0.55) {
      const goal = this.wanderGoal(c);
      const path = goal && this.pathTo(c, goal);
      if (path) {
        c.activity = { kind: "walk", path, reason: "wander" };
        return;
      }
    }
    if (this.rng() < 0.08) c.showEmote("note", this.time);
    this.rest(c, 1.5, 5);
  }

  private rest(c: Creature, min: number, max: number) {
    c.activity = { kind: "idle", until: this.time + randRange(this.rng, min, max), nextLook: this.time + randRange(this.rng, 0.6, 2) };
  }

  private move(c: Creature, dt: number) {
    const a = c.activity;
    if (a.kind !== "walk") return;
    const target = a.path[0];
    if (!target) {
      if (a.reason === "command") c.showEmote("note", this.time, 1.2);
      this.rest(c, 2, 4);
      return;
    }
    const dx = target.x - c.pos.x;
    const dy = target.y - c.pos.y;
    const d = Math.hypot(dx, dy);
    let speed = c.personality.speed * (a.reason === "command" ? 1.35 : 1);
    const kind = this.map.kindAt(c.pos);
    if (c.movement !== "fly" && kind === Tile.TallGrass) speed *= 0.8;
    if (c.movement === "swim" && kind === Tile.Water) speed *= 0.85;
    const step = speed * dt;
    if (Math.abs(dx) > 1) c.facing = dx > 0 ? 1 : -1;
    if (d <= step) {
      c.pos = { x: target.x, y: target.y };
      a.path.shift();
    } else {
      c.pos = { x: c.pos.x + (dx / d) * step, y: c.pos.y + (dy / d) * step };
    }
    c.stride += Math.min(step, d);
  }

  /** Nudge overlapping Pokémon apart, without pushing anyone into a tree or the pond. */
  private separate() {
    const list = [...this.creatures.values()];
    const space = BEHAVIOR.personalSpace;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if ((a.movement === "fly") !== (b.movement === "fly")) continue; // one is in the air
        let dx = b.pos.x - a.pos.x;
        let dy = b.pos.y - a.pos.y;
        let d = Math.hypot(dx, dy);
        if (d >= space) continue;
        if (d < 0.01) {
          dx = this.rng() - 0.5;
          dy = this.rng() - 0.5;
          d = Math.hypot(dx, dy);
        }
        const push = ((space - d) / 2) * 0.25;
        const ux = (dx / d) * push;
        const uy = (dy / d) * push;
        this.nudge(a, -ux, -uy);
        this.nudge(b, ux, uy);
      }
    }
  }

  private nudge(c: Creature, dx: number, dy: number) {
    if (c.activity.kind === "sleep") return;
    const next = { x: clamp(c.pos.x + dx, 1, this.map.width - 1), y: clamp(c.pos.y + dy, 1, this.map.height - 1) };
    if (this.map.passableAt(next, c.movement)) c.pos = next;
  }

  /** Two idle or wandering Pokémon that meet may stop and say hello. */
  private socialize(dt: number) {
    const list = [...this.creatures.values()].filter(
      (c) => !c.busy && c.activity.kind !== "sleep" && this.time >= c.greetReadyAt,
    );
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.busy || b.busy || dist(a.pos, b.pos) > BEHAVIOR.greetDistance) continue;
        const chance = BEHAVIOR.greetChance * dt * a.personality.sociable * b.personality.sociable * 2;
        if (this.rng() >= chance) continue;
        const until = this.time + 1.8;
        a.activity = { kind: "greet", until, with: b.id };
        b.activity = { kind: "greet", until, with: a.id };
        a.facing = b.pos.x >= a.pos.x ? 1 : -1;
        b.facing = a.pos.x >= b.pos.x ? 1 : -1;
        a.showEmote("note", this.time);
        b.showEmote(this.rng() < 0.5 ? "heart" : "note", this.time + 0.25);
      }
    }
  }

  /* ---------------- Navigation helpers ---------------- */

  private pathTo(c: Creature, goal: Cell, end?: Vec): Vec[] | null {
    const cells = findPath(this.map, this.map.cellAt(c.pos), goal, c.movement);
    if (!cells) return null;
    return toWaypoints(this.map, c.pos, cells, c.movement, end ?? jitter(this.map.center(goal), this.rng));
  }

  private wanderGoal(c: Creature): Cell | null {
    const reach = this.map.reachable(c.movement);
    const here = this.map.cellAt(c.pos);
    const r = BEHAVIOR.wanderRadius;
    const wantsWater = c.movement === "swim" && this.rng() < 0.5;
    for (let tries = 0; tries < 16; tries++) {
      const cell = this.map.cellOf(reach[Math.floor(this.rng() * reach.length)]);
      if (Math.abs(cell.col - here.col) > r || Math.abs(cell.row - here.row) > r) continue;
      if (cell.col === here.col && cell.row === here.row) continue;
      const water = this.map.get(cell.col, cell.row) === Tile.Water;
      if (c.movement === "swim" && water !== wantsWater && tries < 10) continue;
      return cell;
    }
    return null;
  }

  /** A random reachable land spot for a new Pokémon. */
  randomSpot(): Vec {
    const land = this.map.reachable("walk");
    const cell = this.map.cellOf(land[Math.floor(this.rng() * land.length)]);
    return jitter(this.map.center(cell), this.rng);
  }

  /** The reachable tile nearest to a point (searching outward a few tiles). */
  nearestReachable(p: Vec, movement: Movement): { cell: Cell; point: Vec } | null {
    const reach = new Set(this.map.reachable(movement));
    const origin = this.map.cellAt({ x: clamp(p.x, 0, this.map.width - 1), y: clamp(p.y, 0, this.map.height - 1) });
    let best: Cell | null = null;
    let bestD = Infinity;
    for (let dr = -4; dr <= 4; dr++) {
      for (let dc = -4; dc <= 4; dc++) {
        const cell = { col: origin.col + dc, row: origin.row + dr };
        if (!this.map.inBounds(cell.col, cell.row) || !reach.has(cell.row * this.map.cols + cell.col)) continue;
        const d = dist(this.map.center(cell), p);
        if (d < bestD) {
          bestD = d;
          best = cell;
        }
      }
    }
    if (!best) return null;
    const exact = best.col === origin.col && best.row === origin.row;
    return { cell: best, point: exact ? { x: p.x, y: p.y } : this.map.center(best) };
  }
}

/** How high flying Pokémon hover above their shadow (world units). Shared with the renderer. */
export const FLY_HEIGHT = 20;

function jitter(p: Vec, rng: Rng): Vec {
  return { x: p.x + (rng() - 0.5) * TILE * 0.5, y: p.y + (rng() - 0.5) * TILE * 0.5 };
}
