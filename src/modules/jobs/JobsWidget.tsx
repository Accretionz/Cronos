import { useState, type FormEvent } from "react";
import { formatDay, moduleHref, useCore, useItems, useToday } from "../../core";
import { usePointsOn } from "./components";
import { APPLY_POINTS, JOB, dueFollowUps, jobStats, readJob, withStatus, type JobApplication, type JobData } from "./model";
import "./jobs.css";

/** Today page card: log an application in two fields, see this week's count and follow-ups due. */
export function JobsWidget() {
  const { store } = useCore();
  const today = useToday();
  const pointsOn = usePointsOn();
  const apps = (useItems({ type: JOB }) as JobApplication[]).map((a) => ({ ...a, data: readJob(a.data) }));
  const stats = jobStats(apps, today);
  const due = dueFollowUps(apps, today);
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!role.trim() || !company.trim()) return;
    const data = withStatus({ company: company.trim(), status: "saved", history: [] }, "applied", today);
    await store.create<JobData>({ type: JOB, title: role.trim(), data });
    setRole("");
    setCompany("");
  };
  const followedUp = (a: JobApplication) => void store.update(a.id, { data: { ...a.data, followUpOn: undefined } });

  return (
    <div className="jobs-widget">
      <p className="jobs-widget-count">
        <strong>{stats.thisWeek}</strong> applied in the last 7 days
        {stats.interviewing > 0 && <span className="muted"> · {stats.interviewing} interviewing</span>}
      </p>
      <form className="jobs-quick" onSubmit={add} aria-label="Log an application">
        <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" aria-label="Role" />
        <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" aria-label="Company" />
        <button className="btn-primary" type="submit" disabled={!role.trim() || !company.trim()} title={pointsOn ? `Log it as applied today (+${APPLY_POINTS} GP)` : "Log it as applied today"}>
          Applied{pointsOn ? ` +${APPLY_POINTS}` : ""}
        </button>
      </form>
      {due.length > 0 && (
        <div className="jobs-due">
          <h3 className="jobs-sub">Follow up</h3>
          <ul>
            {due.slice(0, 4).map((a) => (
              <li key={a.id}>
                <span className="jobs-due-text">
                  <strong>{a.data.company}</strong> <span className="muted">· {a.title}</span>
                  {a.data.followUpOn! < today && <span className="jobs-due-late"> · since {formatDay(a.data.followUpOn!)}</span>}
                </span>
                <button type="button" className="link-btn jobs-due-done" onClick={() => followedUp(a)}>
                  Done
                </button>
              </li>
            ))}
          </ul>
          {due.length > 4 && (
            <a className="widget-link" href={moduleHref("jobs")}>
              {due.length - 4} more
            </a>
          )}
        </div>
      )}
    </div>
  );
}
