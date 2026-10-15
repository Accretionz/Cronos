import type { Item } from "./types";

/**
 * Where items physically live. The ItemStore talks only to this interface,
 * so switching to cloud sync later means writing one new adapter.
 */
export interface StorageAdapter {
  loadAll(): Promise<Item[]>;
  put(item: Item): Promise<void>;
  delete(id: string): Promise<void>;
}

/** Keeps everything in memory. Used for tests, or when IndexedDB is unavailable. */
export class MemoryAdapter implements StorageAdapter {
  private items = new Map<string, Item>();
  async loadAll() {
    return [...this.items.values()];
  }
  async put(item: Item) {
    this.items.set(item.id, item);
  }
  async delete(id: string) {
    this.items.delete(id);
  }
}

/** Saves items in the browser's IndexedDB, so data survives reloads and works offline. */
export class IndexedDBAdapter implements StorageAdapter {
  private dbPromise: Promise<IDBDatabase>;

  constructor(dbName = "cronos", private storeName = "items") {
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(storeName)) {
          const os = db.createObjectStore(storeName, { keyPath: "id" });
          os.createIndex("type", "type");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async tx<T>(mode: IDBTransactionMode, run: (os: IDBObjectStore) => IDBRequest<T>) {
    const db = await this.dbPromise;
    return new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(this.storeName, mode).objectStore(this.storeName));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  loadAll() {
    return this.tx<Item[]>("readonly", (os) => os.getAll());
  }
  async put(item: Item) {
    await this.tx("readwrite", (os) => os.put(item));
  }
  async delete(id: string) {
    await this.tx("readwrite", (os) => os.delete(id));
  }
}

/** Pick the best available adapter for this environment. */
export function defaultAdapter(): StorageAdapter {
  try {
    if (typeof indexedDB !== "undefined") return new IndexedDBAdapter();
  } catch {
    /* fall through */
  }
  console.warn("[storage] IndexedDB unavailable, data will not be saved");
  return new MemoryAdapter();
}
