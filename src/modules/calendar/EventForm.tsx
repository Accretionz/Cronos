import { useState, type FormEvent } from "react";
import { dayOf, useCore } from "../../core";
import {
  EVENT,
  REPEAT_LABELS,
  fromRecurrence,
  toRecurrence,
  toScheduled,
  type CalendarEvent,
  type EventData,
  type Repeat,
} from "./model";

interface Props {
  /** Event to edit. Omit to create a new one. */
  event?: CalendarEvent;
  defaultDay: string;
  onDone: () => void;
}

export function EventForm({ event, defaultDay, onDone }: Props) {
  const { store } = useCore();
  const [title, setTitle] = useState(event?.title ?? "");
  const [day, setDay] = useState(event?.scheduledFor ? dayOf(event.scheduledFor) : defaultDay);
  const [start, setStart] = useState(event?.data.start ?? "");
  const [end, setEnd] = useState(event?.data.end ?? "");
  const [repeat, setRepeat] = useState<Repeat>(fromRecurrence(event?.recurrence));
  const [location, setLocation] = useState(event?.data.location ?? "");

  const endBeforeStart = Boolean(start && end && end <= start);
  const canSave = title.trim() !== "" && day !== "" && !endBeforeStart;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    const data: EventData = {
      start: start || undefined,
      end: start && end ? end : undefined,
      location: location.trim() || undefined,
    };
    const fields = {
      title: title.trim(),
      scheduledFor: toScheduled(day, data.start),
      recurrence: toRecurrence(repeat),
      data,
    };
    if (event) await store.update(event.id, fields);
    else await store.create<EventData>({ type: EVENT, ...fields });
    onDone();
  };

  const remove = async () => {
    if (event) await store.remove(event.id);
    onDone();
  };

  return (
    <form className="event-form" onSubmit={submit}>
      <input
        className="event-title-input"
        placeholder="Event title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Event title"
        autoFocus
      />
      <label className="field">
        <span>Date</span>
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Start</span>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span>End</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={!start} />
        </label>
      </div>
      {!start && <p className="hint">No start time means an all-day event.</p>}
      {endBeforeStart && <p className="hint hint-error">End time must be after the start.</p>}
      <label className="field">
        <span>Repeat</span>
        <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
          {(Object.keys(REPEAT_LABELS) as Repeat[]).map((r) => (
            <option key={r} value={r}>
              {REPEAT_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Location</span>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
      </label>
      {event && fromRecurrence(event.recurrence) !== "none" && (
        <p className="hint">Changes apply to every occurrence.</p>
      )}
      <div className="form-actions">
        {event && (
          <button type="button" className="btn-danger" onClick={remove}>
            Delete
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={!canSave}>
          {event ? "Save" : "Add event"}
        </button>
      </div>
    </form>
  );
}
