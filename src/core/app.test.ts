import { describe, expect, it } from "vitest";
import { createCore, upgradeItems } from "./app";
import { MemoryAdapter } from "./storage";
import type { AppModule } from "./registry";
import type { Item } from "./types";

const memory = (items: Item[] = []) => new MemoryAdapter(items);
const item = (over: Partial<Item>): Item => ({
  id: "1", type: "note", title: "", status: "open", tags: [], data: {}, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...over,
});

describe("createCore", () => {
  it("boots, runs module init, and stops cleanly", async () => {
    let started = 0;
    let stopped = 0;
    const mod: AppModule = {
      id: "m",
      name: "M",
      init: () => {
        started++;
        return () => stopped++;
      },
    };
    const core = await createCore([mod], memory());
    expect(started).toBe(1);
    expect(core.store.storageKind).toBe("memory");
    core.stop();
    expect(stopped).toBe(1);
  });
});

describe("upgradeItems", () => {
  // Example upgrade: old notes stored text in data.body, new ones in data.text.
  const notes: AppModule = {
    id: "notes",
    name: "Notes",
    itemTypes: ["note"],
    upgradeItem: (i) => ("body" in i.data ? { ...i, data: { text: i.data.body } } : i),
  };

  it("upgrades old items once and leaves current ones alone", async () => {
    const core = await createCore([notes], memory([item({ id: "old", data: { body: "hi" } }), item({ id: "new", data: { text: "yo" } })]));
    expect(core.store.get("old")!.data).toEqual({ text: "hi" });
    expect(core.store.get("new")!.data).toEqual({ text: "yo" });
    expect(await upgradeItems(core.store, [notes])).toBe(0); // safe to run again
    core.stop();
  });

  it("a failing upgrade doesn't stop the app", async () => {
    const broken: AppModule = { id: "b", name: "B", itemTypes: ["note"], upgradeItem: () => { throw new Error("boom"); } };
    const core = await createCore([broken], memory([item({})]));
    expect(core.store.size).toBe(1);
    core.stop();
  });
});
