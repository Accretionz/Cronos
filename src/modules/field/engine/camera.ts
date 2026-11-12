import { clamp, type Vec } from "./math";

export const MAX_ZOOM = 3;

/**
 * What part of the world is on screen. `x, y` is the world point at the center of the view;
 * `zoom` is screen pixels per world unit. The view never shows past the edge of the map.
 */
export class Camera {
  x: number;
  y: number;
  zoom = 1;
  /** View size in CSS pixels. */
  viewW = 1;
  viewH = 1;
  private glide: { to: Vec; zoom?: number } | null = null;

  constructor(
    readonly worldW: number,
    readonly worldH: number,
  ) {
    this.x = worldW / 2;
    this.y = worldH / 2;
  }

  /** Smallest zoom that still fills the view with map. */
  get minZoom(): number {
    return Math.max(this.viewW / this.worldW, this.viewH / this.worldH);
  }

  /** Starting zoom: the whole meadow on a big screen, about 18 tiles across on a phone. */
  get defaultZoom(): number {
    return Math.max(this.minZoom, Math.min(1, this.viewW / 700));
  }

  resize(w: number, h: number, reset = false): void {
    this.viewW = Math.max(1, w);
    this.viewH = Math.max(1, h);
    if (reset) this.zoom = this.defaultZoom;
    this.clampView();
  }

  screenToWorld(p: Vec): Vec {
    return { x: this.x + (p.x - this.viewW / 2) / this.zoom, y: this.y + (p.y - this.viewH / 2) / this.zoom };
  }

  worldToScreen(p: Vec): Vec {
    return { x: (p.x - this.x) * this.zoom + this.viewW / 2, y: (p.y - this.y) * this.zoom + this.viewH / 2 };
  }

  /** Visible world rectangle. */
  get view() {
    const w = this.viewW / this.zoom;
    const h = this.viewH / this.zoom;
    return { left: this.x - w / 2, top: this.y - h / 2, width: w, height: h };
  }

  /** Drag the view by a screen-pixel amount. */
  panBy(dx: number, dy: number): void {
    this.glide = null;
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.clampView();
  }

  /** Zoom by a factor, keeping the world point under `screen` in place (like a map). */
  zoomAt(screen: Vec, factor: number): void {
    this.glide = null;
    const before = this.screenToWorld(screen);
    this.zoom = clamp(this.zoom * factor, this.minZoom, MAX_ZOOM);
    const after = this.screenToWorld(screen);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clampView();
  }

  /** Smoothly move to center on a point (and optionally a zoom). Advanced by update(). */
  glideTo(to: Vec, zoom?: number): void {
    this.glide = { to: { ...to }, zoom };
  }

  get gliding(): boolean {
    return this.glide !== null;
  }

  update(dt: number): void {
    if (!this.glide) return;
    const k = 1 - Math.exp(-dt * 7);
    if (this.glide.zoom !== undefined) this.zoom += (clamp(this.glide.zoom, this.minZoom, MAX_ZOOM) - this.zoom) * k;
    // Aim for the nearest center the map edge allows, so we stop instead of pushing into the edge.
    const halfW = this.viewW / this.zoom / 2;
    const halfH = this.viewH / this.zoom / 2;
    const tx = clamp(this.glide.to.x, halfW, this.worldW - halfW);
    const ty = clamp(this.glide.to.y, halfH, this.worldH - halfH);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.clampView();
    const zoomDone = this.glide.zoom === undefined || Math.abs(clamp(this.glide.zoom, this.minZoom, MAX_ZOOM) - this.zoom) < 0.005;
    if (zoomDone && Math.hypot(tx - this.x, ty - this.y) < 0.5) this.glide = null;
  }

  private clampView(): void {
    this.zoom = clamp(this.zoom, this.minZoom, MAX_ZOOM);
    const halfW = this.viewW / this.zoom / 2;
    const halfH = this.viewH / this.zoom / 2;
    this.x = clamp(this.x, halfW, this.worldW - halfW);
    this.y = clamp(this.y, halfH, this.worldH - halfH);
  }
}
