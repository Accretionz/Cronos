import { describe, expect, it } from "vitest";
import { makeStore } from "../test/helpers";
import { BACKUP_FORMAT, backupFileName, createBackup, parseBackup, restoreBackup } from "./backup";

describe("backups", () => {
  it("round-trips every item", async () => {
    const a = await makeStore();
    await a.store.create({ type: "task", title: "One" });
    await a.store.create({ type: "transaction", title: "Rent", data: { amountCents: 180000 } });
    const text = JSON.stringify(createBackup(a.store));

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.format).toBe(BACKUP_FORMAT);

    const b = await makeStore();
    await b.store.create({ type: "task", title: "will be replaced" });
    const n = await restoreBackup(b.store, parsed.backup);
    expect(n).toBe(2);
    expect(b.store.all().map((i) => i.title).sort()).toEqual(["One", "Rent"]);
  });

  it("rejects files that aren't Cronos backups", () => {
    expect(parseBackup("not json").ok).toBe(false);
    expect(parseBackup('{"hello": 1}').ok).toBe(false);
    expect(parseBackup('{"app":"cronos","format":1}').ok).toBe(false);
  });

  it("refuses backups from a newer app version", () => {
    const r = parseBackup(JSON.stringify({ app: "cronos", format: BACKUP_FORMAT + 1, items: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/newer version/);
  });

  it("skips unreadable entries and only keeps app preferences", () => {
    const r = parseBackup(
      JSON.stringify({ app: "cronos", format: 1, items: [{ id: "1", type: "task" }, { bad: 1 }], prefs: { "cronos.navOrder": "[]", other: "x" } }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skipped).toBe(1);
    expect(r.backup.prefs).toEqual({ "cronos.navOrder": "[]" });
  });

  it("names the file by date", () => {
    expect(backupFileName(new Date(2026, 9, 15))).toBe("cronos-backup-2026-10-15.json");
  });
});
