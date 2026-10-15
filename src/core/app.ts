import { EventBus } from "./bus";
import { ModuleRegistry, type AppModule } from "./registry";
import { startScheduler } from "./scheduler";
import { defaultAdapter, type StorageAdapter } from "./storage";
import { ItemStore } from "./store";

export interface Core {
  bus: EventBus;
  store: ItemStore;
  registry: ModuleRegistry;
}

/**
 * Boot order matters: load data, start modules (so they subscribe to events),
 * then start the scheduler, so modules hear the first "day.started".
 */
export async function createCore(
  modules: AppModule[],
  adapter: StorageAdapter = defaultAdapter(),
): Promise<Core> {
  const bus = new EventBus();
  const store = new ItemStore(adapter, bus);
  const registry = new ModuleRegistry();

  await store.init();
  modules.forEach((m) => registry.register(m));
  registry.start({ bus, store });
  startScheduler(bus);
  bus.emit("app.ready", {});

  return { bus, store, registry };
}
