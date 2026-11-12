import { addDays, formatDay, useToday } from "../../core";
import { useAgenda } from "./agenda";
import { AgendaList } from "./AgendaList";
import "./calendar.css";

const LOOKAHEAD_DAYS = 7;
const MAX_UPCOMING = 4;

/** Dashboard tile: today's events, then the next few in the coming week. */
export function ScheduleWidget() {
  const today = useToday();
  const agenda = useAgenda(today, addDays(today, LOOKAHEAD_DAYS));

  const todays = (agenda.get(today) ?? []).filter((e) => e.kind === "event");
  const upcoming = [...agenda.entries()]
    .filter(([day]) => day > today)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([, list]) => list.filter((e) => e.kind === "event"))
    .slice(0, MAX_UPCOMING);

  return (
    <div className="schedule">
      {todays.length === 0 ? (
        <p className="muted widget-empty">Nothing scheduled today.</p>
      ) : (
        <AgendaList entries={todays} />
      )}
      {upcoming.length > 0 && (
        <>
          <h3 className="schedule-sub">Coming up</h3>
          <AgendaList entries={upcoming} showDay={formatDay} />
        </>
      )}
    </div>
  );
}
