import type { AppModule } from "../../core";
import { TASK } from "./model";
import { TasksPage } from "./TasksPage";
import { TodayTasksWidget } from "./TodayWidget";

export const tasksModule: AppModule = {
  id: "tasks",
  name: "Tasks",
  icon: "☑",
  description: "To-dos with dates and priorities.",
  itemTypes: [TASK],
  page: TasksPage,
  widgets: [{ id: "today-tasks", title: "Today's tasks", component: TodayTasksWidget, order: 10 }],
};
