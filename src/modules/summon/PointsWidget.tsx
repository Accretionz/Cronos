import { moduleHref, useToday } from "../../core";
import { usePoints } from "../../pokemon";
import { StatTile } from "../../ui";
import { MACHINES } from "./machines";

/** Today page tile: your Gacha Points, what you earned today, and what you can afford. */
export function PointsWidget() {
  const { balance, entries } = usePoints();
  const today = useToday();
  const earnedToday = entries.filter((e) => e.scheduledFor === today && e.data.amount > 0).reduce((s, e) => s + e.data.amount, 0);
  const affordable = [...MACHINES].filter((m) => m.cost <= balance).sort((a, b) => b.cost - a.cost)[0];
  const next = MACHINES.filter((m) => m.cost > balance).sort((a, b) => a.cost - b.cost)[0];
  const status = affordable ? `${affordable.name} ready` : next ? `${(next.cost - balance).toLocaleString()} to ${next.name}` : "";

  return (
    <StatTile
      label="Gacha Points"
      icon="◈"
      value={balance.toLocaleString()}
      unit="GP"
      detail={[earnedToday > 0 ? `+${earnedToday.toLocaleString()} today` : "", status].filter(Boolean).join(" · ")}
      href={moduleHref("summon")}
    />
  );
}
