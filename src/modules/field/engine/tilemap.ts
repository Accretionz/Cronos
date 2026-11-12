import { randInt, randRange, seededRng, type Vec } from "./math";

/** World units per tile. Everything in the engine is measured in world units (1 = one sprite pixel at zoom 1). */
export const TILE = 32;

/** What a tile is. Stored as numbers in a Uint8Array, so keep the values stable. */
export const Tile = {
  Grass: 0,
  TallGrass: 1,
  Flowers: 2,
  Path: 3,
  Sand: 4,
  Water: 5,
  Tree: 6,
  Rock: 7,
} as const;
export type TileKind = (typeof Tile)[keyof typeof Tile];

/**
 * How a Pokémon gets around. Decides which tiles it can enter.
 * - walk: land only
 * - swim: land and water (Water types)
 * - fly:  land, water and over rocks (Flying types)
 */
export type Movement = "walk" | "swim" | "fly";

const BLOCKS: Record<Movement, ReadonlySet<TileKind>> = {
  walk: new Set([Tile.Water, Tile.Tree, Tile.Rock]),
  swim: new Set([Tile.Tree, Tile.Rock]),
  fly: new Set([Tile.Tree]),
};

/** Things drawn standing on the map (sorted by depth with the Pokémon). */
export interface Prop {
  kind: "tree" | "rock";
  col: number;
  row: number;
  /** Where it touches the ground, in world units. */
  base: Vec;
  /** Picks one of a few looks. */
  variant: number;
}

export interface Cell {
  col: number;
  row: number;
}

export class TileMap {
  readonly width: number;
  readonly height: number;
  private reach = new Map<Movement, number[]>();

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly tiles: Uint8Array,
    readonly props: Prop[],
    /** Where the map's connected area is measured from (always open land). */
    readonly start: Cell,
  ) {
    this.width = cols * TILE;
    this.height = rows * TILE;
  }

  inBounds(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  /** Outside the map counts as trees, so nothing ever leaves. */
  get(col: number, row: number): TileKind {
    return this.inBounds(col, row) ? (this.tiles[row * this.cols + col] as TileKind) : Tile.Tree;
  }

  passable(col: number, row: number, movement: Movement): boolean {
    return !BLOCKS[movement].has(this.get(col, row));
  }

  cellAt(p: Vec): Cell {
    return { col: Math.floor(p.x / TILE), row: Math.floor(p.y / TILE) };
  }

  kindAt(p: Vec): TileKind {
    const c = this.cellAt(p);
    return this.get(c.col, c.row);
  }

  passableAt(p: Vec, movement: Movement): boolean {
    const c = this.cellAt(p);
    return this.passable(c.col, c.row, movement);
  }

  center(cell: Cell): Vec {
    return { x: (cell.col + 0.5) * TILE, y: (cell.row + 0.5) * TILE };
  }

  /**
   * Every tile a Pokémon with this movement can get to from the start tile, as indices
   * (row * cols + col). Pokémon only ever spawn on and wander to these, so none get stuck
   * in a pocket. Cached per movement.
   */
  reachable(movement: Movement): number[] {
    let list = this.reach.get(movement);
    if (!list) {
      list = [];
      const seen = new Uint8Array(this.cols * this.rows);
      const queue = [this.start.row * this.cols + this.start.col];
      seen[queue[0]] = 1;
      while (queue.length) {
        const i = queue.pop()!;
        list.push(i);
        const col = i % this.cols;
        const row = (i - col) / this.cols;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const c = col + dc;
          const r = row + dr;
          const j = r * this.cols + c;
          if (this.inBounds(c, r) && !seen[j] && this.passable(c, r, movement)) {
            seen[j] = 1;
            queue.push(j);
          }
        }
      }
      list.sort((a, b) => a - b);
      this.reach.set(movement, list);
    }
    return list;
  }

  cellOf(index: number): Cell {
    return { col: index % this.cols, row: Math.floor(index / this.cols) };
  }
}

/* ------------------------------------------------------------------ */
/* Procedural generation                                               */
/* ------------------------------------------------------------------ */

export interface FieldOptions {
  cols?: number;
  rows?: number;
}

/**
 * A meadow ringed by forest, with a pond, a winding path, tall grass, flowers, and a few
 * trees and rocks. Same seed, same map. Later maps (beach, cave, town...) can be other
 * generators that return a TileMap, or a hand-made layout loaded from data.
 */
export function generateField(seed: number, opts: FieldOptions = {}): TileMap {
  const cols = opts.cols ?? 32;
  const rows = opts.rows ?? 20;
  const rng = seededRng(seed);
  const tiles = new Uint8Array(cols * rows).fill(Tile.Grass);
  const at = (c: number, r: number) => r * cols + c;
  const inside = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows;
  const set = (c: number, r: number, t: TileKind) => {
    if (inside(c, r)) tiles[at(c, r)] = t;
  };
  const get = (c: number, r: number) => (inside(c, r) ? tiles[at(c, r)] : Tile.Tree);

  // 1. Forest border: one solid ring, plus a ragged second ring.
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const edge = Math.min(c, r, cols - 1 - c, rows - 1 - r);
      if (edge === 0 || (edge === 1 && rng() < 0.38)) set(c, r, Tile.Tree);
    }
  }

  // 2. Pond: a noisy ellipse in the lower right, with a sandy shore.
  const pond = { c: cols * randRange(rng, 0.62, 0.72), r: rows * randRange(rng, 0.55, 0.66), rx: randRange(rng, 3.4, 4.4), ry: randRange(rng, 2.4, 3.0) };
  for (let c = 2; c < cols - 2; c++) {
    for (let r = 2; r < rows - 2; r++) {
      const d = ((c + 0.5 - pond.c) / pond.rx) ** 2 + ((r + 0.5 - pond.r) / pond.ry) ** 2;
      if (d + (rng() - 0.5) * 0.25 < 1) set(c, r, Tile.Water);
    }
  }
  for (let c = 1; c < cols - 1; c++) {
    for (let r = 1; r < rows - 1; r++) {
      if (get(c, r) !== Tile.Grass) continue;
      const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => get(c + dc, r + dr) === Tile.Water);
      if (nearWater && rng() < 0.85) set(c, r, Tile.Sand);
    }
  }

  // 3. A winding dirt path from the west side toward the east, two tiles wide.
  let pr = Math.round(rows * randRange(rng, 0.28, 0.38));
  for (let c = 2; c < cols - 2; c++) {
    const prev = pr;
    if (c > 3 && rng() < 0.3) pr = Math.max(3, Math.min(rows - 5, pr + (rng() < 0.5 ? -1 : 1)));
    // Where the path bends, widen this column so it stays one connected strip.
    for (let r = Math.min(prev, pr); r <= Math.max(prev, pr) + 1; r++) if (get(c, r) === Tile.Grass) set(c, r, Tile.Path);
  }

  // 4. Tall grass patches.
  const patches = randInt(rng, 3, 4);
  for (let i = 0; i < patches; i++) {
    const pc = randRange(rng, 4, cols - 5);
    const prow = randRange(rng, 4, rows - 4);
    const rad = randRange(rng, 1.6, 2.6);
    for (let c = Math.floor(pc - 3); c <= pc + 3; c++) {
      for (let r = Math.floor(prow - 3); r <= prow + 3; r++) {
        const d = Math.hypot(c + 0.5 - pc, (r + 0.5 - prow) * 1.25);
        if (d + (rng() - 0.5) * 0.8 < rad && get(c, r) === Tile.Grass) set(c, r, Tile.TallGrass);
      }
    }
  }

  // 5. A few trees and rocks inside, never touching the path or water, never next to each other.
  const clearAround = (c: number, r: number) => {
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (get(c + dc, r + dr) !== Tile.Grass && get(c + dc, r + dr) !== Tile.TallGrass) return false;
    return true;
  };
  const scatter = (kind: TileKind, count: number) => {
    for (let placed = 0, tries = 0; placed < count && tries < 300; tries++) {
      const c = randInt(rng, 3, cols - 4);
      const r = randInt(rng, 3, rows - 4);
      if (get(c, r) === Tile.Grass && clearAround(c, r)) {
        set(c, r, kind);
        placed++;
      }
    }
  };
  scatter(Tile.Tree, randInt(rng, 4, 6));
  scatter(Tile.Rock, randInt(rng, 3, 5));

  // 6. Flowers sprinkled over open grass.
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === Tile.Grass && rng() < 0.07) tiles[i] = Tile.Flowers;

  // The start tile: open land closest to the middle.
  let start: Cell = { col: Math.floor(cols / 2), row: Math.floor(rows / 2) };
  let best = Infinity;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const t = get(c, r);
      if (t === Tile.Water || t === Tile.Tree || t === Tile.Rock) continue;
      const d = Math.hypot(c - cols / 2, r - rows / 2);
      if (d < best) {
        best = d;
        start = { col: c, row: r };
      }
    }
  }

  const props: Prop[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = get(c, r);
      if (t === Tile.Tree || t === Tile.Rock) {
        props.push({ kind: t === Tile.Tree ? "tree" : "rock", col: c, row: r, base: { x: (c + 0.5) * TILE, y: (r + 1) * TILE - 4 }, variant: Math.floor(rng() * 3) });
      }
    }
  }

  return new TileMap(cols, rows, tiles, props, start);
}

/** Used by tests and debugging: the map as text, one character per tile. */
export function mapToText(map: TileMap): string {
  const ch = [".", '"', "*", "=", ":", "~", "T", "o"];
  const lines: string[] = [];
  for (let r = 0; r < map.rows; r++) {
    let line = "";
    for (let c = 0; c < map.cols; c++) line += ch[map.get(c, r)];
    lines.push(line);
  }
  return lines.join("\n");
}

