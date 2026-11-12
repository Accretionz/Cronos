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

/** A saved change to the data. A "reload" (backup restored) lists what was there before. */
export type StoreChange =
  | { kind: "put"; item: Item }
  | { kind: "delete"; id: string; type?: string }
  | { kind: "reload"; previousIds?: string[] };

const asArray = <T,>(v: T | T[] | undefined) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);
const STATUSES: ItemStatus[] = ["open", "done", "skipped", "archived"];

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Make a stored item safe to use: fill in missing fields with defaults.
 * Returns null for something that isn't an item at all (no id or type).
 */
export function normalizeItem(raw: unknown): Item | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id || typeof r.type !== "string" || !r.type) return null;
  const now = new Date().toISOString();
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return {
    id: r.id,
    type: r.type,
    title: typeof r.title === "string" ? r.title : "",
    status: STATUSES.includes(r.status as ItemStatus) ? (r.status as ItemStatus) : "open",
    scheduledFor: str(r.scheduledFor),
    recurrence: str(r.recurrence),
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [],
    data: r.data && typeof r.data === "object" && !Array.isArray(r.data) ? (r.data as Record<string, unknown>) : {},
    createdAt: str(r.createdAt) ?? now,
    updatedAt: str(r.updatedAt) ?? str(r.createdAt) ?? now,
    completedAt: str(r.completedAt),
  };
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

const byDateThenCreated = (a: Item, b: Item) => {
  const da = a.scheduledFor ?? "￿";
  const db = b.scheduledFor ?? "￿";
  if (da !== db) return da < db ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // same instant: still a stable order
};

/**
 * The single source of truth for items. Keeps an in-memory copy (indexed by type)
 * for fast, synchronous queries, writes through to the storage adapter, and
 * announces every change on the event bus.
 */
export class ItemStore {
  private items = new Map<string, Item>();
  /** type -> items of that type, so queries by type don't scan everything. */
  private byType = new Map<string, Map<string, Item>>();
  private listeners = new Set<() => void>();
  private changeListeners = new Set<(change: StoreChange) => void>();
  /** Increases on every change. UI hooks use it to know when to re-query. */
  version = 0;

  constructor(private adapter: StorageAdapter, private bus: EventBus) {}

  get storageKind() {
    return this.adapter.kind;
  }

  async init(): Promise<void> {
    const raw = await this.adapter.loadAll();
    this.load(raw);
  }

  /** Re-read everything from storage. */
  async reload(): Promise<void> {
    await this.init();
  }

  private load(raw: unknown[]) {
    this.items.clear();
    this.byType.clear();
    let skipped = 0;
    for (const r of raw) {
      const item = normalizeItem(r);
      if (item) this.index(item);
      else skipped++;
    }
    if (skipped) console.warn(`[store] skipped ${skipped} unreadable item(s)`);
    this.changed();
  }

  private index(item: Item) {
    const old = this.items.get(item.id);
    if (old && old.type !== item.type) this.byType.get(old.type)?.delete(item.id);
    this.items.set(item.id, item);
    let bucket = this.byType.get(item.type);
    if (!bucket) this.byType.set(item.type, (bucket = new Map()));
    bucket.set(item.id, item);
  }

  private unindex(id: string) {
    const item = this.items.get(id);
    if (!item) return;
    this.items.delete(id);
    this.byType.get(item.type)?.delete(id);
  }

  get(id: string): Item | undefined {
    return this.items.get(id);
  }

  /** Every item, unsorted. */
  all(): Item[] {
    return [...this.items.values()];
  }

  get size(): number {
    return this.items.size;
  }

  /** Find items. Sorted by scheduled date (undated last), then creation time. */
  query(q: ItemQuery = {}): Item[] {
    const types = asArray(q.type);
    const pool = types
      ? types.flatMap((t) => [...(this.byType.get(t)?.values() ?? [])])
      : [...this.items.values()];
    return pool.filter((i) => matches(i, q)).sort(byDateThenCreated);
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
    await this.persist(item);
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
    await this.persist(item);

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
    // Gone from the screen at once; put back if saving fails.
    this.unindex(id);
    this.changed();
    try {
      await this.guard(() => this.adapter.delete(id));
    } catch (err) {
      this.index(item);
      this.changed();
      throw err;
    }
    this.announce({ kind: "delete", id, type: item.type });
    this.bus.emit("item.deleted", { item });
  }

  /** Put back an item exactly as it was (same id and timestamps), e.g. to undo a delete. */
  async restore(item: Item): Promise<Item> {
    if (this.items.has(item.id)) return this.items.get(item.id)!;
    await this.persist(item);
    this.bus.emit("item.created", { item });
    return item;
  }

  /**
   * Save an item as-is without announcing it as a user action (no item.* events).
   * For data upgrades, where nothing "happened" from the user's point of view.
   */
  async putQuietly(item: Item): Promise<void> {
    await this.persist(item);
  }

  /** Replace all data (restoring a backup). No item.* events; other tabs reload. */
  async replaceAll(raw: unknown[]): Promise<number> {
    const items = raw.map(normalizeItem).filter((i): i is Item => i !== null);
    const previousIds = [...this.items.keys()];
    await this.guard(() => this.adapter.replaceAll(items));
    this.load(items);
    this.announce({ kind: "reload", previousIds });
    return items.length;
  }

  /** Hear about every saved change. Returns an unsubscribe function. */
  onChange(fn: (change: StoreChange) => void): () => void {
    this.changeListeners.add(fn);
    return () => {
      this.changeListeners.delete(fn);
    };
  }

  private announce(change: StoreChange) {
    this.changeListeners.forEach((fn) => {
      try {
        fn(change);
      } catch (err) {
        console.error("[store] change listener failed", err);
      }
    });
  }

  /** Get notified after any change. Returns an unsubscribe function. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /**
   * Show a change at once, then save it. Saving goes over the network (Supabase), so waiting
   * first would make every click feel slow; if the save fails, the change is undone on screen
   * and the error shown.
   */
  private async persist(item: Item) {
    const before = this.items.get(item.id);
    this.index(item);
    this.changed();
    try {
      await this.guard(() => this.adapter.put(item));
    } catch (err) {
      if (before) this.index(before);
      else this.unindex(item.id);
      this.changed();
      throw err;
    }
    this.announce({ kind: "put", item });
  }

  /** Run a storage write; on failure tell the app (so the user sees it) and rethrow. */
  private async guard(write: () => Promise<void>) {
    try {
      await write();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.bus.emit("app.error", { message: `Couldn't save your change: ${message}` });
      // Mark it so the app-wide error handler knows the user has already been told.
      if (err && typeof err === "object") (err as { reported?: boolean }).reported = true;
      throw err;
    }
  }

  private changed() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }
}
