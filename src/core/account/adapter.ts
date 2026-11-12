import type { StorageAdapter } from "../storage";
import type { Item } from "../types";
import type { SupabaseClient } from "./supabase";

/**
 * The app's storage: the signed-in account's rows in Supabase. Nothing is kept on the
 * device; the store holds what's on screen in memory and saves every change straight here.
 */
export class SupabaseAdapter implements StorageAdapter {
  readonly kind = "cloud" as const;
  constructor(private client: SupabaseClient) {}

  loadAll(): Promise<Item[]> {
    return this.client.loadItems();
  }
  put(item: Item): Promise<void> {
    return this.client.saveItems([item]);
  }
  delete(id: string): Promise<void> {
    return this.client.deleteItems([id]);
  }
  replaceAll(items: Item[]): Promise<void> {
    return this.client.replaceItems(items);
  }
}
