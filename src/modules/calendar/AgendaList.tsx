import { useCore } from "../../core";
import type { AgendaEntry } from "./agenda";
import { formatTime } from "./model";

/** One day's (or a few days') entries: events you can open, tasks you can tick off. */
export function AgendaList({
  entries,
  onOpen,
  showDay,
}: {
  entries: AgendaEntry[];
  onOpen?: (entry: AgendaEntry) => void;
  showDay?: (day: string) => string;
}) {
  const { store } = useCore();
  return (
    <ul className="agenda">
      {entries.map((e) => {
        if (e.kind === "other") {
          const done = e.item.status === "done";
          return (
            <li key={e.key} className={`agenda-row is-task${done ? " is-done" : ""}`}>
              <button
                className="check"
                role="checkbox"
                aria-checked={done}
                aria-label={done ? "Mark as not done" : "Mark as done"}
                onClick={() => (done ? store.reopen(e.item.id) : store.complete(e.item.id))}
              >
                {done ? "✓" : ""}
              </button>
              <span className="agenda-title">{e.item.title}</span>
              {showDay && <span className="agenda-time">{showDay(e.day)}</span>}
            </li>
          );
        }
        const time = e.start ? `${formatTime(e.start)}${e.end ? ` – ${formatTime(e.end)}` : ""}` : "All day";
        const content = (
          <>
            <span className="agenda-bar" aria-hidden />
            <span className="agenda-main">
              <span className="agenda-title">
                {e.item.title}
                {e.repeats && (
                  <span className="repeat-icon" title="Repeats" aria-label="repeats">
                    {" "}↻
                  </span>
                )}
              </span>
              {typeof e.item.data.location === "string" && (
                <span className="agenda-sub">{e.item.data.location}</span>
              )}
            </span>
            <span className="agenda-time">
              {showDay ? `${showDay(e.day)} · ` : ""}
              {time}
            </span>
          </>
        );
        return (
          <li key={e.key} className="agenda-row is-event">
            {onOpen ? (
              <button className="agenda-open" onClick={() => onOpen(e)}>
                {content}
              </button>
            ) : (
              <div className="agenda-open">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
