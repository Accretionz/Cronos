import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

export interface MenuAction {
  label: string;
  icon?: string;
  onSelect: () => void;
  danger?: boolean;
}

/**
 * A "⋯" button that opens a small menu of actions for one row.
 * Closes on outside click, Escape, or after choosing. Arrow keys move between items.
 * Opens upward when there isn't room below.
 */
export function RowMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  // Decide direction before paint, then focus the first item.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    setUp(window.innerHeight - r.bottom < 120 && r.top > 120);
    itemRefs.current[0]?.focus();
  }, [open]);

  // Click or tap anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const onMenuKey = (e: KeyboardEvent) => {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  return (
    <div className="row-menu-wrap" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`row-menu-btn${open ? " is-open" : ""}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden>⋯</span>
      </button>
      {open && (
        <div id={menuId} className={`row-menu${up ? " is-up" : ""}`} role="menu" aria-label={label} onKeyDown={onMenuKey}>
          {actions.map((a, i) => (
            <button
              key={a.label}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              className={`row-menu-item${a.danger ? " is-danger" : ""}`}
              onClick={() => {
                close(false);
                a.onSelect();
              }}
            >
              {a.icon && (
                <span className="row-menu-icon" aria-hidden>
                  {a.icon}
                </span>
              )}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
