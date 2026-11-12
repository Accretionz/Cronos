import { todayKey, type EventBus, type EventMap, type ItemStore } from "../../core";
import { XP_ENTRY, levelFromXp, levelTitle, totalXp, type XpEntry } from "./model";

const BEST_LEVEL_KEY = "cronos.game.bestLevel";

/** Highest level ever reached, so dropping a level (after an un-check) and regaining it doesn't celebrate twice. */
function readBestLevel(): number {
  try {
    return Number(localStorage.getItem(BEST_LEVEL_KEY)) || 1;
  } catch {
    return 1;
  }
}
function writeBestLevel(level: number) {
  try {
    localStorage.setItem(BEST_LEVEL_KEY, String(level));
  } catch {
    /* celebration state only; safe to lose */
  }
}

/**
 * Records "xp.award" / "xp.revoke" events from any module as ledger items.
 * Work runs one step at a time, so a quick check-then-uncheck can't race.
 */
export function startLedger(bus: EventBus, store: ItemStore): () => void {
  let queue: Promise<unknown> = Promise.resolve();
  const run = (job: () => Promise<void>) => {
    queue = queue.then(job).catch((err) => console.error("[game] ledger error", err));
  };

  const entries = () => store.query({ type: XP_ENTRY }) as XpEntry[];
  /** Entries use a stable id per key, so two devices (or tabs) can't record the same XP twice. */
  const idFor = (key: string) => `xp:${key}`;
  const findByKey = (key: string) => (store.get(idFor(key)) as XpEntry | undefined) ?? entries().find((e) => e.data.key === key);

  const award = ({ key, amount, reason, source }: EventMap["xp.award"]) =>
    run(async () => {
      if (!key || !(amount > 0) || findByKey(key)) return; // invalid or already paid out
      const best = Math.max(readBestLevel(), levelFromXp(totalXp(entries())).level);
      const now = new Date().toISOString();
      const entry: XpEntry = {
        id: idFor(key),
        type: XP_ENTRY,
        title: reason,
        status: "open",
        scheduledFor: todayKey(),
        tags: [],
        data: { amount: Math.round(amount), key, source },
        createdAt: now,
        updatedAt: now,
      };
      await store.putQuietly(entry);
      const after = levelFromXp(totalXp(entries()));
      bus.emit("game.xpGained", { key, amount: Math.round(amount), reason, total: after.total });
      bus.emit("app.notify", { text: `+${Math.round(amount)} XP · ${reason}` });
      if (after.level > best) {
        writeBestLevel(after.level);
        bus.emit("game.levelUp", { level: after.level, total: after.total });
        bus.emit("app.notify", { text: `Level up! You reached level ${after.level} · ${levelTitle(after.level)}`, big: true, icon: "★" });
      }
    });

  const revoke = ({ key }: EventMap["xp.revoke"]) =>
    run(async () => {
      const entry = findByKey(key);
      if (!entry) return;
      await store.remove(entry.id);
      bus.emit("game.xpRevoked", { key, amount: entry.data.amount });
    });

  const offAward = bus.on("xp.award", award);
  const offRevoke = bus.on("xp.revoke", revoke);
  return () => {
    offAward();
    offRevoke();
  };
}
