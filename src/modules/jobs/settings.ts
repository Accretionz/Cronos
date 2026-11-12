import { useItems, type Item, type ItemStore } from "../../core";

/**
 * Jobs settings, saved as one item with a fixed id so they sync to your other devices
 * (and two devices can't each create their own copy).
 */
export const JOB_SETTINGS = "jobs-settings";
const ID = "jobs-settings";

export interface JobSettings {
  /** Show each application's extra information right on the Jobs page. */
  showDetails: boolean;
  /** Which parts, when shown. */
  showNotes: boolean;
  /** The job posting link. */
  showLink: boolean;
  showTimeline: boolean;
}

export const DEFAULT_JOB_SETTINGS: JobSettings = { showDetails: true, showNotes: true, showLink: true, showTimeline: false };

export function readJobSettings(raw: unknown): JobSettings {
  const d = (raw ?? {}) as Partial<JobSettings>;
  const pick = (k: keyof JobSettings) => (typeof d[k] === "boolean" ? (d[k] as boolean) : DEFAULT_JOB_SETTINGS[k]);
  return { showDetails: pick("showDetails"), showNotes: pick("showNotes"), showLink: pick("showLink"), showTimeline: pick("showTimeline") };
}

export function useJobSettings(): JobSettings {
  const [item] = useItems({ type: JOB_SETTINGS });
  return readJobSettings(item?.data);
}

export async function saveJobSettings(store: ItemStore, patch: Partial<JobSettings>): Promise<void> {
  const existing = store.get(ID);
  const data = { ...readJobSettings(existing?.data), ...patch };
  const now = new Date().toISOString();
  const item: Item = existing
    ? { ...existing, data, updatedAt: now }
    : { id: ID, type: JOB_SETTINGS, title: "Jobs settings", status: "open", tags: [], data, createdAt: now, updatedAt: now };
  await store.putQuietly(item);
}
