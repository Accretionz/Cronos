import { artworkUrl, spriteUrl } from "../../../pokemon/species";

/** A ready-to-draw Pokémon picture, trimmed to the visible pixels. */
export interface SpriteFrame {
  image: CanvasImageSource;
  /** Source rectangle (the visible part of the image). */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Draw scale: world units per source pixel. */
  scale: number;
  /** Drawn size in world units. */
  w: number;
  h: number;
  /** Pixel art (draw without smoothing) or smooth artwork. */
  pixelated: boolean;
}

type Entry = { state: "loading" } | { state: "ready"; frame: SpriteFrame } | { state: "missing" };

/** Artwork is 475px and fills the frame; pixel sprites are 96px with a margin. Scale artwork to match. */
const ARTWORK_TARGET = 64;

/**
 * Loads and caches Pokémon sprites for the canvas. Tries the pixel sprite, then the official
 * artwork; each first with CORS (so we can trim the empty margin), then without. Shared
 * across visits to the page so pictures don't reload.
 */
export class SpriteCache {
  private entries = new Map<string, Entry>();

  get(dex: number, shiny: boolean): SpriteFrame | "loading" | "missing" {
    const key = `${dex}:${shiny ? 1 : 0}`;
    let e = this.entries.get(key);
    if (!e) {
      e = { state: "loading" };
      this.entries.set(key, e);
      void this.load(dex, shiny).then((frame) => this.entries.set(key, frame ? { state: "ready", frame } : { state: "missing" }));
    }
    return e.state === "ready" ? e.frame : e.state;
  }

  private async load(dex: number, shiny: boolean): Promise<SpriteFrame | null> {
    for (const [url, art] of [
      [spriteUrl(dex, shiny), false],
      [artworkUrl(dex, shiny), true],
    ] as const) {
      const img = (await loadImage(url, true)) ?? (await loadImage(url, false));
      if (img) return frameFor(img, art);
    }
    return null;
  }
}

function loadImage(url: string, cors: boolean): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function frameFor(img: HTMLImageElement, artwork: boolean): SpriteFrame {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const box = trim(img) ?? (artwork ? { x: 0, y: 0, w: W, h: H } : { x: W * 0.18, y: W * 0.14, w: W * 0.64, h: H * 0.72 });
  const scale = artwork ? ARTWORK_TARGET / Math.max(box.w, box.h) : 1;
  return { image: img, sx: box.x, sy: box.y, sw: box.w, sh: box.h, scale, w: box.w * scale, h: box.h * scale, pixelated: !artwork };
}

/** The bounding box of non-transparent pixels, or null if the image can't be read (no CORS). */
function trim(img: HTMLImageElement): { x: number; y: number; w: number; h: number } | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 16) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  } catch {
    return null; // tainted canvas: the server didn't allow CORS
  }
}
