import { describe, expect, it } from "vitest";
import { makeStore } from "../test/helpers";
import { EventBus } from "./bus";
import { MemoryAdapter } from "./storage";
import { ItemStore, normalizeItem } from "./store";

describe("ItemStore", () => {
  it("creates, updates and deletes, announcing each change", async () => {
    const { store, eventNames } = await makeStore();
    const t = await store.create({ type: "task", title: "  Write report  " });
    expect(t.title).toBe("Write report");
    await store.complete(t.id);
    expect(store.get(t.id)!.status).toBe("done");
    expect(store.get(t.id)!.completedAt).toBeTruthy();
    await store.reopen(t.id);
    expect(store.get(t.id)!.completedAt).toBeUndefined();
    await store.remove(t.id);
    expect(store.get(t.id)).toBeUndefined();
    expect(eventNames()).toEqual([
      "item.created",
      "item.updated", "item.completed",
      "item.updated", "item.reopened",
      "item.deleted",
    ]);
  });

  it("queries by type using its index, sorted by date then creation", async () => {
    const { store } = await makeStore();
    await store.create({ type: "task", title: "b", scheduledFor: "2026-10-02" });
    await store.create({ type: "event", title: "e", scheduledFor: "2026-10-01" });
    await store.create({ type: "task", title: "undated" });
    await store.create({ type: "task", title: "a", scheduledFor: "2026-10-01" });
    expect(store.query({ type: "task" }).map((i) => i.title)).toEqual(["a", "b", "undated"]);
    expect(store.query({ type: ["task", "event"], on: "2026-10-01" }).map((i) => i.title).sort()).toEqual(["a", "e"]);
    expect(store.query().length).toBe(4);
  });

  it("keeps the type index right when an item changes type", async () => {
    const { store } = await makeStore();
    const i = await store.create({ type: "draft", title: "x" });
    await store.putQuietly({ ...i, type: "task" });
    expect(store.query({ type: "draft" })).toHaveLength(0);
    expect(store.query({ type: "task" })).toHaveLength(1);
  });

  it("restore() puts back the exact item", async () => {
    const { store } = await makeStore();
    const t = await store.create({ type: "task", title: "x" });
    await store.remove(t.id);
    await store.restore(t);
    expect(store.get(t.id)).toEqual(t);
  });

  it("shows a change at once and undoes it if saving fails", async () => {
    const bus = new EventBus();
    const errors: string[] = [];
    bus.on("app.error", ({ message }) => errors.push(message));
    let release: () => void = () => {};
    let fail = false;
    const adapter = new MemoryAdapter();
    const slow = Object.assign(Object.create(adapter), {
      put: (item: never) => new Promise<void>((resolve, reject) => (release = () => (fail ? reject(new Error("offline")) : resolve(adapter.put(item) as never)))),
      delete: (id: string) => (fail ? Promise.reject(new Error("offline")) : adapter.delete(id)),
    });
    const store = new ItemStore(slow, bus);
    await store.init();
    const saving = store.create({ type: "task", title: "x" });
    expect(store.query({ type: "task" }).map((t) => t.title)).toEqual(["x"]); // on screen before the save finishes
    release();
    const t = await saving;
    fail = true;
    const update = store.update(t.id, { title: "y" });
    expect(store.get(t.id)!.title).toBe("y");
    release();
    await update.catch(() => {});
    expect(store.get(t.id)!.title).toBe("x"); // undone
    await store.remove(t.id).catch(() => {});
    expect(store.get(t.id)!.title).toBe("x"); // still there
    const created = store.create({ type: "task", title: "never saved" });
    release();
    await created.catch(() => {});
    expect(store.query({ type: "task" })).toHaveLength(1);
    expect(errors[0]).toBe("Couldn't save your change: offline");
  });

  it("reports saved changes", async () => {
    const { store } = await makeStore();
    const changes: string[] = [];
    const off = store.onChange((c) => changes.push(c.kind));
    const t = await store.create({ type: "task", title: "x" });
    await store.update(t.id, { title: "y" });
    await store.putQuietly({ ...t, title: "z" });
    await store.remove(t.id);
    await store.replaceAll([]);
    off();
    await store.create({ type: "task", title: "unheard" });
    expect(changes).toEqual(["put", "put", "put", "delete", "reload"]);
  });

  it("replaceAll() says which ids were there before", async () => {
    const { store } = await makeStore();
    const a = await store.create({ type: "task", title: "a" });
    let previous: string[] | undefined;
    store.onChange((c) => {
      if (c.kind === "reload") previous = c.previousIds;
    });
    await store.replaceAll([]);
    expect(previous).toEqual([a.id]);
  });

  it("putQuietly() saves without user-action events", async () => {
    const { store, eventNames } = await makeStore();
    const t = await store.create({ type: "task", title: "x" });
    await store.putQuietly({ ...t, title: "upgraded" });
    expect(store.get(t.id)!.title).toBe("upgraded");
    expect(eventNames()).toEqual(["item.created"]);
  });

  it("replaceAll() swaps every item and skips unreadable ones", async () => {
    const { store } = await makeStore();
    await store.create({ type: "task", title: "old" });
    const n = await store.replaceAll([{ id: "a", type: "task", title: "new" }, { nonsense: true }, null]);
    expect(n).toBe(1);
    expect(store.all().map((i) => i.title)).toEqual(["new"]);
  });

  it("a failed save leaves data unchanged and tells the user", async () => {
    const bus = new EventBus();
    const adapter = new MemoryAdapter();
    adapter.put = async () => {
      throw new Error("disk full");
    };
    const store = new ItemStore(adapter, bus);
    await store.init();
    const errors: string[] = [];
    bus.on("app.error", (e) => errors.push(e.message));
    await expect(store.create({ type: "task", title: "x" })).rejects.toThrow("disk full");
    expect(store.size).toBe(0);
    expect(errors[0]).toMatch(/Couldn't save/);
  });
});

describe("normalizeItem", () => {
  it("fills in missing fields", () => {
    const i = normalizeItem({ id: "1", type: "task" })!;
    expect(i.title).toBe("");
    expect(i.status).toBe("open");
    expect(i.tags).toEqual([]);
    expect(i.data).toEqual({});
    expect(i.createdAt).toBeTruthy();
  });
  it("rejects things that aren't items", () => {
    expect(normalizeItem(null)).toBeNull();
    expect(normalizeItem({ type: "task" })).toBeNull();
    expect(normalizeItem({ id: "1" })).toBeNull();
  });
  it("repairs bad field values", () => {
    const i = normalizeItem({ id: "1", type: "t", status: "weird", tags: ["a", 3], data: [1] })!;
    expect(i.status).toBe("open");
    expect(i.tags).toEqual(["a"]);
    expect(i.data).toEqual({});
  });
});
