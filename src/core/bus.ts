import type { Item } from "./types";

/**
 * Every event the app can announce, and the data that comes with it.
 *
 * Modules can add their own events without touching this file, using
 * TypeScript declaration merging:
 *
 *   declare module "../../core/bus" {
 *     interface EventMap {
 *       "challenge.completed": { challengeId: string; xp: number };
 *     }
 *   }
 */
export interface EventMap {
  "item.created": { item: Item };
  "item.updated": { item: Item; previous: Item };
  "item.completed": { item: Item };
  "item.reopened": { item: Item };
  "item.deleted": { item: Item };
  /** Fired once per calendar day (on launch, at midnight, or when the app is reopened). */
  "day.started": { date: string; previousDate: string | null };
  "app.ready": Record<string, never>;

  /**
   * Any module can award XP. The Level & XP module (if switched on) records it.
   * `key` must be unique per achievement (e.g. "daily:<id>:<date>") so the same
   * thing never pays out twice, and so it can be taken back with "xp.revoke".
   */
  "xp.award": { key: string; amount: number; reason: string; source: string };
  /** Undo an earlier award, e.g. when a completed item is un-checked. */
  "xp.revoke": { key: string };
}

export type EventName = keyof EventMap;
export type EventHandler<K extends EventName> = (payload: EventMap[K]) => void;

export class EventBus {
  private handlers = new Map<EventName, Set<EventHandler<any>>>();

  /** Subscribe to an event. Returns a function that unsubscribes. */
  on<K extends EventName>(name: K, handler: EventHandler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
    };
  }

  emit<K extends EventName>(name: K, payload: EventMap[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (err) {
        // One broken module must never take down the others.
        console.error(`[bus] handler for "${name}" threw`, err);
      }
    }
  }
}
