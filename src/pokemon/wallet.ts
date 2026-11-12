import { todayKey, useItems, type EventBus, type EventMap, type Item, type ItemStore } from "../core";

/**
 * Gacha Points: the currency for summons. A ledger like XP: every change is an entry
 * (+ for earnings, − for spending) and the balance is the sum.
 *
 * - Earn: any module emits "points.award" with a unique key (dailies do this).
 * - Take back: "points.revoke" removes an award, but never pushes the balance below zero
 *   (if the points were already spent, they stay spent; the key still can't pay twice).
 * - Spend: spendPoints() from the Summon page.
 */
export const POINTS_ENTRY = "gacha-points";

export const POINTS_LABEL = "Gacha Points";
export const POINTS_UNIT = "GP";
/** A one-time gift so a new player can summon right away. */
export const WELCOME_POINTS = 150;
export const WELCOME_KEY = "welcome";

export interface PointsData extends Record<string, unknown> {
  /** Positive for earnings, negative for spending. */
  amount: number;
  key: string;
  source: string;
}
export type PointsEntry = Item<PointsData>;

export const pointsIdFor = (key: string) => `gp:${key}`;
export const balanceOf = (entries: PointsEntry[]) => entries.reduce((sum, e) => sum + (Number(e.data.amount) || 0), 0);
export const formatPoints = (n: number) => `${n.toLocaleString()} ${POINTS_UNIT}`;

/** Live balance and history. */
export function usePoints(): { balance: number; entries: PointsEntry[] } {
  const entries = useItems({ type: POINTS_ENTRY }) as PointsEntry[];
  return { balance: balanceOf(entries), entries };
}

/**
 * Record "points.award" / "points.revoke" from any module. Steps run one at a time so a
 * quick check-uncheck can't race. Award entries use a stable id per key, so two open tabs
 * can't pay the same thing twice. Also gives the welcome gift once.
 */
export function startWallet(bus: EventBus, store: ItemStore): () => void {
  let queue: Promise<unknown> = Promise.resolve();
  const run = (job: () => Promise<void>) => {
    queue = queue.then(job).catch((err) => console.error("[wallet] error", err));
  };
  const balance = () => balanceOf(store.query({ type: POINTS_ENTRY }) as PointsEntry[]);

  const award = ({ key, amount, reason, source }: EventMap["points.award"]) =>
    run(async () => {
      const id = pointsIdFor(key);
      if (!key || !(amount > 0) || store.get(id)) return;
      const now = new Date().toISOString();
      const entry: PointsEntry = {
        id,
        type: POINTS_ENTRY,
        title: reason,
        status: "open",
        scheduledFor: todayKey(),
        tags: [],
        data: { amount: Math.round(amount), key, source },
        createdAt: now,
        updatedAt: now,
      };
      await store.putQuietly(entry);
      bus.emit("app.notify", { text: `+${formatPoints(Math.round(amount))} · ${reason}`, icon: "◈" });
    });

  const revoke = ({ key }: EventMap["points.revoke"]) =>
    run(async () => {
      const entry = store.get(pointsIdFor(key)) as PointsEntry | undefined;
      if (!entry || entry.data.amount <= 0) return;
      if (balance() - entry.data.amount < 0) return; // already spent: keep it (and the key) so it can't pay twice
      await store.remove(entry.id);
    });

  const offAward = bus.on("points.award", award);
  const offRevoke = bus.on("points.revoke", revoke);
  award({ key: WELCOME_KEY, amount: WELCOME_POINTS, reason: "Welcome gift", source: "wallet" });
  return () => {
    offAward();
    offRevoke();
  };
}

/** Pay for something. Returns the spending entry (pass it to refund() to undo), or null if there aren't enough points. */
export async function spendPoints(store: ItemStore, amount: number, reason: string): Promise<PointsEntry | null> {
  const cost = Math.round(amount);
  if (cost > balanceOf(store.query({ type: POINTS_ENTRY }) as PointsEntry[])) return null;
  const key = `spend:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
  return (await store.create<PointsData>({
    type: POINTS_ENTRY,
    title: reason,
    status: "open",
    scheduledFor: todayKey(),
    data: { amount: -cost, key, source: "spend" },
  })) as PointsEntry;
}

/** Give back what a spending entry took (e.g. the summon failed). */
export async function refund(store: ItemStore, spent: PointsEntry): Promise<void> {
  if (store.get(spent.id)) await store.remove(spent.id);
}
