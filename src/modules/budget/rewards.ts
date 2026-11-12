import type { EventBus, Item, ItemStore } from "../../core";
import { pointsIdFor } from "../../pokemon/wallet";
import { TXN, type Transaction } from "./model";

/** Share of income that becomes Gacha Points: half the amount, 1 GP per dollar. */
export const INCOME_POINTS_SHARE = 0.5;

/** $2,500.00 → 1,250 GP. */
export const pointsForIncome = (amountCents: number) => Math.floor((Math.max(0, amountCents) / 100) * INCOME_POINTS_SHARE);

/** The award key changes with the amount, so editing an income swaps the old award for a new one. */
export const incomePointsKey = (txn: Transaction) => `income:${txn.id}:${txn.data.amountCents}`;

const isIncome = (item: Item | undefined): item is Transaction => item?.type === TXN && (item as Transaction).data?.kind === "income";

/**
 * Turns income into Gacha Points: adding an income pays half its amount in GP, editing the
 * amount adjusts it, deleting takes it back (unless the points were already spent; see the
 * wallet). Incomes recorded before this existed don't pay out, even when edited later.
 */
export function watchIncome(bus: EventBus, store: ItemStore): () => void {
  const award = (t: Transaction) => {
    const amount = pointsForIncome(t.data.amountCents);
    if (amount > 0) bus.emit("points.award", { key: incomePointsKey(t), amount, reason: `Income: ${t.title}`, source: "budget" });
  };
  const revoke = (t: Transaction) => bus.emit("points.revoke", { key: incomePointsKey(t) });
  const wasPaid = (t: Transaction) => Boolean(store.get(pointsIdFor(incomePointsKey(t))));

  const offCreated = bus.on("item.created", ({ item }) => {
    if (isIncome(item)) award(item);
  });
  const offUpdated = bus.on("item.updated", ({ item, previous }) => {
    if (item.type !== TXN) return;
    const before = isIncome(previous) ? previous : null;
    const after = isIncome(item) ? item : null;
    if (before && !wasPaid(before)) return; // an income from before points existed: leave it be
    if (before && after && incomePointsKey(before) === incomePointsKey(after)) return; // amount unchanged
    if (before) revoke(before);
    if (after) award(after);
  });
  const offDeleted = bus.on("item.deleted", ({ item }) => {
    if (isIncome(item)) revoke(item);
  });
  return () => {
    offCreated();
    offUpdated();
    offDeleted();
  };
}
