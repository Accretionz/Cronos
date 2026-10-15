import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useModules } from "../core";
import { applyOrder, moveId, setNavOrder, useNavOrder } from "./navOrder";
import { href, type Route } from "./router";

interface NavItem {
  id: string;
  label: string;
  icon: string;
  href: string;
}

/** Hold this long on a touchscreen before an item lifts (a quick swipe still scrolls). */
const LONG_PRESS_MS = 350;
/** Mouse must move this far before a press becomes a drag (so clicks still work). */
const MOUSE_DRAG_PX = 5;
/** A finger moving this far before the long-press finishes means "scroll", not "drag". */
const TOUCH_SLOP_PX = 8;
/** How long other items take to slide out of the way, and the dropped item to settle. */
const SLIDE_MS = 180;
const DROP_MS = 200;
const LIFT_SCALE = 1.04;

interface Gesture {
  id: string;
  pointerId: number;
  el: HTMLElement;
  startX: number;
  startY: number;
  /** Where inside the item the pointer grabbed it, so the item doesn't jump to the cursor. */
  grabX: number;
  grabY: number;
  lastX: number;
  lastY: number;
  mouse: boolean;
  active: boolean;
  timer?: number;
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Run a style change, then let the browser animate the next one. */
const nextFrame = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn));

export function Nav({ route }: { route: Route }) {
  const modules = useModules();
  const savedOrder = useNavOrder();

  // Today is pinned first; only module pages are reorderable.
  const items = useMemo<NavItem[]>(() => {
    const all = modules
      .filter((m) => m.page)
      .map((m) => ({ id: m.id, label: m.name, icon: m.icon ?? "•", href: href.module(m.id) }));
    return applyOrder(all, savedOrder);
  }, [modules, savedOrder]);

  // While dragging: the live preview order. Committed on release.
  const [preview, setPreview] = useState<{ id: string; order: string[] } | null>(null);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const [dropped, setDropped] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const navRef = useRef<HTMLElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const itemEls = useRef(new Map<string, HTMLElement>());
  /** Screen positions captured just before an order change, for the slide animation. */
  const before = useRef<Map<string, DOMRect> | null>(null);

  const shown = preview ? preview.order.map((id) => items.find((i) => i.id === id)!).filter(Boolean) : items;
  const shownKey = shown.map((i) => i.id).join();

  const isActive = (id: string) =>
    (id === "today" && route.name === "today") || (route.name === "module" && route.id === id);

  const horizontal = () => {
    const nav = navRef.current;
    return nav ? getComputedStyle(nav).flexDirection.startsWith("row") : false;
  };

  /* ---------- Animation helpers ---------- */

  /** Remember where everything is on screen right now (call before changing the order). */
  const captureBefore = () => {
    const rects = new Map<string, DOMRect>();
    itemEls.current.forEach((el, id) => rects.set(id, el.getBoundingClientRect()));
    before.current = rects;
  };

  /** Keep the lifted item under the pointer, moving only along the bar's axis. */
  const placeDragged = () => {
    const g = gesture.current;
    if (!g?.active) return;
    const el = g.el;
    el.style.transition = "none";
    el.style.transform = "";
    const home = el.getBoundingClientRect();
    const dx = horizontal() ? g.lastX - g.grabX - home.left : 0;
    const dy = horizontal() ? 0 : g.lastY - g.grabY - home.top;
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${LIFT_SCALE})`;
  };

  /** Move the dashed "it will land here" outline to the dragged item's slot. */
  const placeSlot = () => {
    const g = gesture.current;
    const slot = slotRef.current;
    if (!slot || !g?.active) return;
    const el = g.el;
    slot.style.top = `${el.offsetTop}px`;
    slot.style.left = `${el.offsetLeft}px`;
    slot.style.width = `${el.offsetWidth}px`;
    slot.style.height = `${el.offsetHeight}px`;
  };

  // FLIP: after the order changes, start every other item at its old spot and slide it to the new one.
  useLayoutEffect(() => {
    const prev = before.current;
    before.current = null;
    const draggedId = gesture.current?.active ? gesture.current.id : null;
    if (prev && !reducedMotion()) {
      itemEls.current.forEach((el, id) => {
        if (id === draggedId) return;
        const old = prev.get(id);
        if (!old) return;
        el.style.transition = "none";
        el.style.transform = "";
        const now = el.getBoundingClientRect();
        const dx = old.left - now.left;
        const dy = old.top - now.top;
        if (!dx && !dy) return;
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.getBoundingClientRect(); // apply the starting position before animating
        el.style.transition = `transform ${SLIDE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
        el.style.transform = "";
      });
    }
    placeDragged();
    placeSlot();
  }, [shownKey]);

  /** Glide the released item from under the pointer into its slot. */
  const settle = (el: HTMLElement) => {
    if (reducedMotion()) {
      el.style.transition = "";
      el.style.transform = "";
      return;
    }
    el.style.transition = `transform ${DROP_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
    el.style.transform = "";
    window.setTimeout(() => {
      el.style.transition = "";
    }, DROP_MS + 20);
  };

  const flash = (id: string) => {
    setDropped(id);
    window.setTimeout(() => setDropped((d) => (d === id ? null : d)), 700);
  };

  /* ---------- Pointer dragging (mouse, pen and touch) ---------- */

  const begin = () => {
    const g = gesture.current;
    if (!g || g.active) return;
    g.active = true;
    try {
      g.el.setPointerCapture(g.pointerId);
    } catch {
      /* pointer already released */
    }
    if (!g.mouse) navigator.vibrate?.(10);
    setPreview({ id: g.id, order: items.map((i) => i.id) });
    placeSlot();
    placeDragged();
  };

  const end = (commit: boolean) => {
    const g = gesture.current;
    if (g?.timer) clearTimeout(g.timer);
    gesture.current = null;
    if (!g?.active) return;

    const p = previewRef.current;
    suppressClick.current = true; // the release shouldn't also follow the link
    window.setTimeout(() => (suppressClick.current = false), 0);

    if (commit && p) {
      setNavOrder(p.order);
      const label = items.find((i) => i.id === p.id)?.label;
      setAnnouncement(`${label} moved to position ${p.order.indexOf(p.id) + 2} of ${p.order.length + 1}`);
    } else {
      captureBefore(); // cancelled: slide everything back
    }
    setPreview(null);
    nextFrame(() => settle(g.el));
    flash(g.id);
  };

  const onPointerDown = (e: PointerEvent<HTMLAnchorElement>, id: string) => {
    if (e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const g: Gesture = {
      id,
      pointerId: e.pointerId,
      el: e.currentTarget,
      startX: e.clientX,
      startY: e.clientY,
      grabX: e.clientX - r.left,
      grabY: e.clientY - r.top,
      lastX: e.clientX,
      lastY: e.clientY,
      mouse: e.pointerType === "mouse",
      active: false,
    };
    if (!g.mouse) g.timer = window.setTimeout(begin, LONG_PRESS_MS);
    gesture.current = g;
  };

  const onPointerMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    g.lastX = e.clientX;
    g.lastY = e.clientY;
    const dist = Math.hypot(e.clientX - g.startX, e.clientY - g.startY);
    if (!g.active) {
      if (g.mouse && dist > MOUSE_DRAG_PX) begin();
      else if (!g.mouse && dist > TOUCH_SLOP_PX) end(false); // it's a scroll
      return;
    }
    placeDragged();

    const p = previewRef.current;
    if (!p) return;
    // Where would it land? Compare the dragged item's center with the other items' centers.
    const horiz = horizontal();
    const r = g.el.getBoundingClientRect();
    const center = horiz ? r.left + r.width / 2 : r.top + r.height / 2;
    let index = 0;
    itemEls.current.forEach((el, id) => {
      if (id === g.id) return;
      const o = el.getBoundingClientRect();
      // Use each item's resting position (ignore its slide animation) for a stable target.
      const tx = new DOMMatrixReadOnly(getComputedStyle(el).transform === "none" ? undefined : getComputedStyle(el).transform);
      const mid = horiz ? o.left - tx.m41 + o.width / 2 : o.top - tx.m42 + o.height / 2;
      if (center > mid) index++;
    });
    const order = moveId(p.order, g.id, index);
    if (order.join() !== p.order.join()) {
      captureBefore();
      setPreview({ id: g.id, order });
    }
  };

  // Once an item is lifted on a touchscreen, stop the page/bar from scrolling under the finger.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const block = (ev: TouchEvent) => {
      if (gesture.current?.active) ev.preventDefault();
    };
    nav.addEventListener("touchmove", block, { passive: false });
    return () => nav.removeEventListener("touchmove", block);
  }, []);

  // Escape cancels a drag.
  useEffect(() => {
    if (!preview) return;
    const onKey = (ev: globalThis.KeyboardEvent) => {
      if (ev.key === "Escape") end(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview !== null]);

  /* ---------- Keyboard: Alt + arrow keys ---------- */

  const onKeyDown = (e: KeyboardEvent<HTMLAnchorElement>, id: string) => {
    if (!e.altKey) return;
    const delta =
      e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : 0;
    if (!delta) return;
    e.preventDefault();
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(id);
    const to = Math.max(0, Math.min(ids.length - 1, from + delta));
    if (to === from) return;
    captureBefore();
    setNavOrder(moveId(ids, id, to));
    flash(id);
    // Positions count Today, which is always first.
    setAnnouncement(`${items[from].label} moved to position ${to + 2} of ${ids.length + 1}`);
  };

  const dragging = preview?.id;

  return (
    <nav
      ref={navRef}
      className={`nav${preview ? " is-reordering" : ""}`}
      aria-label="Main"
      onPointerMove={onPointerMove}
      onPointerUp={() => end(true)}
      onPointerCancel={() => end(false)}
    >
      <div className="brand">Cronos</div>
      <a
        className={`nav-link is-pinned${isActive("today") ? " is-active" : ""}`}
        href={href.today}
        aria-current={isActive("today") ? "page" : undefined}
        draggable={false}
      >
        <span aria-hidden>☀</span> Today
      </a>

      <div ref={slotRef} className={`nav-slot${preview ? " is-visible" : ""}`} aria-hidden />

      {shown.map((item) => (
        <a
          key={item.id}
          ref={(el) => {
            if (el) itemEls.current.set(item.id, el);
            else itemEls.current.delete(item.id);
          }}
          data-nav-id={item.id}
          className={[
            "nav-link",
            "is-draggable",
            isActive(item.id) ? "is-active" : "",
            dragging === item.id ? "is-dragging" : "",
            dropped === item.id && dragging !== item.id ? "is-dropped" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          href={item.href}
          aria-current={isActive(item.id) ? "page" : undefined}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
          aria-roledescription="draggable link"
          draggable={false}
          onPointerDown={(e) => onPointerDown(e, item.id)}
          onKeyDown={(e) => onKeyDown(e, item.id)}
          onClick={(e) => suppressClick.current && e.preventDefault()}
          onContextMenu={(e) => gesture.current && e.preventDefault()}
        >
          <span aria-hidden>{item.icon}</span> {item.label}
          <span className="nav-grip" aria-hidden>
            ⠿
          </span>
        </a>
      ))}

      <div className="nav-spacer" />
      <a
        className={`nav-link${route.name === "settings" ? " is-active" : ""}`}
        href={href.settings}
        aria-current={route.name === "settings" ? "page" : undefined}
        draggable={false}
      >
        <span aria-hidden>⚙</span> Settings
      </a>
      <span className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </span>
    </nav>
  );
}
