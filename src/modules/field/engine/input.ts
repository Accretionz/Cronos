import type { Camera } from "./camera";
import type { Vec } from "./math";

export interface InputHandlers {
  /** A tap or click that wasn't a drag. Screen point in CSS pixels, relative to the canvas. */
  onTap(screen: Vec): void;
  /** Pointer moved without a button (mouse hover). null when it leaves. */
  onHover(screen: Vec | null): void;
  /** Escape pressed. */
  onEscape(): void;
  /** The view was moved or zoomed by the user. */
  onViewChange?(): void;
}

const DRAG_THRESHOLD = 6;
const KEY_PAN = 60;

/**
 * Mouse, touch and keyboard for the field: drag to pan, pinch or Ctrl/⌘ + scroll to zoom,
 * tap to act, arrow keys to pan, +/− to zoom. Plain scrolling still scrolls the page.
 * Returns a function that removes all listeners.
 */
export function attachInput(canvas: HTMLCanvasElement, cam: Camera, h: InputHandlers): () => void {
  const pointers = new Map<number, Vec>();
  let downAt: Vec | null = null;
  let dragged = false;
  let pinch: { dist: number; mid: Vec } | null = null;

  const local = (e: { clientX: number; clientY: number }): Vec => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      downAt = p;
      dragged = false;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      dragged = true; // a pinch is never a tap
    }
  };

  const onMove = (e: PointerEvent) => {
    const p = local(e);
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === "mouse") h.onHover(p);
      return;
    }
    pointers.set(e.pointerId, p);
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      cam.panBy(mid.x - pinch.mid.x, mid.y - pinch.mid.y);
      if (pinch.dist > 0) cam.zoomAt(mid, d / pinch.dist);
      pinch = { dist: d, mid };
      h.onViewChange?.();
      return;
    }
    if (downAt && !dragged && Math.hypot(p.x - downAt.x, p.y - downAt.y) > DRAG_THRESHOLD) {
      dragged = true;
      canvas.classList.add("is-dragging");
    }
    if (dragged) {
      cam.panBy(p.x - prev.x, p.y - prev.y);
      h.onViewChange?.();
    }
  };

  const onUp = (e: PointerEvent) => {
    const had = pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      canvas.classList.remove("is-dragging");
      if (had && !dragged && e.type === "pointerup") h.onTap(local(e));
      downAt = null;
    }
  };

  const onLeave = () => h.onHover(null);

  const onWheel = (e: WheelEvent) => {
    // Plain wheel scrolls the page; Ctrl/⌘ + wheel (and trackpad pinch, which sets ctrlKey) zooms.
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    cam.zoomAt(local(e), Math.exp(-e.deltaY * 0.0022));
    h.onViewChange?.();
  };

  const onKey = (e: KeyboardEvent) => {
    const center = { x: cam.viewW / 2, y: cam.viewH / 2 };
    const actions: Record<string, () => void> = {
      ArrowLeft: () => cam.panBy(KEY_PAN, 0),
      ArrowRight: () => cam.panBy(-KEY_PAN, 0),
      ArrowUp: () => cam.panBy(0, KEY_PAN),
      ArrowDown: () => cam.panBy(0, -KEY_PAN),
      "+": () => cam.zoomAt(center, 1.25),
      "=": () => cam.zoomAt(center, 1.25),
      "-": () => cam.zoomAt(center, 0.8),
      Escape: () => h.onEscape(),
    };
    const act = actions[e.key];
    if (!act) return;
    e.preventDefault();
    act();
    h.onViewChange?.();
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("keydown", onKey);
  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    canvas.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("keydown", onKey);
  };
}
