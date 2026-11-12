import { useEffect, useMemo, useRef, useState } from "react";
import { useCore, useItems, useToday } from "../../core";
import { Modal, StatTile } from "../../ui";
import { ApplicationForm, ApplicationRow } from "./components";
import { JOB, jobStats, matchesFilter, matchesSearch, readJob, sortApps, type JobApplication, type JobFilter } from "./model";
import { useJobSettings } from "./settings";
import "./jobs.css";

const FILTERS: { id: JobFilter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "saved", label: "Saved" },
  { id: "applied", label: "Applied" },
  { id: "interviewing", label: "Interviewing" },
  { id: "offer", label: "Offers" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
];

const UNDO_MS = 6000;

export function JobsPage() {
  const { store } = useCore();
  const today = useToday();
  const raw = useItems({ type: JOB }) as JobApplication[];
  // Records from another device or an older version get their missing fields filled in.
  const apps = useMemo(() => raw.map((a) => ({ ...a, data: readJob(a.data) })), [raw]);
  const stats = jobStats(apps, today);
  const [filter, setFilter] = useState<JobFilter>("active");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<JobApplication | "new" | null>(null);
  const [deleted, setDeleted] = useState<JobApplication | null>(null);
  const settings = useJobSettings();

  const undoTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const shown = sortApps(apps.filter((a) => matchesFilter(a.data, filter) && matchesSearch(a, query)));
  const countFor = (f: JobFilter) => apps.filter((a) => matchesFilter(a.data, f)).length;

  const remove = async (a: JobApplication) => {
    await store.remove(a.id);
    setDeleted(a);
    clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setDeleted(null), UNDO_MS);
  };
  const undo = async () => {
    if (!deleted) return;
    clearTimeout(undoTimer.current);
    await store.restore(deleted);
    setDeleted(null);
  };

  return (
    <div className="page page-wide jobs-page">
      <header className="page-header header-row">
        <div>
          <h1>Job applications</h1>
          <p className="muted jobs-intro">Keep every application in one place. Each one you send earns Gacha Points.</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing("new")}>
          + Add application
        </button>
      </header>

      <div className="jobs-stats">
        <StatTile label="Applied" icon="✉" value={stats.applied} detail={stats.thisWeek ? `+${stats.thisWeek} in the last 7 days` : "None in the last 7 days"} />
        <StatTile label="Interviewing" value={stats.interviewing} detail={stats.interviewing === 1 ? "1 in progress" : `${stats.interviewing} in progress`} />
        <StatTile label="Offers" value={stats.offers} tone={stats.offers ? "accent" : undefined} detail={stats.offers ? "Congratulations!" : "Keep going"} />
        <StatTile
          label="Response rate"
          value={stats.applied ? Math.round(stats.responseRate * 100) : "–"}
          unit={stats.applied ? "%" : undefined}
          detail="Applications that led to an interview"
        />
      </div>

      <section className="card jobs-card">
        <div className="jobs-toolbar">
          <div className="jobs-filters" role="tablist" aria-label="Show">
            {FILTERS.map((f) => {
              const n = countFor(f.id);
              return (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={filter === f.id}
                  className={`jobs-filter${filter === f.id ? " is-active" : ""}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  <span className="jobs-filter-n">{n}</span>
                </button>
              );
            })}
          </div>
          <label className="jobs-search">
            <svg className="jobs-search-icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden>
              <circle cx="8.5" cy="8.5" r="5.75" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M13 13l4.25 4.25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search applications" />
          </label>
        </div>

        {deleted && (
          <div className="undo-bar" role="status">
            <span>
              Deleted <strong>{deleted.title}</strong>
            </span>
            <button className="link-btn" onClick={undo}>
              Undo
            </button>
          </div>
        )}

        {apps.length === 0 ? (
          <div className="jobs-empty">
            <p>
              <strong>No applications yet.</strong>
            </p>
            <p className="muted">Add the jobs you've applied to (or want to). You'll see where each one stands, when to follow up, and how your search is going.</p>
            <button className="btn-primary" onClick={() => setEditing("new")}>
              Add your first application
            </button>
          </div>
        ) : shown.length === 0 ? (
          <p className="muted jobs-none">{query.trim() ? "Nothing matches your search." : "Nothing here right now."}</p>
        ) : (
          <ul className="job-list">
            {shown.map((a) => (
              <ApplicationRow
                key={a.id}
                app={a}
                settings={settings}
                onEdit={() => setEditing(a)}
                onDelete={() => void remove(a)}
              />
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <Modal title={editing === "new" ? "Add an application" : `Edit ${editing.title}`} onClose={() => setEditing(null)}>
          <ApplicationForm app={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}

