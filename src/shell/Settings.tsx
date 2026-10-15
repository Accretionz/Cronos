import { useCore, useModules } from "../core";
import { resetNavOrder, useNavOrder } from "./navOrder";

export function Settings() {
  const { registry } = useCore();
  const enabled = useModules(); // also re-renders when modules are switched on or off
  const navOrder = useNavOrder();

  return (
    <div className="page">
      <header className="page-header">
        <h1>Settings</h1>
        <p className="muted">Choose which modules appear in your app.</p>
      </header>
      <ul className="module-list">
        {registry.all().map((m) => {
          const on = registry.isEnabled(m.id);
          return (
            <li key={m.id} className="card module-row">
              <span className="module-icon" aria-hidden>
                {m.icon ?? "•"}
              </span>
              <div className="module-text">
                <strong>{m.name}</strong>
                {m.description && <span className="muted">{m.description}</span>}
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={m.required}
                  onChange={(e) => registry.setEnabled(m.id, e.target.checked)}
                  aria-label={`Enable ${m.name}`}
                />
                <span className="switch-track" />
              </label>
            </li>
          );
        })}
      </ul>

      {enabled
        .filter((m) => m.settings)
        .map((m) => {
          const ModuleSettings = m.settings!;
          return (
            <section key={m.id} className="section" aria-labelledby={`settings-${m.id}`}>
              <h2 className="section-title" id={`settings-${m.id}`}>
                <span aria-hidden>{m.icon}</span> {m.name}
              </h2>
              <ModuleSettings />
            </section>
          );
        })}

      <section className="section">
        <h2 className="section-title">Sidebar order</h2>
        <div className="card settings-row">
          <p className="muted">
            Drag items in the sidebar to reorder them (Today always stays first). On a phone, press and hold an
            item in the bottom bar, then drag. With a keyboard, focus an item and press Alt + ↑ / ↓. Press Esc
            while dragging to cancel.
          </p>
          <button className="btn-ghost" onClick={resetNavOrder} disabled={navOrder.length === 0}>
            Reset to default order
          </button>
        </div>
      </section>
    </div>
  );
}
