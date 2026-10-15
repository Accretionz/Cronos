/**
 * The one shared data shape. Every feature (tasks, habits, events, notes,
 * challenges...) stores its records as Items. Feature-specific fields go in `data`.
 */
export type ItemStatus = "open" | "done" | "skipped" | "archived";

export interface Item<TData extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  /** Which kind of thing this is, e.g. "task". Usually owned by one module. */
  type: string;
  title: string;
  status: ItemStatus;
  /** Local date "YYYY-MM-DD" or full ISO date-time. */
  scheduledFor?: string;
  /** Recurrence rule, e.g. "RRULE:FREQ=DAILY". Stored now, interpreted by later modules. */
  recurrence?: string;
  tags: string[];
  data: TData;
  createdAt: string;
  updatedAt: string;
  /** Set when status becomes "done". Useful for stats, streaks and XP. */
  completedAt?: string;
}

/** What you pass in to create an item. The store fills in id, timestamps and defaults. */
export type NewItem<TData extends Record<string, unknown> = Record<string, unknown>> = {
  type: string;
  title: string;
  status?: ItemStatus;
  scheduledFor?: string;
  recurrence?: string;
  tags?: string[];
  data?: TData;
};

/** Fields that can be changed after creation. */
export type ItemPatch = Partial<
  Pick<Item, "title" | "status" | "scheduledFor" | "recurrence" | "tags" | "data">
>;
