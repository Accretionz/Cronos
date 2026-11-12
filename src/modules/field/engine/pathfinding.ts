import type { Vec } from "./math";
import { TILE, type Cell, type Movement, type TileMap } from "./tilemap";

const SQRT2 = Math.SQRT2;
const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

/** Min-heap of node indices keyed by score. */
class Heap {
  private items: number[] = [];
  constructor(private score: Float64Array) {}
  get size() {
    return this.items.length;
  }
  push(i: number) {
    const a = this.items;
    a.push(i);
    let n = a.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (this.score[a[p]] <= this.score[a[n]]) break;
      [a[p], a[n]] = [a[n], a[p]];
      n = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let n = 0;
      for (;;) {
        const l = 2 * n + 1;
        const r = l + 1;
        let m = n;
        if (l < a.length && this.score[a[l]] < this.score[a[m]]) m = l;
        if (r < a.length && this.score[a[r]] < this.score[a[m]]) m = r;
        if (m === n) break;
        [a[m], a[n]] = [a[n], a[m]];
        n = m;
      }
    }
    return top;
  }
}

/**
 * A* over the tile grid, 8 directions, never cutting a blocked corner.
 * Returns the cells from `from` to `to` (both included), or null if there's no way.
 */
export function findPath(map: TileMap, from: Cell, to: Cell, movement: Movement): Cell[] | null {
  if (!map.passable(to.col, to.row, movement)) return null;
  const n = map.cols * map.rows;
  const g = new Float64Array(n).fill(Infinity);
  const f = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const start = from.row * map.cols + from.col;
  const goal = to.row * map.cols + to.col;
  const h = (c: number, r: number) => {
    const dx = Math.abs(c - to.col);
    const dy = Math.abs(r - to.row);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  };
  g[start] = 0;
  f[start] = h(from.col, from.row);
  const open = new Heap(f);
  open.push(start);

  while (open.size) {
    const cur = open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const col = cur % map.cols;
    const row = (cur - col) / map.cols;
    for (const [dc, dr, cost] of DIRS) {
      const c = col + dc;
      const r = row + dr;
      if (!map.passable(c, r, movement)) continue;
      if (dc && dr && (!map.passable(col + dc, row, movement) || !map.passable(col, row + dr, movement))) continue;
      const j = r * map.cols + c;
      if (closed[j]) continue;
      const tentative = g[cur] + cost;
      if (tentative < g[j]) {
        g[j] = tentative;
        f[j] = tentative + h(c, r);
        came[j] = cur;
        open.push(j);
      }
    }
  }

  if (start !== goal && came[goal] === -1) return null;
  const path: Cell[] = [];
  for (let i = goal; i !== -1; i = i === start ? -1 : came[i]) path.push(map.cellOf(i));
  return path.reverse();
}

/** True if a body of the given radius can move in a straight line from a to b. */
export function clearLine(map: TileMap, a: Vec, b: Vec, movement: Movement, radius = 8): boolean {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0) return map.passableAt(a, movement);
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const steps = Math.ceil(len / (TILE / 4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    for (const s of [-1, 0, 1]) {
      if (!map.passableAt({ x: x + nx * radius * s, y: y + ny * radius * s }, movement)) return false;
    }
  }
  return true;
}

/**
 * Turn a cell path into waypoints in world units, skipping corners where a straight line
 * is clear, so Pokémon walk naturally instead of zig-zagging tile by tile.
 * `end` replaces the last cell's center (so a Pokémon can stop exactly where you tapped).
 */
export function toWaypoints(map: TileMap, start: Vec, cells: Cell[], movement: Movement, end?: Vec): Vec[] {
  const points = cells.slice(1).map((c) => map.center(c));
  if (end && points.length) points[points.length - 1] = end;
  else if (end && !points.length) points.push(end);
  const out: Vec[] = [];
  let from = start;
  let i = 0;
  while (i < points.length) {
    let j = points.length - 1;
    while (j > i && !clearLine(map, from, points[j], movement)) j--;
    out.push(points[j]);
    from = points[j];
    i = j + 1;
  }
  return out;
}
