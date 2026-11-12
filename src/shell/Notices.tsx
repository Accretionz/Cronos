import { useEffect, useRef, useState } from "react";
import { useBusEvent } from "../core";

/** Pop-up notices for problems the user should know about, e.g. a save that failed. */
export function ErrorToasts() {
  const [errors, setErrors] = useState<{ id: number; message: string }[]>([]);
  const nextId = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useBusEvent("app.error", ({ message }) => {
    const id = nextId.current++;
    // The same failure often repeats; show it once.
    setErrors((e) => (e.some((x) => x.message === message) ? e : [...e.slice(-2), { id, message }]));
    timers.current.push(window.setTimeout(() => setErrors((e) => e.filter((x) => x.id !== id)), 8000));
  });

  if (errors.length === 0) return null;
  return (
    <div className="error-toasts" role="alert">
      {errors.map((e) => (
        <div key={e.id} className="error-toast">
          <span aria-hidden>⚠</span> {e.message}
          <button className="error-toast-close" aria-label="Dismiss" onClick={() => setErrors((x) => x.filter((y) => y.id !== e.id))}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

const MAX_NOTES = 4;

/** Short messages from any module ("app.notify"), stacked in the corner and fading on their own. */
export function NotifyToasts() {
  const [notes, setNotes] = useState<{ id: number; text: string; big?: boolean; icon?: string }[]>([]);
  const nextId = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useBusEvent("app.notify", ({ text, big, icon }) => {
    const id = nextId.current++;
    setNotes((n) => {
      const next = [...n, { id, text, big, icon }];
      // Too many: drop the oldest small one first, so celebrations stay up.
      while (next.length > MAX_NOTES) {
        const i = next.findIndex((x) => !x.big);
        next.splice(i === -1 ? 0 : i, 1);
      }
      return next;
    });
    timers.current.push(window.setTimeout(() => setNotes((n) => n.filter((x) => x.id !== id)), big ? 5000 : 2800));
  });

  return (
    <div className="toasts" role="status" aria-live="polite">
      {notes.map((n) => (
        <div key={n.id} className={`toast${n.big ? " is-big" : ""}`}>
          {n.icon && <span aria-hidden>{n.icon} </span>}
          {n.text}
        </div>
      ))}
    </div>
  );
}
