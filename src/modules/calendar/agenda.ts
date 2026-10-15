import { useMemo } from "react";
import { addDays, dayOf, useItems, type Item } from "../../core";
import { ALSO_SHOWN, EVENT, fromRecurrence, occurrences, type CalendarEvent } from "./model";

export interface AgendaEntry {
  /** Unique per occurrence: an item repeating weekly appears once per week. */
  key: string;
  day: string;
  kind: "event" | "other";
  item: Item;
  start?: string;
  end?: string;
  repeats: boolean;
}

const rank = (e: AgendaEntry) => (e.kind === "event" ? (e.start ? 1 : 0) : 2);

function compare(a: AgendaEntry, b: AgendaEntry) {
  return rank(a) - rank(b) || (a.start ?? "").localeCompare(b.start ?? "") || a.item.title.localeCompare(b.item.title);
}

/** Everything on the calendar between two days (inclusive), grouped by day and sorted. */
export function useAgenda(from: string, to: string): Map<string, AgendaEntry[]> {
  const events = useItems({ type: EVENT });
  // Other modules' dated items (e.g. tasks) in range, matched only by type name.
  const others = useItems({ type: ALSO_SHOWN, after: addDays(from, -1), before: addDays(to, 1) });

  return useMemo(() => {
    const byDay = new Map<string, AgendaEntry[]>();
    const add = (e: AgendaEntry) => {
      const list = byDay.get(e.day);
      if (list) list.push(e);
      else byDay.set(e.day, [e]);
    };
    for (const item of events as CalendarEvent[]) {
      for (const day of occurrences(item, from, to)) {
        add({
          key: `${item.id}:${day}`,
          day,
          kind: "event",
          item,
          start: item.data.start,
          end: item.data.end,
          repeats: fromRecurrence(item.recurrence) !== "none",
        });
      }
    }
    for (const item of others) {
      const day = dayOf(item.scheduledFor!);
      add({ key: item.id, day, kind: "other", item, repeats: false });
    }
    byDay.forEach((list) => list.sort(compare));
    return byDay;
  }, [events, others, from, to]);
}

