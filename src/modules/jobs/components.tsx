import { useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { addDays, formatDay, useCore, useModules, useToday } from "../../core";
import { RowMenu, Select, type SelectOption } from "../../ui";
import type { JobSettings } from "./settings";
import {
  APPLY_POINTS,
  CLOSED,
  JOB,
  SOURCES,
  STATUSES,
  STATUS_LABEL,
  cleanUrl,
  daysAgo,
  isSubmitted,
  readJob,
  withStatus,
  type JobApplication,
  type JobData,
  type JobStatus,
} from "./model";

/** True when the Summon module (which spends Gacha Points) is on, so GP hints make sense. */
export function usePointsOn(): boolean {
  return useModules().some((m) => m.id === "summon");
}

/* ---------- Status ---------- */

const STATUS_OPTIONS: SelectOption<JobStatus>[] = STATUSES.map((s) => ({
  value: s,
  label: STATUS_LABEL[s],
  color: `var(--job-${s})`,
  divider: s === "rejected",
}));

export function StatusPill({ status }: { status: JobStatus }) {
  return <span className={`job-status is-${status}`}>{STATUS_LABEL[status]}</span>;
}

/** The status as a dropdown that looks like its pill; changing it records the move. */
export function StatusSelect({ app }: { app: JobApplication }) {
  const { store } = useCore();
  const today = useToday();
  const d = readJob(app.data);
  return (
    <Select<JobStatus>
      className={`job-status-select is-${d.status}`}
      size="sm"
      label={`Status of ${app.title}`}
      value={d.status}
      onChange={(status) => void store.update(app.id, { data: withStatus(d, status, today) })}
      options={STATUS_OPTIONS}
      renderValue={(o) => <span className="ui-select-text">{o?.label}</span>}
    />
  );
}

/* ---------- One application in the list ---------- */

export function ApplicationRow({
  app,
  onEdit,
  onDelete,
  settings,
}: {
  app: JobApplication;
  onEdit: () => void;
  onDelete: () => void;
  /** What extra information to show (Settings → Jobs). */
  settings: JobSettings;
}) {
  const { store } = useCore();
  const today = useToday();
  const d = readJob(app.data);
  const url = cleanUrl(d.url);
  const followDue = d.followUpOn && d.followUpOn <= today && !CLOSED.includes(d.status) && d.status !== "offer";
  const on = settings.showDetails;
  const showNotes = on && settings.showNotes && Boolean(d.notes);
  const showLink = on && settings.showLink && Boolean(url);
  const showTimeline = on && settings.showTimeline && d.history.length > 1;
  const meta = [
    d.appliedOn ? `Applied ${daysAgo(d.appliedOn, today)}` : "Not applied yet",
    d.location,
    d.source,
    d.salary,
  ].filter(Boolean) as string[];

  return (
    <li className={`job-row${CLOSED.includes(d.status) ? " is-closed" : ""}`}>
      <span className="job-avatar" aria-hidden>
        {(d.company || app.title || "?").trim().charAt(0).toUpperCase()}
      </span>
      <div className="job-main">
        <button type="button" className="job-title" onClick={onEdit} title="Edit">
          <strong>{app.title}</strong>
          {d.company && <span className="job-company"> · {d.company}</span>}
        </button>
        <div className="job-meta">
          {meta.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
          {followDue && (
            <span className="job-followup">
              <span aria-hidden>⏰ </span>Follow up {d.followUpOn === today ? "today" : `(was ${formatDay(d.followUpOn!)})`}
            </span>
          )}
          {!followDue && d.followUpOn && !CLOSED.includes(d.status) && d.followUpOn > today && <span>Follow up {formatDay(d.followUpOn)}</span>}
          {showLink && (
            <a href={url!} target="_blank" rel="noopener noreferrer" className="job-link" title="Open the job posting in a new tab">
              {new URL(url!).hostname.replace(/^www\./, "")}
              <span aria-hidden> ↗</span>
            </a>
          )}
          {d.notes && !showNotes && (
            <button type="button" className="job-has-notes" onClick={onEdit} title="Has notes: open to read them">
              <NoteIcon /> Notes
            </button>
          )}
        </div>
        {showNotes && <JobNotes text={d.notes!} />}
        {showTimeline && <Timeline history={d.history} />}
      </div>
      <div className="job-actions">
        <StatusSelect app={app} />
        <RowMenu
          label={`Options for ${app.title}`}
          actions={[
            { label: "Edit", icon: "✎", onSelect: onEdit },
            ...(url ? [{ label: "Open job posting", icon: "↗", onSelect: () => window.open(url, "_blank", "noopener,noreferrer") }] : []),
            ...(followDue ? [{ label: "Followed up", icon: "✓", onSelect: () => void store.update(app.id, { data: { ...d, followUpOn: undefined } }) }] : []),
            { label: "Delete", icon: "🗑", danger: true, onSelect: onDelete },
          ]}
        />
      </div>
    </li>
  );
}

function NoteIcon() {
  return (
    <svg className="job-note-icon" viewBox="0 0 16 16" width="13" height="13" aria-hidden>
      <path d="M3 2.5h7l3 3v8H3z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M5.5 7.5h5M5.5 10h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

const CLAMP_LINES = 3;

/** The notes, in the row's own column. Long notes show three lines with "Show more". */
function JobNotes({ text }: { text: string }) {
  const box = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (el && !open) setLong(el.scrollHeight > el.clientHeight + 1);
  }, [text, open]);
  return (
    <div className="job-notes">
      <NoteIcon />
      <div className="job-notes-body">
        <p ref={box} className={`job-notes-text${open ? "" : " is-clamped"}`} style={{ "--lines": CLAMP_LINES } as CSSProperties}>
          <Linkified text={text} />
        </p>
        {(long || open) && (
          <button type="button" className="link-btn job-notes-more" onClick={() => setOpen((o) => !o)}>
            {open ? "Show less" : "Show more"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Status changes on one line: Applied Oct 20 → Interviewing Oct 28. */
function Timeline({ history }: { history: JobData["history"] }) {
  return (
    <ol className="job-timeline" aria-label="Timeline">
      {history.map((h, i) => (
        <li key={i}>
          <span className={`job-history-dot is-${h.status}`} aria-hidden />
          {STATUS_LABEL[h.status]} <span className="muted">{formatDay(h.day)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Text with web addresses turned into links (notes often hold a recruiter's or company's link). */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="job-link">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

/* ---------- Add / edit ---------- */

/**
 * The form for a new application (status defaults to Applied, today) or for editing one.
 * Calls onDone with the saved application, or nothing when cancelled.
 */
export function ApplicationForm({ app, onDone }: { app?: JobApplication; onDone: (saved?: JobApplication) => void }) {
  const { store } = useCore();
  const today = useToday();
  const pointsOn = usePointsOn();
  const start = app ? readJob(app.data) : null;
  const [role, setRole] = useState(app?.title ?? "");
  const [company, setCompany] = useState(start?.company ?? "");
  const [status, setStatus] = useState<JobStatus>(start?.status ?? "applied");
  const [appliedOn, setAppliedOn] = useState(start?.appliedOn ?? today);
  const [location, setLocation] = useState(start?.location ?? "");
  const [url, setUrl] = useState(start?.url ?? "");
  const [salary, setSalary] = useState(start?.salary ?? "");
  const [source, setSource] = useState(start?.source ?? "");
  const [followUpOn, setFollowUpOn] = useState(start?.followUpOn ?? "");
  const [notes, setNotes] = useState(start?.notes ?? "");
  const [more, setMore] = useState(Boolean(start && (start.location || start.url || start.salary || start.source || start.followUpOn || start.notes)));
  const [tried, setTried] = useState(false);

  const urlOk = !url.trim() || cleanUrl(url) !== null;
  const missing = !role.trim() || !company.trim();
  const sent = status !== "saved";
  const earns = pointsOn && sent && !(start && isSubmitted(start));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (missing || !urlOk) return;
    const when = sent ? appliedOn || today : today;
    let data: JobData = start
      ? withStatus(start, status, today)
      : { company: "", status, history: [{ status, day: when }] }; // a new one's timeline starts the day it was sent
    data = {
      ...data,
      company: company.trim(),
      appliedOn: sent ? when : undefined,
      location: location.trim() || undefined,
      url: url.trim() || undefined,
      salary: salary.trim() || undefined,
      source: source || undefined,
      followUpOn: followUpOn || undefined,
      notes: notes.trim() || undefined,
    };
    const saved = app
      ? ((await store.update(app.id, { title: role.trim(), data })) as JobApplication)
      : ((await store.create<JobData>({ type: JOB, title: role.trim(), data })) as JobApplication);
    onDone(saved);
  };

  return (
    <form className="job-form" onSubmit={submit} noValidate>
      <h2 className="job-form-title">{app ? "Edit application" : "Add an application"}</h2>
      <div className="field-row">
        <label className="field">
          <span>Role</span>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Frontend Engineer"
            autoFocus={!app}
            aria-invalid={tried && !role.trim()}
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>Company</span>
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Acme" aria-invalid={tried && !company.trim()} autoComplete="organization" />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Status</span>
          <Select<JobStatus> value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        </label>
        {sent && (
          <label className="field">
            <span>Applied on</span>
            <input type="date" value={appliedOn} max={today} onChange={(e) => setAppliedOn(e.target.value)} />
          </label>
        )}
      </div>
      {tried && missing && <p className="hint hint-error">Add the role and the company.</p>}
      {earns && (
        <p className="hint job-points-hint">
          <span aria-hidden>◈</span> Submitting an application earns +{APPLY_POINTS} GP
        </p>
      )}
      {status === "saved" && (
        <p className="hint">Saved jobs are ones you plan to apply to. Change the status when you send it{pointsOn ? ` (+${APPLY_POINTS} GP)` : ""}.</p>
      )}

      {!more ? (
        <button type="button" className="link-btn job-more" onClick={() => setMore(true)}>
          + Link, location, salary, follow-up, notes
        </button>
      ) : (
        <>
          <label className="field">
            <span>Job posting link</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" aria-invalid={!urlOk} autoComplete="off" />
          </label>
          {!urlOk && <p className="hint hint-error">That doesn't look like a web address.</p>}
          <div className="field-row">
            <label className="field">
              <span>Location</span>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Remote, city…" />
            </label>
            <label className="field">
              <span>Salary</span>
              <input value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="e.g. $120k–140k" />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Found on</span>
              <Select
                value={source}
                onChange={setSource}
                options={[{ value: "", label: "Not set" }, ...[...new Set([...SOURCES, ...(source ? [source] : [])])].map((x) => ({ value: x, label: x }))]}
              />
            </label>
            <label className="field">
              <span>Follow up on</span>
              <input type="date" value={followUpOn} onChange={(e) => setFollowUpOn(e.target.value)} />
            </label>
          </div>
          <div className="job-quick-dates">
            <span className="muted">Follow up in</span>
            {[3, 7, 14].map((n) => (
              <button key={n} type="button" className="job-chip" onClick={() => setFollowUpOn(addDays(sent ? appliedOn || today : today, n))}>
                {n === 7 ? "1 week" : n === 14 ? "2 weeks" : `${n} days`}
              </button>
            ))}
          </div>
          <label className="field">
            <span>Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Contacts, interview prep, anything to remember" />
          </label>
        </>
      )}

      {start && start.history.length > 0 && <History history={start.history} />}

      <div className="form-actions">
        <span className="spacer" />
        <button type="button" className="btn-ghost" onClick={() => onDone()}>
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          {app ? "Save" : sent ? "Add application" : "Save for later"}
        </button>
      </div>
    </form>
  );
}

function History({ history }: { history: JobData["history"] }) {
  return (
    <div className="job-history">
      <h3 className="results-title">Timeline</h3>
      <ol>
        {history.map((h, i) => (
          <li key={i}>
            <span className={`job-history-dot is-${h.status}`} aria-hidden />
            <span>{STATUS_LABEL[h.status]}</span>
            <span className="muted">{formatDay(h.day)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
