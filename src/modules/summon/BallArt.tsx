import { useId } from "react";
import type { BallKind } from "./model";

const INK = "#232323";
const WHITE = "#f6f6f2";

const TOP_COLOR: Record<BallKind, string> = {
  poke: "#e3350d",
  great: "#2f6fdc",
  ultra: "#2a2a2a",
  master: "#7040b0",
  premier: WHITE,
  luxury: "#262626",
};

const BOTTOM_COLOR: Partial<Record<BallKind, string>> = { luxury: "#303030" };
const GOLD = "#e0b43a";

/**
 * A Poké Ball drawn in SVG, centered on (0, 0) with radius `r`.
 * The top half (".ball-lid") is hinged at its left edge, so CSS can rotate it open;
 * the bottom half and the band/button can be animated separately.
 */
export function BallArt({ kind, r }: { kind: BallKind; r: number }) {
  const clip = `ball-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const top = `M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0 Z`;
  const bottom = `M ${-r} 0 A ${r} ${r} 0 0 0 ${r} 0 Z`;
  const stroke = Math.max(1, r * 0.07);
  const band = kind === "premier" ? "#d8321a" : INK;

  return (
    <g className="ball-art">
      <defs>
        <clipPath id={clip}>
          <path d={top} />
        </clipPath>
      </defs>
      <g className="ball-bottom">
        <path d={bottom} fill={BOTTOM_COLOR[kind] ?? WHITE} stroke={INK} strokeWidth={stroke} />
        <path d={`M ${-r * 0.8} ${r * 0.25} A ${r * 0.85} ${r * 0.85} 0 0 0 ${r * 0.55} ${r * 0.72}`} fill="none" stroke="#000" strokeOpacity={0.08} strokeWidth={r * 0.18} strokeLinecap="round" />
      </g>
      {/* Hinge at the left edge: the wrapper moves the origin there so the lid rotates around it. */}
      <g transform={`translate(${-r} 0)`}>
        <g className="ball-lid">
          <g transform={`translate(${r} 0)`}>
            <path d={top} fill={TOP_COLOR[kind]} />
            <g clipPath={`url(#${clip})`}>
              <Markings kind={kind} r={r} />
              <ellipse cx={-r * 0.38} cy={-r * 0.52} rx={r * 0.24} ry={r * 0.11} transform={`rotate(-35 ${-r * 0.38} ${-r * 0.52})`} fill="#fff" opacity={0.55} />
            </g>
            <path d={top} fill="none" stroke={INK} strokeWidth={stroke} />
          </g>
        </g>
      </g>
      <g className="ball-mid">
        <rect x={-r} y={-r * 0.075} width={r * 2} height={r * 0.15} fill={band} />
        <circle r={r * 0.3} fill={band} />
        <circle r={r * 0.2} fill={kind === "luxury" ? GOLD : WHITE} stroke={kind === "luxury" ? "#8a6a12" : "#b9b9b9"} strokeWidth={r * 0.03} />
        <circle className="ball-glow" r={r * 0.13} fill="#fff" />
      </g>
    </g>
  );
}

function Markings({ kind, r }: { kind: BallKind; r: number }) {
  if (kind === "great") {
    return (
      <g fill="#e3350d">
        <ellipse cx={-r * 0.52} cy={-r * 0.6} rx={r * 0.36} ry={r * 0.15} transform={`rotate(-38 ${-r * 0.52} ${-r * 0.6})`} />
        <ellipse cx={r * 0.52} cy={-r * 0.6} rx={r * 0.36} ry={r * 0.15} transform={`rotate(38 ${r * 0.52} ${-r * 0.6})`} />
      </g>
    );
  }
  if (kind === "ultra") {
    return (
      <g fill="#f5c518">
        <rect x={-r * 1.0} y={-r} width={r * 0.42} height={r} />
        <rect x={r * 0.58} y={-r} width={r * 0.42} height={r} />
        <rect x={-r * 0.6} y={-r * 0.24} width={r * 1.2} height={r * 0.12} />
      </g>
    );
  }
  if (kind === "master") {
    return (
      <g>
        <circle cx={-r * 0.5} cy={-r * 0.58} r={r * 0.19} fill="#e467b1" />
        <circle cx={r * 0.5} cy={-r * 0.58} r={r * 0.19} fill="#e467b1" />
        <path
          d={`M ${-r * 0.2} ${-r * 0.3} L ${-r * 0.2} ${-r * 0.72} L 0 ${-r * 0.5} L ${r * 0.2} ${-r * 0.72} L ${r * 0.2} ${-r * 0.3}`}
          fill="none"
          stroke="#fff"
          strokeWidth={r * 0.09}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </g>
    );
  }
  if (kind === "luxury") {
    return (
      <g>
        <rect x={-r} y={-r * 0.62} width={r * 2} height={r * 0.26} fill="#d8321a" />
        <rect x={-r} y={-r * 0.66} width={r * 2} height={r * 0.05} fill={GOLD} />
        <rect x={-r} y={-r * 0.36} width={r * 2} height={r * 0.05} fill={GOLD} />
        <rect x={-r} y={-r * 0.16} width={r * 2} height={r * 0.06} fill={GOLD} />
      </g>
    );
  }
  if (kind === "premier") {
    return <path d={`M ${-r} ${-r * 0.075} L ${r} ${-r * 0.075}`} stroke="#d8321a" strokeWidth={r * 0.06} />;
  }
  return null;
}
