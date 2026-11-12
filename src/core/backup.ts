import { dayKey } from "./date";
import { normalizeItem, type ItemStore } from "./store";
import type { Item } from "./types";

/**
 * Backups: one JSON file with every item plus the app's saved preferences.
 * Bump BACKUP_FORMAT if the file layout itself changes; changes to item data are
 * handled by each module's `upgradeItem` when the backup is loaded.
 */
export const BACKUP_FORMAT = 1;
const PREF_PREFIX = "cronos.";
/** Device-only settings that never go into a backup (or get replaced by one): the sign-in. */
const DEVICE_ONLY_PREFIX = "cronos.cloud.";
const isPref = (k: string | null): k is string => !!k && k.startsWith(PREF_PREFIX) && !k.startsWith(DEVICE_ONLY_PREFIX);

export interface Backup {
  app: "cronos";
  format: number;
  exportedAt: string;
  items: Item[];
  /** Browser-saved preferences (sidebar order, switched-off modules, …). */
  prefs: Record<string, string>;
}

export function createBackup(store: ItemStore): Backup {
  return { app: "cronos", format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), items: store.all(), prefs: readPrefs() };
}

export function backupFileName(date = new Date()): string {
  return `cronos-backup-${dayKey(date)}.json`;
}

/** Ask the browser to save the backup as a file. */
export function downloadBackup(backup: Backup): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = backupFileName(new Date(backup.exportedAt));
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ParsedBackup =
  | { ok: true; backup: Backup; skipped: number }
  | { ok: false; error: string };

/** Check a file's contents before anything is replaced. */
export function parseBackup(text: string): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON." };
  }
  const d = data as Partial<Backup> | null;
  if (!d || typeof d !== "object" || d.app !== "cronos" || !Array.isArray(d.items)) {
    return { ok: false, error: "This doesn't look like a Cronos backup." };
  }
  if (typeof d.format !== "number" || d.format > BACKUP_FORMAT) {
    return { ok: false, error: "This backup was made by a newer version of Cronos. Update the app first." };
  }
  const items = d.items.map(normalizeItem).filter((i): i is Item => i !== null);
  const prefs: Record<string, string> = {};
  if (d.prefs && typeof d.prefs === "object") {
    for (const [k, v] of Object.entries(d.prefs)) if (isPref(k) && typeof v === "string") prefs[k] = v;
  }
  return {
    ok: true,
    skipped: d.items.length - items.length,
    backup: { app: "cronos", format: d.format, exportedAt: typeof d.exportedAt === "string" ? d.exportedAt : "", items, prefs },
  };
}

/** Replace all data with a backup. The page should reload afterwards so every module starts fresh. */
export async function restoreBackup(store: ItemStore, backup: Backup): Promise<number> {
  const count = await store.replaceAll(backup.items);
  writePrefs(backup.prefs);
  return count;
}

function readPrefs(): Record<string, string> {
  const prefs: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (isPref(k)) prefs[k] = localStorage.getItem(k) ?? "";
    }
  } catch {
    /* storage unavailable */
  }
  return prefs;
}

function writePrefs(prefs: Record<string, string>) {
  try {
    const old: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (isPref(k)) old.push(k);
    }
    old.forEach((k) => localStorage.removeItem(k));
    Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(k, v));
  } catch {
    /* storage unavailable */
  }
}
