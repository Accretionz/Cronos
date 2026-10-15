import { useModules } from "../core";
import { href } from "./router";

export function Dashboard() {
  const modules = useModules();
  const widgets = modules
    .flatMap((m) => (m.widgets ?? []).map((w) => ({ ...w, moduleId: m.id })))
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

  const date = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="page">
      <header className="page-header">
        <p className="eyebrow">{date}</p>
        <h1>Today</h1>
      </header>
      {widgets.length === 0 ? (
        <p className="muted empty-state">
          No widgets yet. Turn on a module in <a href={href.settings}>Settings</a>.
        </p>
      ) : (
        <div className="widget-grid">
          {widgets.map((w) => (
            <section key={`${w.moduleId}:${w.id}`} className="card">
              <h2 className="card-title">{w.title}</h2>
              <w.component />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
