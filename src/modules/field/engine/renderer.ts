import { PALETTE, bakeTerrain, rockArt, treeArt, type PropArt } from "./art";
import type { Camera } from "./camera";
import type { Creature, EmoteKind } from "./creature";
import { clamp, type Vec } from "./math";
import type { SpriteCache, SpriteFrame } from "./sprites";
import { TILE, Tile, type Prop, type TileMap } from "./tilemap";
import { FLY_HEIGHT, type World } from "./world";

/** What the host wants highlighted this frame. */
export interface RenderState {
  selectedId: string | null;
  hoverId: string | null;
  /** Where a Pokémon was just sent, shown as a fading ring. */
  marker: { at: Vec; start: number } | null;
  /** 0 = full day, 1 = full night. */
  darkness: number;
  reducedMotion: boolean;
}

const PLACEHOLDER = { w: 22, h: 22 };
const SELECT = "#ffd23f";

/** Draws the world onto a canvas. Owns no game state: give it the world, camera and highlights. */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private terrain: HTMLCanvasElement;
  private trees: PropArt[];
  private rocks: PropArt[];
  private waterTiles: { x: number; y: number; phase: number }[] = [];
  private dpr = 1;

  constructor(
    private canvas: HTMLCanvasElement,
    private map: TileMap,
    private sprites: SpriteCache,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.terrain = bakeTerrain(map);
    this.trees = [0, 1, 2].map(treeArt);
    this.rocks = [0, 1, 2].map(rockArt);
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        if (map.get(c, r) === Tile.Water) this.waterTiles.push({ x: c * TILE, y: r * TILE, phase: (c * 1.7 + r * 2.3) % (Math.PI * 2) });
      }
    }
  }

  /** Match the canvas's pixel size to its CSS size. */
  resize(cssW: number, cssH: number, dpr: number): void {
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
  }

  /** Drawn size of a Pokémon in world units (for picking and labels). */
  sizeOf(c: Creature): { w: number; h: number } {
    const f = this.sprites.get(c.spec.dex, c.spec.shiny);
    return typeof f === "string" ? PLACEHOLDER : { w: f.w, h: f.h };
  }

  draw(world: World, cam: Camera, state: RenderState): void {
    const { ctx, dpr } = this;
    const t = world.time;
    const z = cam.zoom * dpr;
    const view = cam.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(z, 0, 0, z, -view.left * z, -view.top * z);
    ctx.imageSmoothingEnabled = cam.zoom < 1;

    // Ground
    ctx.drawImage(this.terrain, 0, 0, this.terrain.width, this.terrain.height, 0, 0, this.map.width, this.map.height);
    if (!state.reducedMotion) this.drawWaterShimmer(t, view);
    if (state.marker) this.drawMarker(state.marker, t);

    // Things that stand on the ground, back to front.
    type Drawable = { y: number; draw: () => void };
    const margin = 80;
    const visible = (p: Vec) => p.x > view.left - margin && p.x < view.left + view.width + margin && p.y > view.top - 20 && p.y < view.top + view.height + margin * 1.5;
    const list: Drawable[] = [];
    for (const p of this.map.props) if (visible(p.base)) list.push({ y: p.base.y, draw: () => this.drawProp(p) });
    for (const c of world.creatures.values()) {
      if (!visible(c.pos)) continue;
      list.push({ y: c.pos.y, draw: () => this.drawCreature(c, t, state, c.id === state.selectedId) });
    }
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();

    // Screen-space overlays: these stay the same size at any zoom.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawDaylight(state.darkness, t, cam, state.reducedMotion);
    for (const c of world.creatures.values()) {
      if (!visible(c.pos)) continue;
      if (c.emote && t >= c.emote.start) this.drawEmote(c, t, cam);
      if (c.id === state.selectedId || c.id === state.hoverId) this.drawLabel(c, cam);
    }
  }

  /* ---------------- Pieces ---------------- */

  private drawProp(p: Prop) {
    const art = p.kind === "tree" ? this.trees[p.variant] : this.rocks[p.variant];
    this.ctx.drawImage(art.canvas, p.base.x - art.baseX, p.base.y - art.baseY, art.w, art.h);
  }

  private drawCreature(c: Creature, t: number, state: RenderState, selected: boolean) {
    const { ctx } = this;
    const frame = this.sprites.get(c.spec.dex, c.spec.shiny);
    const size = typeof frame === "string" ? PLACEHOLDER : frame;
    const phase = (c.personality.energy * 97) % (Math.PI * 2);
    const still = state.reducedMotion;
    const tile = this.map.kindAt(c.pos);
    const flying = c.movement === "fly";
    const swimming = !flying && tile === Tile.Water;
    const inGrass = !flying && tile === Tile.TallGrass;

    // Arrival: pop in with a little overshoot.
    const age = clamp((t - c.bornAt) / 0.55, 0, 1);
    const pop = age >= 1 ? 1 : easeOutBack(age);

    let lift = flying ? FLY_HEIGHT + (still ? 0 : Math.sin(t * 2.4 + phase) * 3) : 0;
    if (!still && c.activity.kind === "walk" && !flying) lift += Math.abs(Math.sin((c.stride / 10) * Math.PI)) * 2.5;
    if (!still && c.hopStart >= 0 && t - c.hopStart < 0.7) lift += Math.abs(Math.sin(((t - c.hopStart) / 0.35) * Math.PI)) * 9;
    const breathe = still || c.activity.kind === "walk" ? 1 : 1 + Math.sin(t * 2.2 + phase) * 0.018;
    const asleep = c.activity.kind === "sleep";

    // Shadow and selection ring on the ground.
    const rx = Math.max(7, size.w * 0.3);
    if (!swimming) {
      ctx.fillStyle = flying ? "rgba(0,0,0,0.14)" : "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.ellipse(c.pos.x, c.pos.y, rx * (flying ? 0.8 : 1) * pop, rx * 0.34 * pop, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (selected) {
      const pulse = still ? 1 : 1 + Math.sin(t * 5) * 0.08;
      ctx.lineWidth = 2;
      ctx.strokeStyle = SELECT;
      ctx.beginPath();
      ctx.ellipse(c.pos.x, c.pos.y, (rx + 5) * pulse, (rx * 0.34 + 3) * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Swimmers sit lower, cut off at the water line.
    const sink = swimming ? size.h * 0.38 : 0;
    ctx.save();
    if (swimming) {
      ctx.beginPath();
      ctx.rect(c.pos.x - 200, c.pos.y - 400, 400, 400);
      ctx.clip();
    }
    ctx.translate(c.pos.x, c.pos.y - lift + sink);
    ctx.scale((c.facing === 1 ? -1 : 1) * pop, pop * breathe * (asleep ? 0.94 : 1));
    if (typeof frame === "string") this.drawPlaceholder(frame === "loading");
    else this.drawSprite(frame, asleep);
    ctx.restore();

    if (swimming) {
      const wob = still ? 0 : Math.sin(t * 3 + phase) * 1.5;
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(c.pos.x, c.pos.y, rx + 3 + wob, 3.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (inGrass) this.drawGrassTuft(c.pos);
  }

  private drawSprite(f: SpriteFrame, asleep: boolean) {
    const { ctx } = this;
    const smooth = ctx.imageSmoothingEnabled;
    if (!f.pixelated) ctx.imageSmoothingEnabled = true;
    if (asleep) ctx.globalAlpha = 0.92;
    ctx.drawImage(f.image, f.sx, f.sy, f.sw, f.sh, -f.w / 2, -f.h, f.w, f.h);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = smooth;
  }

  /** A tiny Poké Ball while the sprite loads (or if it can't). */
  private drawPlaceholder(loading: boolean) {
    const { ctx } = this;
    const r = 8;
    ctx.globalAlpha = loading ? 0.6 : 0.9;
    ctx.fillStyle = "#e3350d";
    ctx.beginPath();
    ctx.arc(0, -r - 1, r, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#f4f4f4";
    ctx.beginPath();
    ctx.arc(0, -r - 1, r, 0, Math.PI);
    ctx.fill();
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, -r - 1, r, 0, Math.PI * 2);
    ctx.moveTo(-r, -r - 1);
    ctx.lineTo(r, -r - 1);
    ctx.stroke();
    ctx.fillStyle = "#f4f4f4";
    ctx.beginPath();
    ctx.arc(0, -r - 1, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Blades of tall grass in front of a Pokémon's feet. */
  private drawGrassTuft(p: Vec) {
    const { ctx } = this;
    ctx.fillStyle = PALETTE.tall;
    for (const dx of [-11, -4, 3, 10]) {
      ctx.beginPath();
      ctx.moveTo(p.x + dx - 4, p.y + 3);
      ctx.lineTo(p.x + dx - 1.5, p.y - 7);
      ctx.lineTo(p.x + dx, p.y - 2);
      ctx.lineTo(p.x + dx + 1.5, p.y - 8);
      ctx.lineTo(p.x + dx + 4, p.y + 3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = PALETTE.tallDark;
    for (const dx of [-8, 0, 7]) ctx.fillRect(p.x + dx, p.y - 4, 1, 4);
  }

  private drawWaterShimmer(t: number, view: { left: number; top: number; width: number; height: number }) {
    const { ctx } = this;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.2;
    ctx.lineCap = "round";
    for (const w of this.waterTiles) {
      if (w.x + TILE < view.left || w.x > view.left + view.width || w.y + TILE < view.top || w.y > view.top + view.height) continue;
      const s = Math.sin(t * 1.3 + w.phase);
      if (s < 0.2) continue;
      const x = w.x + 8 + Math.sin(t * 0.7 + w.phase) * 5;
      const y = w.y + 12 + ((w.phase * 5) % 12);
      ctx.globalAlpha = (s - 0.2) / 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 7, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawMarker(m: { at: Vec; start: number }, t: number) {
    const age = (t - m.start) / 1.2;
    if (age > 1) return;
    const { ctx } = this;
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = SELECT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(m.at.x, m.at.y, 6 + age * 10, (6 + age * 10) * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(m.at.x - 3, m.at.y - 1.5);
    ctx.lineTo(m.at.x + 3, m.at.y + 1.5);
    ctx.moveTo(m.at.x + 3, m.at.y - 1.5);
    ctx.lineTo(m.at.x - 3, m.at.y + 1.5);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Night tint, a warm glow at dusk and dawn, and fireflies after dark. */
  private drawDaylight(darkness: number, t: number, cam: Camera, still: boolean) {
    if (darkness <= 0.001) return;
    const { ctx } = this;
    ctx.fillStyle = `rgba(16, 22, 64, ${0.42 * darkness})`;
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);
    const dusk = 1 - Math.abs(2 * darkness - 1);
    if (dusk > 0.05) {
      ctx.fillStyle = `rgba(255, 140, 70, ${0.1 * dusk})`;
      ctx.fillRect(0, 0, cam.viewW, cam.viewH);
    }
    if (darkness > 0.5 && !still) {
      const n = 14;
      for (let i = 0; i < n; i++) {
        const wx = ((i * 211) % this.map.width) + Math.sin(t * 0.4 + i) * 30;
        const wy = ((i * 137) % this.map.height) + Math.cos(t * 0.33 + i * 2) * 22;
        const p = cam.worldToScreen({ x: wx, y: wy });
        const glow = (Math.sin(t * 2 + i * 1.3) + 1) / 2;
        ctx.fillStyle = `rgba(255, 244, 150, ${(darkness - 0.5) * 2 * (0.25 + glow * 0.6)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5 + glow * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawEmote(c: Creature, t: number, cam: Camera) {
    const { ctx } = this;
    const e = c.emote!;
    const size = this.sizeOf(c);
    const lift = c.movement === "fly" ? FLY_HEIGHT : 0;
    const p = cam.worldToScreen({ x: c.pos.x + size.w * 0.32, y: c.pos.y - size.h - lift });
    const age = t - e.start;
    const left = e.until - t;
    const scale = age < 0.15 ? easeOutBack(age / 0.15) : 1;
    ctx.globalAlpha = clamp(left / 0.25, 0, 1);
    ctx.save();
    ctx.translate(p.x, p.y - 4);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    roundRect(ctx, -11, -20, 22, 19, 6);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4, -1.5);
    ctx.lineTo(-7, 4);
    ctx.lineTo(1, -1.5);
    ctx.closePath();
    ctx.fill();
    drawEmoteSymbol(ctx, e.kind, 0, -10.5);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawLabel(c: Creature, cam: Camera) {
    const { ctx } = this;
    const p = cam.worldToScreen({ x: c.pos.x, y: c.pos.y });
    const text = `${c.spec.team ? "★ " : ""}${c.spec.name}${c.spec.level ? ` · Lv ${c.spec.level}` : ""}`;
    ctx.font = "600 11px system-ui, -apple-system, Segoe UI, sans-serif";
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = "rgba(15, 20, 30, 0.78)";
    roundRect(ctx, p.x - w / 2, p.y + 7, w, 17, 8.5);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, p.x, p.y + 15.5);
  }
}

function drawEmoteSymbol(ctx: CanvasRenderingContext2D, kind: EmoteKind, x: number, y: number) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  switch (kind) {
    case "heart":
      ctx.fillStyle = "#ff4d6d";
      ctx.beginPath();
      ctx.moveTo(x, y + 5);
      ctx.bezierCurveTo(x - 8, y - 1, x - 4, y - 7, x, y - 3);
      ctx.bezierCurveTo(x + 4, y - 7, x + 8, y - 1, x, y + 5);
      ctx.fill();
      break;
    case "note":
      ctx.fillStyle = "#3a7bd5";
      ctx.font = "700 13px system-ui, sans-serif";
      ctx.fillText("♪", x, y + 1);
      break;
    case "exclaim":
      ctx.fillStyle = "#e63946";
      ctx.font = "800 13px system-ui, sans-serif";
      ctx.fillText("!", x, y + 1);
      break;
    case "question":
      ctx.fillStyle = "#555";
      ctx.font = "800 13px system-ui, sans-serif";
      ctx.fillText("?", x, y + 1);
      break;
    case "sleep":
      ctx.fillStyle = "#6c63ff";
      ctx.font = "800 10px system-ui, sans-serif";
      ctx.fillText("Zz", x, y + 1);
      break;
    case "sparkle":
      ctx.fillStyle = "#f5b700";
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? 6.5 : 2;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      break;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}
