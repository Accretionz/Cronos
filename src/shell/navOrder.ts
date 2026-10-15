import { useSyncExternalStore } from "react";

/**
 * The user's sidebar order, as a list of ids ("today" plus module ids).
 * Saved in the browser so it survives reloads. Items not in the saved list
 * (e.g. a newly installed module) keep their default place at the end.
 */
const KEY = "cronos.navOrder";
const listeners = new Set<() => void>();

function load(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

let saved: string[] = load();

function emit() {
  listeners.forEach((fn) => fn());
}

export function setNavOrder(ids: string[]) {
  saved = [...ids];
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* storage unavailable: order lasts for this session */
  }
  emit();
}

export function resetNavOrder() {
  saved = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  emit();
}

export function useNavOrder(): string[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => saved,
  );
}

/** Sort items by the saved order; unknown items go after, in their default order. */
export function applyOrder<T extends { id: string }>(items: T[], order: string[]): T[] {
  const pos = new Map(order.map((id, i) => [id, i]));
  return items
    .map((item, i) => ({ item, key: pos.get(item.id) ?? order.length + i }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item);
}

/** Move one id to a new index. */
export function moveId(ids: string[], id: string, toIndex: number): string[] {
  const rest = ids.filter((x) => x !== id);
  const clamped = Math.max(0, Math.min(toIndex, rest.length));
  return [...rest.slice(0, clamped), id, ...rest.slice(clamped)];
}
