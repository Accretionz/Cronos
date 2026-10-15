import { useMemo, useRef, useState, type PointerEvent } from "react";
import { OTHER_SLICE_COLOR, useCategoryColors } from "./colors";
import { formatMoney, formatShare, spendingSlices, type CategoryTotal } from "./model";

const SIZE = 200;
const C = SIZE / 2;
const R = 92;
/** How far a highlighted slice slides out from the center. */
const POP = 6;


function point(angle: number, r = R) {
  return [C + r * Math.cos(angle), C + r * Math.sin(angle)] as const;
}

/** SVG path for one wedge, angles in radians (0 = 3 o'clock, clockwise). */
function wedge(start: number, end: number): string {
  const [x1, y1] = point(start);
  const [x2, y2] = point(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${C} ${C} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
}

/**
 * Share of this month's spending by category: a pie plus a legend that doubles as
 * the data table (name, amount, share), so nothing depends on color alone.
 */
export function SpendingPie({ categories }: { categories: CategoryTotal[] }) {
  const slices = useMemo(() => spendingSlices(categories), [categories]);
  const { colorFor } = useCategoryColors();
  const color = (s: { label: string; folded: boolean }) => (s.folded ? OTHER_SLICE_COLOR : colorFor(s.label));
  const total = slices.reduce((sum, s) => sum + s.cents, 0);
  const [active, setActive] = useState<number | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Start at 12 o'clock, go clockwise.
  const arcs = useMemo(() => {
    let angle = -Math.PI / 2;
    return slices.map((s) => {
      const start = angle;
      angle += s.share * Math.PI * 2;
      return { start, end: angle, mid: (start + angle) / 2 };
    });
  }, [slices]);

  if (slices.length === 0) return <p className="muted">No spending yet this month.</p>;

  if (slices.length === 1) {
    // A one-slice pie says nothing a sentence can't.
    return (
      <p className="pie-single">
        <strong>100%</strong> of this month's spending ({formatMoney(total)}) went to <strong>{slices[0].label}</strong>.
      </p>
    );
  }

  const moveTip = (e: PointerEvent, i: number) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    setActive(i);
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top });
  };
  const clear = () => {
    setActive(null);
    setTip(null);
  };

  const summary = slices.map((s) => `${s.label} ${formatShare(s.share)}`).join(", ");
  const current = active !== null ? slices[active] : null;

  return (
    <div className="spend-pie">
      <p className="pie-total">
        <span className="muted">Total spent</span> <strong>{formatMoney(total)}</strong>
      </p>

      <div className="pie-wrap" ref={wrapRef} onPointerLeave={clear}>
        <svg
          className={`pie${active !== null ? " has-active" : ""}`}
          viewBox={`${-POP} ${-POP} ${SIZE + POP * 2} ${SIZE + POP * 2}`}
          role="img"
          aria-label={`Spending by category: ${summary}`}
        >
          {slices.map((s, i) => {
            const { start, end, mid } = arcs[i];
            const isActive = active === i;
            const dx = isActive ? Math.cos(mid) * POP : 0;
            const dy = isActive ? Math.sin(mid) * POP : 0;
            return (
              <g
                key={s.label}
                className={`pie-slice${isActive ? " is-active" : ""}`}
                style={{ transform: `translate(${dx}px, ${dy}px)` }}
                onPointerMove={(e) => moveTip(e, i)}
                onPointerDown={(e) => moveTip(e, i)}
              >
                <path d={wedge(start, end)} fill={color(s)} />
              </g>
            );
          })}
        </svg>

        {current && tip && (
          <div
            className="pie-tip"
            role="presentation"
            style={{ left: tip.x, top: tip.y }}
          >
            <span className="pie-tip-value">
              {formatMoney(current.cents)} · {formatShare(current.share)}
            </span>
            <span className="pie-tip-label">
              <span className="pie-tip-key" style={{ background: color(current) }} />
              {current.label}
            </span>
            {current.members && <span className="pie-tip-members">{current.members.join(", ")}</span>}
          </div>
        )}
      </div>

      <table className="pie-table">
        <caption className="visually-hidden">Spending by category this month</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Spent</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {slices.map((s, i) => (
            <tr
              key={s.label}
              className={active === i ? "is-active" : ""}
              tabIndex={0}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={clear}
              onFocus={() => setActive(i)}
              onBlur={clear}
              title={s.members ? s.members.join(", ") : undefined}
            >
              <th scope="row">
                <span className="pie-swatch" style={{ background: color(s) }} aria-hidden />
                {s.label}
              </th>
              <td>{formatMoney(s.cents)}</td>
              <td>{formatShare(s.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
