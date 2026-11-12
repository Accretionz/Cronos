import { useState, type CSSProperties } from "react";
import { BallArt } from "./BallArt";
import { PokemonSprite, type Rarity } from "../../pokemon";
import type { Machine, MachineId } from "./machines";
import type { BallKind, SummonData } from "./model";

/**
 * The summon sequence, in order. The page steps through these; the CSS in gacha.css
 * animates each one. Durations live here and are handed to the CSS as variables.
 */
export type Phase = "idle" | "crank" | "drop" | "approach" | "wobble" | "open" | "reveal" | "jam";

export const TIMING = {
  /** Shortest crank turn, even if PokéAPI answers instantly. */
  crank: 1150,
  drop: 800,
  approach: 850,
  wobble: 1500,
  open: 560,
  /** How long the machine shakes when a summon fails. */
  jam: 480,
} as const;

export interface Shown {
  summon: SummonData;
  ball: BallKind;
  /** true = just summoned (play the reveal); false = viewing an old summon. */
  fresh: boolean;
}

/** Scene coordinates (the SVG viewBox is 360 × 480). */
const W = 360;
const H = 480;
const STAGE = { x: 180, y: 212 };

const GLOBE = { cx: 180, cy: 130, r: 112 };
const CAPSULE_R = 15;
/** Mini balls piled in the globe: [x, y, rotation]. Their design comes from the machine's theme. */
const CAPSULES: [number, number, number][] = [
  [165, 219, 12], [196, 220, -20],
  [134, 196, 40], [164, 192, -8], [195, 193, 25], [226, 197, -35],
  [118, 170, -50], [149, 166, 18], [180, 164, -4], [211, 166, 60], [242, 171, -22],
  [104, 143, 30], [135, 139, -40], [166, 136, 8], [197, 138, -15], [228, 140, 45], [257, 146, -60],
  [122, 112, -25], [176, 108, 50], [229, 113, -10],
  [153, 84, 20], [208, 86, -45],
];

/** How each machine looks. Body gradient runs left to right. */
interface MachineTheme {
  body: [string, string, string, string];
  /** Outlines, feet. */
  dark: string;
  /** Top cap and crank knob. */
  cap: string;
  capLight: string;
  tray: string;
  /** Capsules in the globe, repeated in order. */
  capsules: BallKind[];
  decor?: "great" | "ultra" | "master" | "luxury";
}

export const MACHINE_THEMES: Record<MachineId, MachineTheme> = {
  poke: {
    body: ["#b3260a", "#f0532c", "#e3350d", "#9c2008"], dark: "#861b06", cap: "#e3350d", capLight: "#f0532c", tray: "#c22c0b",
    capsules: ["poke", "great", "poke", "poke", "premier", "poke", "poke", "great"],
  },
  great: {
    body: ["#1d4fa8", "#4a8cf0", "#2f6fdc", "#1a438f"], dark: "#12336e", cap: "#e3350d", capLight: "#f0532c", tray: "#2559b8",
    capsules: ["great", "great", "poke", "great", "ultra", "great"], decor: "great",
  },
  ultra: {
    body: ["#1c1c1c", "#4a4a4a", "#2e2e2e", "#151515"], dark: "#0c0c0c", cap: "#f5c518", capLight: "#ffd84d", tray: "#3a3a3a",
    capsules: ["ultra", "ultra", "great", "ultra", "ultra", "master", "ultra"], decor: "ultra",
  },
  master: {
    body: ["#4e2a86", "#8b5ad0", "#7040b0", "#432374"], dark: "#2f1857", cap: "#e467b1", capLight: "#f08fca", tray: "#5b3299",
    capsules: ["master", "master", "ultra", "master", "master"], decor: "master",
  },
  luxury: {
    body: ["#141414", "#3d3d3d", "#262626", "#0f0f0f"], dark: "#9c7a1c", cap: "#d8321a", capLight: "#ef5a3c", tray: "#2b2b2b",
    capsules: ["luxury", "luxury", "premier", "luxury", "luxury"], decor: "luxury",
  },
};

const RAY_COLORS: Record<Rarity | "shiny", string> = {
  common: "#9fd0ff",
  legendary: "#ffc93c",
  mythical: "#d08bff",
  shiny: "#ffe680",
};
const PARTICLE_COLORS: Record<Rarity | "shiny", string[]> = {
  common: ["#ffffff", "#9fd0ff", "#ffe680"],
  legendary: ["#ffc93c", "#fff1b8", "#ff9f1c"],
  mythical: ["#d08bff", "#ff8ad8", "#ffffff"],
  shiny: ["#ffe680", "#8ef0ff", "#ff9ae0", "#b6ff8e"],
};

/** Burst particles: fixed spread (no randomness, so every reveal looks balanced). */
const PARTICLES = Array.from({ length: 20 }, (_, i) => {
  const angle = (i / 20) * Math.PI * 2 + (i % 3) * 0.12;
  const dist = 120 + ((i * 37) % 70);
  return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, size: 4 + (i % 4) * 1.6, delay: (i % 5) * 25, star: i % 2 === 0 };
});

const SPARKLE = "M0 -1 L0.22 -0.22 L1 0 L0.22 0.22 L0 1 L-0.22 0.22 L-1 0 L-0.22 -0.22 Z";

export function GachaMachine({ phase, shown, machine, onClick }: { phase: Phase; shown: Shown | null; machine: Machine; onClick?: () => void }) {
  const theme = MACHINE_THEMES[machine.id];
  const s = shown?.summon;
  const tone = s ? (s.shiny && s.rarity === "common" ? "shiny" : s.rarity) : "common";
  const showBall = shown && (phase === "drop" || phase === "approach" || phase === "wobble" || phase === "open");
  const revealed = shown && phase === "reveal";
  const vars = {
    "--t-crank": `${TIMING.crank}ms`,
    "--t-drop": `${TIMING.drop}ms`,
    "--t-approach": `${TIMING.approach}ms`,
    "--t-wobble": `${TIMING.wobble}ms`,
    "--t-open": `${TIMING.open}ms`,
    "--t-jam": `${TIMING.jam}ms`,
    "--ray": RAY_COLORS[tone],
  } as CSSProperties;

  // The machine stays bright while it works; once the ball heads toward you, it fades back.
  const dimmed = phase === "approach" || phase === "wobble" || phase === "open" || phase === "reveal";
  const classes = ["gacha", `is-${phase}`, shown ? `tone-${tone}` : "", shown && !shown.fresh ? "is-static" : "", dimmed ? "is-dimmed" : ""];

  return (
    <div className={classes.filter(Boolean).join(" ")} style={vars} onClick={onClick}>
      <svg className="gacha-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Capsule machine">
        <defs>
          <linearGradient id="gm-body" x1="0" x2="1">
            <stop offset="0" stopColor={theme.body[0]} />
            <stop offset="0.22" stopColor={theme.body[1]} />
            <stop offset="0.55" stopColor={theme.body[2]} />
            <stop offset="1" stopColor={theme.body[3]} />
          </linearGradient>
          <radialGradient id="gm-glass" cx="0.38" cy="0.32" r="0.8">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="0.6" stopColor="#cfe6ff" stopOpacity="0.28" />
            <stop offset="1" stopColor="#8fb8e0" stopOpacity="0.5" />
          </radialGradient>
          <radialGradient id="gm-metal" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.5" stopColor="#d4d7dc" />
            <stop offset="1" stopColor="#8d939b" />
          </radialGradient>
          <linearGradient id="gm-chute" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0d0d0d" />
            <stop offset="1" stopColor="#2e2e2e" />
          </linearGradient>
          <radialGradient id="gm-ray">
            <stop offset="0.1" style={{ stopColor: "var(--ray)" }} stopOpacity="0.85" />
            <stop offset="1" style={{ stopColor: "var(--ray)" }} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="gm-aura">
            <stop offset="0.35" style={{ stopColor: "var(--ray)" }} stopOpacity="0.9" />
            <stop offset="1" style={{ stopColor: "var(--ray)" }} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="gm-flash-grad">
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset="0.55" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <clipPath id="gm-body-clip">
            <rect x="74" y="246" width="212" height="200" rx="24" />
          </clipPath>
          <clipPath id="gm-globe-clip">
            <circle cx={GLOBE.cx} cy={GLOBE.cy} r={GLOBE.r - 5} />
          </clipPath>
          {/* While dropping, the ball is only visible below the top of the chute, so it appears to fall out of it. */}
          <clipPath id="gm-chute-clip">
            <rect x="0" y="362" width={W} height={H - 362} />
          </clipPath>
        </defs>

        {/* ---------- The machine ---------- */}
        <g className="gm-machine">
          <ellipse cx="180" cy="462" rx="128" ry="9" fill="#000" opacity="0.14" />
          <rect x="94" y="436" width="30" height="22" rx="5" fill={theme.dark} />
          <rect x="236" y="436" width="30" height="22" rx="5" fill={theme.dark} />

          {/* Body */}
          <rect x="74" y="246" width="212" height="200" rx="24" fill="url(#gm-body)" stroke={theme.dark} strokeWidth="2" />
          <BodyDecor decor={theme.decor} />
          <rect x="90" y="262" width="9" height="168" rx="4.5" fill="#fff" opacity="0.2" />

          {/* Globe (behind the capsules) */}
          <circle cx={GLOBE.cx} cy={GLOBE.cy} r={GLOBE.r} fill="url(#gm-glass)" />
          <g clipPath="url(#gm-globe-clip)">
            {CAPSULES.map(([x, y, rot], i) => (
              <g key={i} transform={`translate(${x} ${y}) rotate(${rot})`}>
                <g className="gm-capsule" style={{ "--i": i, "--jx": `${((i * 7) % 5) - 2}px`, "--jy": `${-2 - (i % 3)}px` } as CSSProperties}>
                  <BallArt kind={theme.capsules[i % theme.capsules.length]} r={CAPSULE_R} />
                </g>
              </g>
            ))}
          </g>
          {/* Glass shine and rim, in front of the capsules */}
          <path d="M 98 92 A 96 96 0 0 1 168 34" fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round" opacity="0.55" />
          <path d="M 96 120 A 92 92 0 0 1 99 106" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" opacity="0.45" />
          <ellipse cx="246" cy="190" rx="10" ry="22" transform="rotate(35 246 190)" fill="#fff" opacity="0.18" />
          <circle cx={GLOBE.cx} cy={GLOBE.cy} r={GLOBE.r} fill="none" stroke="#e8f2fb" strokeWidth="4" opacity="0.9" />
          <circle cx={GLOBE.cx} cy={GLOBE.cy} r={GLOBE.r + 2} fill="none" stroke="#2b2b2b" strokeOpacity="0.35" strokeWidth="1" />

          {/* Cap and collar */}
          <rect x="148" y="12" width="64" height="18" rx="9" fill={theme.cap} stroke={theme.dark} strokeWidth="2" />
          <circle cx="180" cy="11" r="7" fill={theme.capLight} stroke={theme.dark} strokeWidth="2" />
          <rect x="94" y="230" width="172" height="24" rx="9" fill="#2b2b2b" />
          <rect x="102" y="236" width="156" height="3" rx="1.5" fill="#fff" opacity="0.22" />

          {/* Front panel: price tag, crank, coin slot */}
          <text x="180" y="245.5" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#fff" opacity="0.85" letterSpacing="2">
            {machine.name.toUpperCase()}
          </text>
          <rect x="102" y="272" width="156" height="74" rx="16" fill="#f6f1e6" stroke={theme.dark} strokeWidth="2" />
          <rect x="112" y="292" width="36" height="34" rx="7" fill="#ffd23f" stroke="#c99a00" strokeWidth="1.5" />
          <text x="130" y="306" textAnchor="middle" fontSize="7" fontWeight="700" fill="#7a5a00" letterSpacing="0.5">
            PRICE
          </text>
          <text x="130" y="317" textAnchor="middle" fontSize={machine.cost >= 100 ? 10 : 11} fontWeight="800" fill="#3d2d00">
            {machine.cost}
          </text>
          <text x="130" y="324.5" textAnchor="middle" fontSize="5.5" fontWeight="800" fill="#7a5a00">
            GP
          </text>
          <rect x="220" y="290" width="22" height="38" rx="6" fill="#d9d4c7" stroke="#aaa395" strokeWidth="1.5" />
          <rect x="229" y="297" width="4" height="24" rx="2" fill="#1b1b1b" />

          <circle cx="180" cy="309" r="30" fill="url(#gm-metal)" stroke="#7d838a" strokeWidth="1.5" />
          <g transform="translate(180 309)">
            <g className="gm-crank">
              <rect x="-27" y="-7.5" width="54" height="15" rx="7.5" fill="#34373b" />
              <rect x="-25" y="-6" width="50" height="4" rx="2" fill="#fff" opacity="0.18" />
              <circle cx="19" cy="0" r="4.5" fill="#f6f6f2" />
              <circle r="9" fill={theme.cap} stroke={theme.dark} strokeWidth="1.5" />
              <circle cx="-2.5" cy="-2.5" r="3" fill="#fff" opacity="0.45" />
            </g>
          </g>

          {/* Chute with a swinging flap */}
          <rect x="138" y="360" width="84" height="56" rx="15" fill="url(#gm-chute)" stroke="#5c1204" strokeWidth="2" />
          <g transform="translate(142 362)">
            <rect className="gm-flap" x="0" y="0" width="76" height="30" rx="11" fill="#fff" fillOpacity="0.16" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.5" />
          </g>
        </g>

        {/* ---------- Light show behind the ball/Pokémon ---------- */}
        <g transform={`translate(${STAGE.x} ${STAGE.y})`}>
          <g className="gm-rays">
            {Array.from({ length: 12 }, (_, i) => (
              <path key={i} d="M 0 0 L -17 -250 L 17 -250 Z" transform={`rotate(${i * 30})`} fill="url(#gm-ray)" />
            ))}
          </g>
          <circle className="gm-aura" r="100" fill="url(#gm-aura)" />
        </g>

        {/* ---------- The ball ---------- */}
        <ellipse className="gm-ball-shadow" cx={STAGE.x} cy={STAGE.y + 84} rx="62" ry="8" fill="#000" />
        {showBall && (
          <g clipPath={phase === "drop" ? "url(#gm-chute-clip)" : undefined}>
            <g className="gm-ball">
              <g className="gm-ball-spin">
                <BallArt kind={shown.ball} r={22} />
              </g>
            </g>
          </g>
        )}

        {/* Tray lip, in front of the ball as it lands */}
        <g className="gm-front">
          <rect x="130" y="406" width="100" height="16" rx="8" fill={theme.tray} stroke={theme.dark} strokeWidth="2" />
          <rect x="140" y="409" width="80" height="3" rx="1.5" fill="#fff" opacity="0.25" />
        </g>

        {/* ---------- Opening flash, burst and shiny sparkles ---------- */}
        <g transform={`translate(${STAGE.x} ${STAGE.y})`} pointerEvents="none">
          {shown?.summon.shiny && (phase === "wobble" || phase === "open") && (
            <g className="gm-sparkles">
              {[
                [-92, -60, 9],
                [96, -30, 7],
                [-70, 72, 6],
                [84, 70, 10],
                [4, -104, 6],
              ].map(([x, y, size], i) => (
                <path key={i} className="gm-sparkle" d={SPARKLE} transform={`translate(${x} ${y}) scale(${size})`} fill="#ffcf3a" stroke="#fff" strokeWidth={0.12} style={{ animationDelay: `${i * 160}ms` }} />
              ))}
            </g>
          )}
          {(phase === "open" || (revealed && shown.fresh)) && (
            <Burst tone={tone} startDelay={phase === "open" ? TIMING.open * 0.45 : 0} />
          )}
          {phase === "open" && <circle className="gm-flash" r="24" fill="url(#gm-flash-grad)" />}
        </g>
      </svg>

      {revealed && s && (
        <div className="gacha-reveal" key={`${s.dex}-${s.shiny}-${shown.fresh}`}>
          <div className="gacha-float">
            <PokemonSprite dex={s.dex} shiny={s.shiny} name={s.name} className="stage-sprite" />
          </div>
        </div>
      )}
    </div>
  );
}

/** Confetti burst. The start delay is fixed when it first appears, so moving from "open" to "reveal" doesn't restart it. */
function Burst({ tone, startDelay }: { tone: Rarity | "shiny"; startDelay: number }) {
  const [base] = useState(startDelay);
  const colors = PARTICLE_COLORS[tone];
  return (
    <g className="gm-burst">
      {PARTICLES.map((p, i) => (
        <g key={i} className="gm-particle" style={{ "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, animationDelay: `${base + p.delay}ms` } as CSSProperties}>
          {p.star ? (
            <path d={SPARKLE} transform={`scale(${p.size * 1.6})`} fill={colors[i % colors.length]} />
          ) : (
            <circle r={p.size * 0.7} fill={colors[i % colors.length]} />
          )}
        </g>
      ))}
    </g>
  );
}

/** Each machine's markings on the body, clipped to its shape. */
function BodyDecor({ decor }: { decor: MachineTheme["decor"] }) {
  if (!decor) return null;
  return (
    <g clipPath="url(#gm-body-clip)">
      {decor === "great" && (
        <g fill="#e3350d">
          <ellipse cx="96" cy="262" rx="30" ry="11" transform="rotate(-35 96 262)" />
          <ellipse cx="264" cy="262" rx="30" ry="11" transform="rotate(35 264 262)" />
        </g>
      )}
      {decor === "ultra" && (
        <g fill="#f5c518">
          <rect x="74" y="246" width="16" height="200" />
          <rect x="270" y="246" width="16" height="200" />
          <rect x="90" y="350" width="180" height="5" />
        </g>
      )}
      {decor === "master" && (
        <g fill="#e467b1">
          <circle cx="92" cy="264" r="11" />
          <circle cx="268" cy="264" r="11" />
        </g>
      )}
      {decor === "luxury" && (
        <g>
          <rect x="74" y="350" width="212" height="10" fill="#d8321a" />
          <rect x="74" y="347" width="212" height="2.5" fill="#e0b43a" />
          <rect x="74" y="360.5" width="212" height="2.5" fill="#e0b43a" />
          <rect x="75" y="247" width="210" height="198" rx="23" fill="none" stroke="#e0b43a" strokeWidth="2" />
        </g>
      )}
    </g>
  );
}
