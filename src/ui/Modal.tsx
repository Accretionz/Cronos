import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./ui.css";

/**
 * A dialog over the page. Closes with Esc, the ✕ button or a click on the backdrop.
 * Keeps keyboard focus inside while open and gives it back when closed.
 */
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.querySelector("[data-ui-popup]")) {
        return; // an open dropdown inside the dialog closes first
      } else if (e.key === "Escape") {
        e.stopPropagation(); // only the dialog closes, not whatever is behind it
        close.current();
      } else if (e.key === "Tab" && panel.current) {
        const focusable = panel.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close.current()}>
      <div ref={panel} className={`modal${wide ? " is-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <button className="modal-close" onClick={() => close.current()} aria-label="Close" title="Close (Esc)">
          <span aria-hidden>✕</span>
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
