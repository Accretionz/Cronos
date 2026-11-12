import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import "./ui.css";

/** A second checkbox click this soon after a check is treated as a double-click and ignored. */
export const DOUBLE_CLICK_GUARD_MS = 250;

/**
 * For lists where a checked row leaves at once and the next one moves up under the cursor.
 * Spread the result on the list: a second click on a `.check` within DOUBLE_CLICK_GUARD_MS of
 * the last one is ignored, so a double-click (or a bouncy tap) can't also check the row that
 * just slid into place. Deliberate clicks, even ~3 a second, are slower than that.
 */
export function useDoubleClickGuard() {
  const last = useRef(0);
  return {
    onClickCapture: (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".check")) return;
      const now = performance.now();
      if (now - last.current < DOUBLE_CLICK_GUARD_MS) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      last.current = now;
    },
  };
}

/**
 * The folded "✓ N completed" line under a checklist; opens to show `children` (to un-check).
 * When the count goes up (something was just checked) the tick pops and the list folds
 * again, so the card stays short. Renders nothing when the count is 0.
 */
export function CompletedGroup({ count, id, children }: { count: number; id: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [bump, setBump] = useState(0);
  const prev = useRef(count);
  useEffect(() => {
    if (count > prev.current) {
      setOpen(false);
      setBump((b) => b + 1);
    }
    if (count === 0) setOpen(false);
    prev.current = count;
  }, [count]);

  if (count === 0) return null;
  return (
    <div className="done-group">
      <button className="widget-toggle done-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span key={bump} className={`done-tick${bump ? " is-bump" : ""}`} aria-hidden>
          ✓
        </span>
        {count} completed
        <span className={`chevron${open ? " is-open" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="done-list" id={id}>
          {children}
        </div>
      )}
    </div>
  );
}
