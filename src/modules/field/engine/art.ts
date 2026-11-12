import { hashString, seededRng } from "./math";
import { TILE, Tile, type TileKind, type TileMap } from "./tilemap";

/**
 * The field's artwork, drawn in code (no image files): terrain tiles baked into one big
 * canvas, plus tree and rock pictures. Colors are fixed (it's a game world, not app chrome);
 * night is a tint applied by the renderer.
 */

/** Terrain is baked at this many canvas pixels per world unit, so it stays crisp when zoomed in. */
export const TERRAIN_SCALE = 2;

export const PALETTE = {
  grass: "#7cc653",
  grassDark: "#69b244",
  grassLight: "#97d86c",
  tall: "#4f9d3a",
  tallDark: "#3b852b",
  tallLight: "#6cba4b",
  path: "#e3c98f",
  pathDark: "#ccb079",
  pathLight: "#f0dcac",
  sand: "#eedaa3",
  sandDark: "#d9c288",
  water: "#57a7e6",
  waterDeep: "#4495da",
  waterLight: "#a9dcfa",
  foam: "#dff4ff",
  flowers: ["#ffffff", "#ff8fb4", "#ffd84d", "#ff7a6b", "#b9a2ff"],
};

const BASE: Record<number, string> = {
  [Tile.Grass]: PALETTE.grass,
  [Tile.Flowers]: PALETTE.grass,
  [Tile.Tree]: PALETTE.grass,
  [Tile.Rock]: PALETTE.grass,
  [Tile.TallGrass]: PALETTE.tall,
  [Tile.Path]: PALETTE.path,
  [Tile.Sand]: PALETTE.sand,
  [Tile.Water]: PALETTE.water,
};

/** Tiles of these kinds get rounded outer corners where they meet something else. */
const ROUNDED = new Set<TileKind>([Tile.Path, Tile.Sand, Tile.Water, Tile.TallGrass]);
const CORNER = 9;

export function bakeTerrain(map: TileMap): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = map.width * TERRAIN_SCALE;
  canvas.height = map.height * TERRAIN_SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(TERRAIN_SCALE, TERRAIN_SCALE);
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) drawTile(ctx, map, col, row);
  }
  return canvas;
}

function drawTile(ctx: CanvasRenderingContext2D, map: TileMap, col: number, row: number) {
  const kind = map.get(col, row);
  const x = col * TILE;
  const y = row * TILE;
  const rng = seededRng(hashString(`${col},${row}`));
  const same = (dc: number, dr: number) => {
    const k = map.inBounds(col + dc, row + dr) ? map.get(col + dc, row + dr) : kind;
    return k === kind || (kind === Tile.Grass && k === Tile.Flowers) || (kind === Tile.Flowers && k === Tile.Grass);
  };

  ctx.fillStyle = BASE[kind];
  ctx.fillRect(x, y, TILE, TILE);

  switch (kind) {
    case Tile.Grass:
    case Tile.Flowers:
    case Tile.Tree:
    case Tile.Rock:
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = rng() < 0.6 ? PALETTE.grassDark : PALETTE.grassLight;
        const bx = x + 2 + rng() * (TILE - 5);
        const by = y + 3 + rng() * (TILE - 7);
        ctx.fillRect(bx, by, 1, 3);
        ctx.fillRect(bx + 2, by + 1, 1, 2);
      }
      if (kind === Tile.Flowers) {
        const n = 1 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) flower(ctx, x + 6 + rng() * (TILE - 12), y + 6 + rng() * (TILE - 12), PALETTE.flowers[Math.floor(rng() * PALETTE.flowers.length)]);
      }
      break;
    case Tile.TallGrass:
      for (const by of [9, 19, 29]) {
        for (let bx = (by % 2 ? 0 : 4); bx < TILE; bx += 8) {
          ctx.fillStyle = PALETTE.tallDark;
          ctx.beginPath();
          ctx.moveTo(x + bx, y + by);
          ctx.lineTo(x + bx + 2.5, y + by - 8);
          ctx.lineTo(x + bx + 4, y + by - 2);
          ctx.lineTo(x + bx + 5.5, y + by - 7);
          ctx.lineTo(x + bx + 7, y + by);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = PALETTE.tallLight;
          ctx.fillRect(x + bx + 2, y + by - 6, 1, 3);
        }
      }
      break;
    case Tile.Path:
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = rng() < 0.7 ? PALETTE.pathDark : PALETTE.pathLight;
        ctx.beginPath();
        ctx.ellipse(x + 3 + rng() * (TILE - 6), y + 3 + rng() * (TILE - 6), 1.6, 1.1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case Tile.Sand:
      ctx.fillStyle = PALETTE.sandDark;
      for (let i = 0; i < 5; i++) ctx.fillRect(x + rng() * (TILE - 2), y + rng() * (TILE - 2), 1.2, 1.2);
      break;
    case Tile.Water: {
      if (same(1, 0) && same(-1, 0) && same(0, 1) && same(0, -1)) {
        ctx.fillStyle = PALETTE.waterDeep;
        ctx.fillRect(x, y, TILE, TILE);
      }
      ctx.strokeStyle = PALETTE.waterLight;
      ctx.lineWidth = 1.2;
      ctx.lineCap = "round";
      for (let i = 0; i < 2; i++) {
        const wx = x + 5 + rng() * (TILE - 16);
        const wy = y + 7 + rng() * (TILE - 14);
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.quadraticCurveTo(wx + 3, wy - 2.5, wx + 6, wy);
        ctx.quadraticCurveTo(wx + 9, wy + 2.5, wx + 12, wy);
        ctx.stroke();
      }
      // Foam where the water meets the shore.
      ctx.fillStyle = PALETTE.foam;
      if (!same(0, -1)) ctx.fillRect(x, y, TILE, 2);
      if (!same(0, 1)) ctx.fillRect(x, y + TILE - 2, TILE, 2);
      if (!same(-1, 0)) ctx.fillRect(x, y, 2, TILE);
      if (!same(1, 0)) ctx.fillRect(x + TILE - 2, y, 2, TILE);
      break;
    }
  }

  if (ROUNDED.has(kind)) {
    const corners: [number, number, number, number][] = [
      [-1, -1, x, y],
      [1, -1, x + TILE - CORNER, y],
      [-1, 1, x, y + TILE - CORNER],
      [1, 1, x + TILE - CORNER, y + TILE - CORNER],
    ];
    for (const [dc, dr, cx, cy] of corners) {
      if (same(dc, 0) || same(0, dr)) continue;
      const outside = BASE[map.get(col + dc, row)] ?? PALETTE.grass;
      ctx.fillStyle = outside;
      ctx.fillRect(cx, cy, CORNER, CORNER);
      const ox = dc < 0 ? cx + CORNER : cx;
      const oy = dr < 0 ? cy + CORNER : cy;
      const start = dc < 0 ? (dr < 0 ? Math.PI : Math.PI / 2) : dr < 0 ? -Math.PI / 2 : 0;
      ctx.fillStyle = BASE[kind];
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.arc(ox, oy, CORNER, start, start + Math.PI / 2);
      ctx.closePath();
      ctx.fill();
      if (kind === Tile.Water) {
        ctx.strokeStyle = PALETTE.foam;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ox, oy, CORNER - 1, start, start + Math.PI / 2);
        ctx.stroke();
      }
    }
  }
}

function flower(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  for (const [dx, dy] of [[-1.6, 0], [1.6, 0], [0, -1.6], [0, 1.6]]) {
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = color === "#ffd84d" ? "#e0862b" : "#ffd84d";
  ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
}

/* ---------------- Props ---------------- */

export interface PropArt {
  canvas: HTMLCanvasElement;
  /** World size of the picture, and where its base point is inside it. */
  w: number;
  h: number;
  baseX: number;
  baseY: number;
}

function artCanvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w * TERRAIN_SCALE;
  c.height = h * TERRAIN_SCALE;
  const ctx = c.getContext("2d")!;
  ctx.scale(TERRAIN_SCALE, TERRAIN_SCALE);
  draw(ctx);
  return c;
}

const TREE_SHADES = [
  { dark: "#24652a", mid: "#3a8f3a", light: "#5fb04a", line: "#174a1c" },
  { dark: "#2a6e2e", mid: "#43993f", light: "#6dbb52", line: "#1a501f" },
  { dark: "#1f5e2c", mid: "#348a3f", light: "#57a85a", line: "#123f1a" },
];

export function treeArt(variant: number): PropArt {
  const s = TREE_SHADES[variant % TREE_SHADES.length];
  const w = 52;
  const h = 66;
  const canvas = artCanvas(w, h, (ctx) => {
    const cx = w / 2;
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(cx, 60, 17, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7a4d2b";
    ctx.fillRect(cx - 5, 44, 10, 16);
    ctx.fillStyle = "#5e3a20";
    ctx.fillRect(cx + 1, 44, 4, 16);
    const blob = (pad: number, color: string) => {
      ctx.fillStyle = color;
      for (const [x, y, r] of [[cx, 28, 19], [cx - 10, 33, 13], [cx + 10, 33, 13], [cx, 17, 14]]) {
        ctx.beginPath();
        ctx.arc(x, y, r + pad, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    blob(1.5, s.line);
    blob(0, s.dark);
    ctx.fillStyle = s.mid;
    for (const [x, y, r] of [[cx - 4, 24, 13], [cx + 6, 28, 10], [cx - 9, 32, 8]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = s.light;
    for (const [x, y, r] of [[cx - 6, 16, 6], [cx - 11, 26, 3.5], [cx + 3, 20, 3]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return { canvas, w, h, baseX: w / 2, baseY: 60 };
}

export function rockArt(variant: number): PropArt {
  const w = 34;
  const h = 28;
  const canvas = artCanvas(w, h, (ctx) => {
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(17, 24, 14, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    const tall = variant === 1 ? 3 : 0;
    ctx.fillStyle = "#5f666d";
    ctx.beginPath();
    ctx.moveTo(3, 23);
    ctx.quadraticCurveTo(2, 9 - tall, 13, 6 - tall);
    ctx.quadraticCurveTo(26, 3 - tall, 31, 14);
    ctx.quadraticCurveTo(33, 22, 29, 24);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#9aa1a8";
    ctx.beginPath();
    ctx.moveTo(5, 22);
    ctx.quadraticCurveTo(4, 10 - tall, 13, 8 - tall);
    ctx.quadraticCurveTo(25, 5 - tall, 29, 14);
    ctx.quadraticCurveTo(31, 21, 27, 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#c6ccd2";
    ctx.beginPath();
    ctx.ellipse(12, 11 - tall, 5, 2.4, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#6d747b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(19, 9 - tall);
    ctx.lineTo(21, 14);
    ctx.lineTo(19, 18);
    ctx.stroke();
  });
  return { canvas, w, h, baseX: 17, baseY: 23 };
}
