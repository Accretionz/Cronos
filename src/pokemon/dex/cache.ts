/**
 * A cache for PokéAPI data that survives reloads. Kept in its own IndexedDB database, apart
 * from your data: it's not in backups, it's safe to clear, and it refills itself from the API.
 * Falls back to memory only when IndexedDB isn't available (private windows, tests).
 *
 * Bump CACHE_VERSION when the parsed shapes change, so old entries are ignored and refetched.
 */
export const CACHE_VERSION = 2; // 2: moves carry battle effects (meta)
const DB_NAME = "cronos-dex";
const STORE = "entries";
/** Game data almost never changes; refresh it about once a month anyway. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface Entry<T> {
  key: string;
  value: T;
  savedAt: number;
}

const memory = new Map<string, unknown>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

const fullKey = (key: string) => `v${CACHE_VERSION}:${key}`;

/** Already in memory this session (synchronous). */
export function peekCached<T>(key: string): T | undefined {
  return memory.get(fullKey(key)) as T | undefined;
}

export async function getCached<T>(key: string): Promise<T | undefined> {
  const k = fullKey(key);
  if (memory.has(k)) return memory.get(k) as T;
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(k);
      req.onsuccess = () => {
        const e = req.result as Entry<T> | undefined;
        if (!e || Date.now() - e.savedAt > MAX_AGE_MS) return resolve(undefined);
        memory.set(k, e.value);
        resolve(e.value);
      };
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function putCached<T>(key: string, value: T): Promise<void> {
  const k = fullKey(key);
  memory.set(k, value);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ key: k, value, savedAt: Date.now() } satisfies Entry<T>);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // a cache write failing is fine
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** For tests. */
export function clearMemoryCache(): void {
  memory.clear();
}
