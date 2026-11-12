import { Camera } from "./camera";
import type { CreatureSpec } from "./creature";
import { darknessAt, isNight } from "./daylight";
import { attachInput } from "./input";
import { GameLoop } from "./loop";
import type { Rng, Vec } from "./math";
import { Renderer } from "./renderer";
import type { SpriteCache } from "./sprites";
import type { TileMap } from "./tilemap";
import { World, type WorldSnapshot } from "./world";

export { generateField, TILE, type TileMap } from "./tilemap";
export { SpriteCache } from "./sprites";
export { darknessAt, timeOfDayLabel } from "./daylight";
export type { CreatureSpec } from "./creature";
export type { WorldSnapshot } from "./world";

export interface FieldEngineOptions {
  map: TileMap;
  sprites: SpriteCache;
  /** Put Pokémon back where they were last time. */
  restore?: WorldSnapshot;
  /** Called when the selected Pokémon changes (by tapping, Escape, or select()). */
  onSelect?: (id: string | null) => void;
  /** Called when the user moves or zooms the view. */
  onViewChange?: () => void;
  /** Random source for behavior. Defaults to Math.random. */
  rng?: Rng;
  /** Current time, for day and night. */
  clock?: () => Date;
}

/**
 * The field, assembled: world simulation + camera + renderer + loop + input, on one canvas.
 * The React side only talks to this class. Create it, call start(), feed it the roster with
 * setRoster(), and destroy() it when the page goes away (it hands back a snapshot).
 */
export class FieldEngine {
  readonly world: World;
  readonly camera: Camera;
  readonly renderer: Renderer;
  private loop: GameLoop;
  private detachInput: () => void = () => {};
  private resizeObserver: ResizeObserver | null = null;
  private intersection: IntersectionObserver | null = null;
  private selected: string | null = null;
  private hover: string | null = null;
  private marker: { at: Vec; start: number } | null = null;
  private darkness = 0;
  private sinceClock = Infinity;
  private reducedMotion = false;
  private hasRoster = false;
  private readonly clock: () => Date;

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: FieldEngineOptions,
  ) {
    this.world = new World(opts.map, opts.rng);
    this.camera = new Camera(opts.map.width, opts.map.height);
    this.renderer = new Renderer(canvas, opts.map, opts.sprites);
    this.clock = opts.clock ?? (() => new Date());
    this.loop = new GameLoop(
      (dt) => this.step(dt),
      () => this.render(),
    );
  }

  start(): void {
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    this.reducedMotion = Boolean(motion?.matches);
    this.detachInput = attachInput(this.canvas, this.camera, {
      onTap: (p) => this.tap(p),
      onHover: (p) => this.hoverAt(p),
      onEscape: () => this.select(null),
      onViewChange: () => this.opts.onViewChange?.(),
    });
    const resize = () => {
      const r = this.canvas.getBoundingClientRect();
      const first = this.camera.viewW <= 1;
      this.renderer.resize(r.width, r.height, window.devicePixelRatio || 1);
      this.camera.resize(r.width, r.height, first);
      this.render();
    };
    this.resizeObserver = new ResizeObserver(resize);
    this.resizeObserver.observe(this.canvas);
    resize();
    this.intersection = new IntersectionObserver(([e]) => this.loop.setVisible(e.isIntersecting));
    this.intersection.observe(this.canvas);
    this.loop.start();
  }

  /** Stop everything. Returns where each Pokémon was, to pass as `restore` next time. */
  destroy(): WorldSnapshot {
    this.loop.stop();
    this.detachInput();
    this.resizeObserver?.disconnect();
    this.intersection?.disconnect();
    return this.world.snapshot();
  }

  /** Which Pokémon are in the field. The first call places them quietly; later additions arrive with a sparkle. */
  setRoster(specs: CreatureSpec[]): void {
    this.world.sync(specs, { animate: this.hasRoster, restore: this.hasRoster ? undefined : this.opts.restore });
    this.hasRoster = true;
    if (this.selected && !this.world.creatures.has(this.selected)) this.select(null);
  }

  get selectedId(): string | null {
    return this.selected;
  }

  select(id: string | null, opts: { focus?: boolean } = {}): void {
    const next = id && this.world.creatures.has(id) ? id : null;
    if (next && opts.focus) this.focus(next);
    if (next === this.selected) return;
    this.selected = next;
    this.opts.onSelect?.(next);
  }

  /** Glide the camera to a Pokémon (zooming in a little if we're far out). */
  focus(id: string): void {
    const c = this.world.creatures.get(id);
    if (!c) return;
    this.camera.glideTo(c.pos, Math.max(this.camera.zoom, Math.min(1.6, this.camera.defaultZoom * 1.3)));
  }

  zoomBy(factor: number): void {
    this.camera.zoomAt({ x: this.camera.viewW / 2, y: this.camera.viewH / 2 }, factor);
  }

  resetView(): void {
    this.camera.glideTo({ x: this.camera.worldW / 2, y: this.camera.worldH / 2 }, this.camera.defaultZoom);
  }

  /** Make a Pokémon hop and show a heart. */
  pet(id: string): void {
    this.world.poke(id);
  }

  /* ---------------- internals ---------------- */

  private step(dt: number) {
    this.sinceClock += dt;
    if (this.sinceClock >= 1) {
      this.sinceClock = 0;
      this.darkness = darknessAt(this.clock());
      this.world.night = isNight(this.darkness);
    }
    this.world.update(dt);
    this.camera.update(dt);
  }

  private render() {
    this.renderer.draw(this.world, this.camera, {
      selectedId: this.selected,
      hoverId: this.hover,
      marker: this.marker,
      darkness: this.darkness,
      reducedMotion: this.reducedMotion,
    });
  }

  private tap(screen: Vec) {
    const p = this.camera.screenToWorld(screen);
    const hit = this.world.pick(p, (c) => this.renderer.sizeOf(c));
    if (hit) {
      this.world.poke(hit.id);
      this.select(hit.id);
      return;
    }
    if (this.selected) {
      const dest = this.world.command(this.selected, p);
      if (dest) this.marker = { at: dest, start: this.world.time };
    }
  }

  private hoverAt(screen: Vec | null) {
    const hit = screen && this.world.pick(this.camera.screenToWorld(screen), (c) => this.renderer.sizeOf(c));
    this.hover = hit ? hit.id : null;
    this.canvas.style.cursor = hit ? "pointer" : this.selected ? "crosshair" : "";
  }
}
