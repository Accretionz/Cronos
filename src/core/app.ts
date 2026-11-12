import { EventBus } from "./bus";
import { ModuleRegistry, type AppModule } from "./registry";
import type { AccountService } from "./account";
import { startScheduler } from "./scheduler";
import { MemoryAdapter, type StorageAdapter } from "./storage";
import { ItemStore } from "./store";

export interface Core {
  bus: EventBus;
  store: ItemStore;
  registry: ModuleRegistry;
  /** Who's signed in, and everything to do with the account (null in tests). */
  account: AccountService | null;
  /** Shut everything down (stops timers and modules). Used by tests and hot reload. */
  stop(): void;
}

export interface CoreOptions {
  /** The signed-in account (the app always has one; tests may leave it out). */
  account?: AccountService | null;
}

/**
 * Boot order matters: load the account's data, upgrade old items, start modules (so they
 * subscribe to events), then start the scheduler, so modules hear the first "day.started".
 * `storage` is the signed-in account in Supabase (account/adapter.ts); tests pass memory.
 */
export async function createCore(modules: AppModule[], storage: StorageAdapter = new MemoryAdapter(), options: CoreOptions = {}): Promise<Core> {
  const bus = new EventBus();
  const store = new ItemStore(storage, bus);
  const registry = new ModuleRegistry();

  await store.init();
  modules.forEach((m) => registry.register(m));
  await upgradeItems(store, modules);
  registry.start({ bus, store });
  const stopScheduler = startScheduler(bus);
  bus.emit("app.ready", {});

  const stop = () => {
    stopScheduler();
    registry.stop();
  };
  return { bus, store, registry, account: options.account ?? null, stop };
}

/** Let each module bring its older stored items up to date (see AppModule.upgradeItem). */
export async function upgradeItems(store: ItemStore, modules: AppModule[]): Promise<number> {
  let changed = 0;
  for (const m of modules) {
    if (!m.upgradeItem || !m.itemTypes?.length) continue;
    for (const item of store.query({ type: m.itemTypes })) {
      let next;
      try {
        next = m.upgradeItem(item);
      } catch (err) {
        console.error(`[upgrade] ${m.id} failed on item ${item.id}`, err);
        continue;
      }
      if (next && JSON.stringify(next) !== JSON.stringify(item)) {
        await store.putQuietly(next);
        changed++;
      }
    }
  }
  return changed;
}
