import { useState } from "react";
import { useCore } from "../../core";
import { saveJobSettings, useJobSettings, type JobSettings } from "./settings";
import "./jobs.css";

/** Settings → Jobs: what extra information shows under each application on the Jobs page. */
export function JobsSettings() {
  const { store } = useCore();
  const saved = useJobSettings();
  // Show a change the moment it's clicked, while it's being saved.
  const [pending, setPending] = useState<Partial<JobSettings>>({});
  const s = { ...saved, ...pending };
  const set = (patch: Partial<JobSettings>) => {
    setPending((p) => ({ ...p, ...patch }));
    void saveJobSettings(store, patch).finally(() =>
      setPending((p) => {
        const next = { ...p };
        (Object.keys(patch) as (keyof JobSettings)[]).forEach((k) => {
          if (next[k] === patch[k]) delete next[k];
        });
        return next;
      }),
    );
  };
  const parts: { key: keyof JobSettings; label: string; hint: string }[] = [
    { key: "showNotes", label: "Notes", hint: "What you wrote about the job" },
    { key: "showLink", label: "Job posting link", hint: "Opens the posting in a new tab" },
    { key: "showTimeline", label: "Timeline", hint: "Each status change and its date" },
  ];

  return (
    <div className="card jobs-settings">
      <div className="jobs-settings-row">
        <div>
          <strong>Show details on the Jobs page</strong>
          <p className="muted">
            Shows extra information with each application. When it's off, applications with notes show a Notes label you can open.
          </p>
        </div>
        <label className="switch">
          <input type="checkbox" checked={s.showDetails} onChange={(e) => set({ showDetails: e.target.checked })} aria-label="Show details on the Jobs page" />
          <span className="switch-track" />
        </label>
      </div>
      <fieldset className="jobs-settings-parts" disabled={!s.showDetails}>
        <legend className="muted">Include</legend>
        {parts.map((p) => (
          <label key={p.key} className="jobs-settings-part">
            <input type="checkbox" checked={s[p.key]} onChange={(e) => set({ [p.key]: e.target.checked })} />
            <span>
              {p.label}
              <span className="muted"> · {p.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
