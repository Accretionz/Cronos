import { type CSSProperties } from "react";
import { useAccountInfo, useModules, useToday, type ModuleWidget } from "../core";
import { firstName } from "./Avatar";
import { DaySky, useNow } from "./DaySky";
import { href } from "./router";

type Placed = ModuleWidget & { moduleId: string };

/**
 * The Today page. Widgets choose an area (see ModuleWidget.slot): a row of number tiles at
 * the top, then two independent columns: what to do (main) and what's coming (side). Each
 * column stacks its own cards, so a short card never leaves a hole next to a tall one.
 */
export function Dashboard() {
  const modules = useModules();
  const widgets: Placed[] = modules
    .flatMap((m) => (m.widgets ?? []).map((w) => ({ ...w, moduleId: m.id })))
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  const stats = widgets.filter((w) => w.slot === "stat");
  const main = widgets.filter((w) => (w.slot ?? "main") === "main");
  const side = widgets.filter((w) => w.slot === "side");

  const today = useToday();
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const now = useNow();
  const name = firstName(useAccountInfo().account);
  const greeting = `${greetingFor(now.getHours())}${name ? `, ${name}` : ""}`;

  return (
    <div className="page page-today">
      <DaySky now={now}>
        <p className="eyebrow">{date}</p>
        <h1>{greeting}</h1>
      </DaySky>
      {widgets.length === 0 ? (
        <p className="muted empty-state">
          No widgets yet. Turn on a module in <a href={href.settings}>Settings</a>.
        </p>
      ) : (
        <>
          {stats.length > 0 && (
            <div className="today-stats" style={{ "--n": stats.length } as CSSProperties}>
              {stats.map((w) => (
                <w.component key={`${w.moduleId}:${w.id}`} />
              ))}
            </div>
          )}
          <div className={`today-columns${main.length && side.length ? "" : " is-single"}`}>
            {main.length > 0 && (
              <div className="today-col today-main">
                {main.map((w) => (
                  <WidgetCard key={`${w.moduleId}:${w.id}`} widget={w} />
                ))}
              </div>
            )}
            {side.length > 0 && (
              <div className="today-col today-side">
                {side.map((w) => (
                  <WidgetCard key={`${w.moduleId}:${w.id}`} widget={w} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function WidgetCard({ widget: w }: { widget: Placed }) {
  const titleId = `widget-${w.moduleId}-${w.id}`;
  return (
    <section className="card today-card" aria-labelledby={titleId}>
      <header className="today-card-head">
        <h2 className="card-title" id={titleId}>
          {w.title}
        </h2>
        {w.link && (
          <a className="today-card-link" href={w.link.href}>
            {w.link.label}
            <span aria-hidden> →</span>
          </a>
        )}
      </header>
      <w.component />
    </section>
  );
}

/** "Good morning" / "Good afternoon" / "Good evening". */
function greetingFor(hour: number): string {
  return hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}
