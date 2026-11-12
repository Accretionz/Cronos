import type { ReactNode } from "react";

/**
 * A number with a label: the tiles across the top of the Today page. The whole tile is a
 * link when `href` is given. All tiles share one height and layout so a row lines up.
 */
export function StatTile({
  label,
  value,
  unit,
  detail,
  icon,
  progress,
  href,
  tone,
}: {
  label: string;
  value: ReactNode;
  /** Small text after the value, e.g. "GP" or "days". */
  unit?: string;
  /** One short line under the value. */
  detail?: ReactNode;
  icon?: ReactNode;
  /** A thin bar under the value (e.g. XP to the next level). */
  progress?: { value: number; max: number; label: string };
  href?: string;
  /** "accent" tints the tile, for a celebration (e.g. a perfect day). */
  tone?: "accent";
}) {
  const body = (
    <>
      <span className="stat-tile-label">
        {icon && (
          <span className="stat-tile-icon" aria-hidden>
            {icon}
          </span>
        )}
        {label}
      </span>
      <span className="stat-tile-value">
        {value}
        {unit && <span className="stat-tile-unit">{unit}</span>}
      </span>
      {progress && (
        <span
          className="stat-tile-bar"
          role="progressbar"
          aria-label={progress.label}
          aria-valuemin={0}
          aria-valuemax={progress.max}
          aria-valuenow={progress.value}
        >
          <span style={{ width: `${Math.min(100, (progress.value / Math.max(progress.max, 1)) * 100)}%` }} />
        </span>
      )}
      {detail && <span className="stat-tile-detail">{detail}</span>}
    </>
  );
  const cls = `stat-tile${tone ? ` is-${tone}` : ""}`;
  return href ? (
    <a className={`${cls} is-link`} href={href}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
