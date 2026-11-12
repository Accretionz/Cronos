import { EventBus, ItemStore, MemoryAdapter, type EventMap, type EventName, type Item } from "../core";

/** A store backed by memory, plus a log of every event it emits. */
export async function makeStore(initial: Item[] = []) {
  const bus = new EventBus();
  const store = new ItemStore(new MemoryAdapter(initial), bus);
  await store.init();
  const events: { name: EventName; payload: unknown }[] = [];
  const names: EventName[] = ["item.created", "item.updated", "item.completed", "item.reopened", "item.deleted", "app.error", "xp.award", "xp.revoke"];
  names.forEach((n) => bus.on(n, (payload: EventMap[typeof n]) => events.push({ name: n, payload })));
  return { bus, store, events, eventNames: () => events.map((e) => e.name) };
}

/** Wait for queued async work (e.g. the XP ledger) to finish. */
export const settle = () => new Promise((r) => setTimeout(r, 10));
