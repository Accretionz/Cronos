import { describe, expect, it } from "vitest";
import { makeStore, settle } from "../test/helpers";
import { POINTS_ENTRY, WELCOME_POINTS, balanceOf, refund, spendPoints, startWallet, type PointsEntry } from "./wallet";

const balance = (store: Awaited<ReturnType<typeof makeStore>>["store"]) => balanceOf(store.query({ type: POINTS_ENTRY }) as PointsEntry[]);

describe("wallet", () => {
  it("gives the welcome gift once", async () => {
    const { bus, store } = await makeStore();
    const stop = startWallet(bus, store);
    await settle();
    expect(balance(store)).toBe(WELCOME_POINTS);
    stop();
    startWallet(bus, store);
    await settle();
    expect(balance(store)).toBe(WELCOME_POINTS);
  });

  it("awards once per key and can take it back", async () => {
    const { bus, store } = await makeStore();
    startWallet(bus, store);
    bus.emit("points.award", { key: "daily:a:2026-10-21", amount: 20, reason: "Run", source: "dailies" });
    bus.emit("points.award", { key: "daily:a:2026-10-21", amount: 20, reason: "Run", source: "dailies" });
    await settle();
    expect(balance(store)).toBe(WELCOME_POINTS + 20);
    bus.emit("points.revoke", { key: "daily:a:2026-10-21" });
    await settle();
    expect(balance(store)).toBe(WELCOME_POINTS);
  });

  it("spends, refuses when short, refunds", async () => {
    const { bus, store } = await makeStore();
    startWallet(bus, store);
    await settle();
    const paid = await spendPoints(store, 100, "Poké Ball summon");
    expect(paid).not.toBeNull();
    expect(balance(store)).toBe(WELCOME_POINTS - 100);
    expect(await spendPoints(store, 999, "too much")).toBeNull();
    await refund(store, paid!);
    expect(balance(store)).toBe(WELCOME_POINTS);
  });

  it("never goes negative when spent points are taken back (and can't be earned twice)", async () => {
    const { bus, store } = await makeStore();
    startWallet(bus, store);
    bus.emit("points.award", { key: "k", amount: 50, reason: "Run", source: "dailies" });
    await settle();
    await spendPoints(store, WELCOME_POINTS + 50, "big summon");
    expect(balance(store)).toBe(0);
    bus.emit("points.revoke", { key: "k" });
    await settle();
    expect(balance(store)).toBe(0);
    bus.emit("points.award", { key: "k", amount: 50, reason: "Run", source: "dailies" });
    await settle();
    expect(balance(store)).toBe(0); // the original award still stands, so no second payout
  });
});
