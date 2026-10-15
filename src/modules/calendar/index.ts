import type { AppModule } from "../../core";
import { CalendarPage } from "./CalendarPage";
import { EVENT } from "./model";
import { ScheduleWidget } from "./ScheduleWidget";

export const calendarModule: AppModule = {
  id: "calendar",
  name: "Calendar",
  icon: "▦",
  description: "Month view with events, repeating events, and your dated tasks.",
  itemTypes: [EVENT],
  page: CalendarPage,
  widgets: [{ id: "schedule", title: "Schedule", component: ScheduleWidget, order: 15 }],
};
