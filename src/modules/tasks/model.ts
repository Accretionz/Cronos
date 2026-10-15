import type { Item } from "../../core";

export const TASK = "task";

export type Priority = "low" | "normal" | "high";

export type TaskData = {
  priority?: Priority;
  notes?: string;
};

export type Task = Item<TaskData>;
