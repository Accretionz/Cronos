import type { Item } from "./types";

/**
 * Where items live. The ItemStore talks only to this interface. In the app it's the
 * signed-in account in Supabase (account/adapter.ts); tests use memory.
 */
export interface StorageAdapter {
  /** "cloud" = the signed-in account in Supabase; "memory" = lost when the page closes (tests). */
  readonly kind: "cloud" | "memory";
  loadAll(): Promise<Item[]>;
  put(item: Item): Promise<void>;
  delete(id: string): Promise<void>;
  /** Replace everything in one go (used when restoring a backup). */
  replaceAll(items: Item[]): Promise<void>;
}

/** Keeps everything in memory. Used for tests. */
export class MemoryAdapter implements StorageAdapter {
  readonly kind = "memory" as const;
  private items = new Map<string, Item>();
  constructor(initial: Item[] = []) {
    initial.forEach((i) => this.items.set(i.id, i));
  }
  async loadAll() {
    return [...this.items.values()];
  }
  async put(item: Item) {
    this.items.set(item.id, item);
  }
  async delete(id: string) {
    this.items.delete(id);
  }
  async replaceAll(items: Item[]) {
    this.items = new Map(items.map((i) => [i.id, i]));
  }
}
