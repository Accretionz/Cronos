import { describe, expect, it } from "vitest";
import { makeStore } from "../test/helpers";
import { adoptBrowserNavOrder, applyOrder, NAV_ORDER, saveNavOrder } from "./navOrder";

/** A stand-in for the browser's localStorage. */
function fakeLocalStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
  return data;
}

describe("sidebar order", () => {
  it("is saved as one item in the account, quietly", async () => {
    const { store, eventNames } = await makeStore();
    await saveNavOrder(store, ["budget", "tasks"]);
    await saveNavOrder(store, ["tasks", "budget"]);
    const saved = store.query({ type: NAV_ORDER });
    expect(saved).toHaveLength(1);
    expect(saved[0].data.order).toEqual(["tasks", "budget"]);
    expect(eventNames()).toEqual([]); // a preference, not something to react to
    const ordered = applyOrder([{ id: "budget" }, { id: "jobs" }, { id: "tasks" }], saved[0].data.order as string[]);
    expect(ordered.map((i) => i.id)).toEqual(["tasks", "budget", "jobs"]);
  });

  it("keeps the order this browser had, once, if the account has none", async () => {
    const browser = fakeLocalStorage({ "cronos.navOrder": JSON.stringify(["jobs", "tasks"]) });
    const { store } = await makeStore();
    await adoptBrowserNavOrder(store);
    expect(store.query({ type: NAV_ORDER })[0].data.order).toEqual(["jobs", "tasks"]);
    expect(browser.has("cronos.navOrder")).toBe(false);
  });

  it("doesn't replace an order the account already has", async () => {
    fakeLocalStorage({ "cronos.navOrder": JSON.stringify(["jobs"]) });
    const { store } = await makeStore();
    await saveNavOrder(store, ["budget"]);
    await adoptBrowserNavOrder(store);
    expect(store.query({ type: NAV_ORDER })[0].data.order).toEqual(["budget"]);
  });
});
