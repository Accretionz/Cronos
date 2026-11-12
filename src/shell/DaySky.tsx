import { useEffect, useState, type ReactNode } from "react";

/**
 * The Today header: a band of sky that follows the time of day (dawn, day, golden hour,
 * night), with the sun (or moon) on an arc showing how far through the day or night you are.
 * Purely decorative apart from the greeting, date and time it holds.
 */
export type SkyPhase = "dawn" | "day" | "dusk" | "night";

/** Sun from 6:00 to 18:00, moon from 18:00 to 6:00. */
const SUNRISE = 6;
const SUNSET = 18;

export function skyPhase(hour: number): SkyPhase {
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 16) return "day";
  if (hour >= 16 && hour < 19) return "dusk";
  return "night";
}

/** How far the sun (or moon) is along its arc, 0–1. */
export function arcProgress(minutes: number): { body: "sun" | "moon"; t: number } {
  const h = minutes / 60;
  if (h >= SUNRISE && h < SUNSET) return { body: "sun", t: (h - SUNRISE) / (SUNSET - SUNRISE) };
  const sinceSunset = (h - SUNSET + 24) % 24;
  return { body: "moon", t: sinceSunset / (24 - (SUNSET - SUNRISE)) };
}

/** The current time, updated each minute. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Tick on the minute so the clock and the sun move together.
    let t = window.setTimeout(function tick() {
      setNow(new Date());
      t = window.setTimeout(tick, 60_000 - (Date.now() % 60_000));
    }, 60_000 - (Date.now() % 60_000));
    return () => window.clearTimeout(t);
  }, []);
  return now;
}

// The arc: a half circle standing on the horizon.
const W = 260;
const H = 132;
const R = 112;
const CX = W / 2;
const CY = H - 10;
const ARC = Math.PI * R;

// A few fixed stars for the night sky (x, y, size), placed by hand so they never land on text.
const STARS: [number, number, number][] = [
  [62, 18, 1.4], [118, 10, 1], [182, 22, 1.6], [232, 14, 1], [210, 54, 1.2], [36, 60, 1], [150, 42, 0.9], [92, 48, 1.1], [246, 78, 0.9],
];

export function DaySky({ now, children }: { now: Date; children: ReactNode }) {
  const phase = skyPhase(now.getHours());
  const { body, t } = arcProgress(now.getHours() * 60 + now.getMinutes());
  const angle = Math.PI * (1 - t);
  const x = CX + R * Math.cos(angle);
  const y = CY - R * Math.sin(angle);
  const time = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <header className={`day-sky is-${phase}`}>
      <div className="day-sky-text">{children}</div>
      <svg className="day-sky-arc" viewBox={`0 0 ${W} ${H}`} aria-hidden>
        {phase === "night" && STARS.map(([sx, sy, r], i) => <circle key={i} className="day-sky-star" cx={sx} cy={sy} r={r} />)}
        <line className="day-sky-horizon" x1="0" y1={CY} x2={W} y2={CY} />
        <path className="day-sky-track" d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`} />
        <path
          className="day-sky-trail"
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          style={{ strokeDasharray: ARC, strokeDashoffset: ARC * (1 - t) }}
        />
        <g className={`day-sky-body is-${body}`} transform={`translate(${x} ${y})`}>
          <circle className="day-sky-glow" r="16" />
          <circle className="day-sky-disc" r="8.5" />
          {body === "moon" && <circle className="day-sky-bite" cx="4" cy="-3" r="7" />}
        </g>
      </svg>
      <p className="day-sky-time">
        <span className="visually-hidden">The time is </span>
        {time}
      </p>
    </header>
  );
}
