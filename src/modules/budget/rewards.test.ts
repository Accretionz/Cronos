import { describe, expect, it } from "vitest";
import { POINTS_ENTRY, balanceOf, startWallet, type PointsEntry } from "../../pokemon/wallet";
import { makeStore, settle } from "../../test/helpers";
import { TXN, type TxnData } from "./model";
import { pointsForIncome, watchIncome } from "./rewards";

async function setup() {
  const ctx = await makeStore();
  startWallet(ctx.bus, ctx.store);
  await settle();
  const base = balanceOf(ctx.store.query({ type: POINTS_ENTRY }) as PointsEntry[]);
  const gained = () => balanceOf(ctx.store.query({ type: POINTS_ENTRY }) as PointsEntry[]) - base;
  return { ...ctx, gained };
}
const income = (cents: number): { type: string; title: string; scheduledFor: string; data: TxnData } => ({
  type: TXN, title: "Paycheck", scheduledFor: "2026-10-22", data: { amountCents: cents, kind: "income", category: "Salary" },
});

describe("income → Gacha Points", () => {
  it("is half the amount, 1 GP per dollar", () => {
    expect([pointsForIncome(250000), pointsForIncome(1999), pointsForIncome(199), pointsForIncome(0)]).toEqual([1250, 9, 0, 0]);
  });

  it("pays when income is added, adjusts on edit, takes back on delete", async () => {
    const { bus, store, gained } = await setup();
    const stop = watchIncome(bus, store);
    const t = await store.create(income(250000));
    await settle();
    expect(gained()).toBe(1250);
    await store.update(t.id, { data: { ...(t.data as TxnData), amountCents: 300000 } });
    await settle();
    expect(gained()).toBe(1500);
    await store.update(t.id, { title: "Renamed" });
    await settle();
    expect(gained()).toBe(1500);
    await store.remove(t.id);
    await settle();
    expect(gained()).toBe(0);
    stop();
  });

  it("expenses don't pay; switching an expense to income does", async () => {
    const { bus, store, gained } = await setup();
    watchIncome(bus, store);
    const e = await store.create({ ...income(10000), data: { amountCents: 10000, kind: "expense", category: "Dining" } });
    await settle();
    expect(gained()).toBe(0);
    await store.update(e.id, { data: { amountCents: 10000, kind: "income", category: "Gifts" } });
    await settle();
    expect(gained()).toBe(50);
  });

  it("incomes from before this feature don't pay, even when edited", async () => {
    const { bus, store, gained } = await setup();
    const old = await store.create(income(100000)); // recorded while nothing was watching
    watchIncome(bus, store);
    await store.update(old.id, { data: { ...(old.data as TxnData), amountCents: 200000 } });
    await settle();
    expect(gained()).toBe(0);
  });
});
