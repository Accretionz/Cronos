import type { EventBus } from "./bus";
import { dayOf } from "./date";
import type { StorageAdapter } from "./storage";
import type { Item, ItemPatch, ItemStatus, NewItem } from "./types";

export interface ItemQuery {
  type?: string | string[];
  status?: ItemStatus | ItemStatus[];
  /** Scheduled on this day ("YYYY-MM-DD"). */
  on?: string;
  /** Scheduled strictly before this day. */
  before?: string;
  /** Scheduled strictly after this day. */
  after?: string;
  /** true = only items with a date, false = only items without one. */
  scheduled?: boolean;
  tag?: string;
  /** Completed on this day. */
  completedOn?: string;
}

const asArray = <T,>(v: T | T[] | undefined) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function matches(item: Item, q: ItemQuery): boolean {
  const types = asArray(q.type);
  if (types && !types.includes(item.type)) return false;
  const statuses = asArray(q.status);
  if (statuses && !statuses.includes(item.status)) return false;
  if (q.tag && !item.tags.includes(q.tag)) return false;
  if (q.scheduled !== undefined && q.scheduled !== Boolean(item.scheduledFor)) return false;
  if (q.on || q.before || q.after) {
    if (!item.scheduledFor) return false;
    const day = dayOf(item.scheduledFor);
    if (q.on && day !== q.on) return false;
    if (q.before && !(day < q.before)) return false;
    if (q.after && !(day > q.after)) return false;
  }
  if (q.completedOn && (!item.completedAt || dayOf(item.completedAt) !== q.completedOn)) return false;
  return true;
}

/**
 * The single source of truth for items. Keeps an in-memory copy for fast,
 * synchronous queries, writes through to the storage adapter, and announces
 * every change on the event bus.
 */
export class ItemStore {
  private items = new Map<string, Item>();
  private listeners = new Set<() => void>();
  /** Increases on every change. UI hooks use it to know when to re-query. */
  version = 0;

  constructor(private adapter: StorageAdapter, private bus: EventBus) {}

  async init(): Promise<void> {
    const all = await this.adapter.loadAll();
    this.items = new Map(all.map((i) => [i.id, i]));
    this.changed();
  }

  get(id: string): Item | undefined {
    return this.items.get(id);
  }

  /** Find items. Sorted by scheduled date (undated last), then creation time. */
  query(q: ItemQuery = {}): Item[] {
    return [...this.items.values()]
      .filter((i) => matches(i, q))
      .sort((a, b) => {
        const da = a.scheduledFor ?? "￿";
        const db = b.scheduledFor ?? "￿";
        if (da !== db) return da < db ? -1 : 1;
        return a.createdAt < b.createdAt ? -1 : 1;
      });
  }

  async create<T extends Record<string, unknown>>(input: NewItem<T>): Promise<Item<T>> {
    const now = new Date().toISOString();
    const item: Item<T> = {
      id: newId(),
      type: input.type,
      title: input.title.trim(),
      status: input.status ?? "open",
      scheduledFor: input.scheduledFor || undefined,
      recurrence: input.recurrence,
      tags: input.tags ?? [],
      data: (input.data ?? {}) as T,
      createdAt: now,
      updatedAt: now,
      completedAt: input.status === "done" ? now : undefined,
    };
    await this.adapter.put(item);
    this.items.set(item.id, item);
    this.changed();
    this.bus.emit("item.created", { item });
    return item;
  }

  async update(id: string, patch: ItemPatch): Promise<Item> {
    const previous = this.items.get(id);
    if (!previous) throw new Error(`Item ${id} not found`);
    const now = new Date().toISOString();
    const item: Item = { ...previous, ...patch, updatedAt: now };
    if (patch.status && patch.status !== previous.status) {
      item.completedAt = patch.status === "done" ? now : undefined;
    }
    await this.adapter.put(item);
    this.items.set(id, item);
    this.changed();

    this.bus.emit("item.updated", { item, previous });
    if (item.status === "done" && previous.status !== "done") this.bus.emit("item.completed", { item });
    if (previous.status === "done" && item.status !== "done") this.bus.emit("item.reopened", { item });
    return item;
  }

  complete(id: string) {
    return this.update(id, { status: "done" });
  }

  reopen(id: string) {
    return this.update(id, { status: "open" });
  }

  async remove(id: string): Promise<void> {
    const item = this.items.get(id);
    if (!item) return;
    await this.adapter.delete(id);
    this.items.delete(id);
    this.changed();
    this.bus.emit("item.deleted", { item });
  }

  /** Put back an item exactly as it was (same id and timestamps), e.g. to undo a delete. */
  async restore(item: Item): Promise<Item> {
    if (this.items.has(item.id)) return this.items.get(item.id)!;
    await this.adapter.put(item);
    this.items.set(item.id, item);
    this.changed();
    this.bus.emit("item.created", { item });
    return item;
  }

  /** Get notified after any change. Returns an unsubscribe function. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private changed() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }
}
