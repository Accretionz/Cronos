import { useEffect, useRef, useState } from "react";
import { todayKey, useBusEvent, useItems } from "../../core";
import { XP_ENTRY, levelFromXp, levelTitle, totalXp, xpOn, type XpEntry } from "./model";

/** Ledger entries + current level, live. */
export function useLevel() {
  const entries = useItems({ type: XP_ENTRY }) as XpEntry[];
  const info = levelFromXp(totalXp(entries));
  return { entries, info, today: xpOn(entries, todayKey()) };
}

export function LevelCard({ compact = false }: { compact?: boolean }) {
  const { info, today } = useLevel();
  const pct = (info.into / info.needed) * 100;
  return (
    <div className={`level-card${compact ? " is-compact" : ""}`}>
      <div className="level-badge" aria-hidden>
        <span>{info.level}</span>
      </div>
      <div className="level-body">
        <div className="level-head">
          <span>
            <strong>Level {info.level}</strong> <span className="muted">· {levelTitle(info.level)}</span>
          </span>
          <span className="muted level-today">+{today} XP today</span>
        </div>
        <div
          className="xp-bar"
          role="progressbar"
          aria-label={`Progress to level ${info.level + 1}`}
          aria-valuemin={0}
          aria-valuemax={info.needed}
          aria-valuenow={info.into}
          aria-valuetext={`${info.into} of ${info.needed} XP`}
        >
          <div className="xp-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="level-next">
          {info.into} / {info.needed} XP to level {info.level + 1}
        </span>
      </div>
    </div>
  );
}

/* ---------- Toasts: "+25 XP" and level-ups ---------- */

interface Toast {
  id: number;
  text: string;
  big?: boolean;
}

export function XpToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef<number[]>([]);

  const push = (text: string, big = false) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, text, big }]);
    timers.current.push(window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), big ? 5000 : 2600));
  };

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useBusEvent("game.xpGained", ({ amount, reason }) => push(`+${amount} XP · ${reason}`));
  useBusEvent("game.levelUp", ({ level }) => push(`Level up! You reached level ${level} · ${levelTitle(level)}`, true));

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.big ? " is-big" : ""}`}>
          {t.big && <span aria-hidden>★ </span>}
          {t.text}
        </div>
      ))}
    </div>
  );
}
