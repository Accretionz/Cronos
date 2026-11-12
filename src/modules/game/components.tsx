import { useItems, useToday } from "../../core";
import { XP_ENTRY, levelFromXp, levelTitle, totalXp, xpOn, type XpEntry } from "./model";

/** Ledger entries + current level, live. */
export function useLevel() {
  const entries = useItems({ type: XP_ENTRY }) as XpEntry[];
  const info = levelFromXp(totalXp(entries));
  const day = useToday();
  return { entries, info, today: xpOn(entries, day), day };
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
