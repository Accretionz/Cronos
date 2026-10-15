import { todayKey, type EventBus, type EventMap, type ItemStore } from "../../core";
import { XP_ENTRY, levelFromXp, totalXp, type XpData, type XpEntry } from "./model";

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
  const findByKey = (key: string) => entries().find((e) => e.data.key === key);

  const award = ({ key, amount, reason, source }: EventMap["xp.award"]) =>
    run(async () => {
      if (!key || !(amount > 0) || findByKey(key)) return; // invalid or already paid out
      const best = Math.max(readBestLevel(), levelFromXp(totalXp(entries())).level);
      await store.create<XpData>({
        type: XP_ENTRY,
        title: reason,
        scheduledFor: todayKey(),
        data: { amount: Math.round(amount), key, source },
      });
      const after = levelFromXp(totalXp(entries()));
      bus.emit("game.xpGained", { amount: Math.round(amount), reason, total: after.total });
      if (after.level > best) {
        writeBestLevel(after.level);
        bus.emit("game.levelUp", { level: after.level, total: after.total });
      }
    });

  const revoke = ({ key }: EventMap["xp.revoke"]) =>
    run(async () => {
      const entry = findByKey(key);
      if (entry) await store.remove(entry.id);
    });

  const offAward = bus.on("xp.award", award);
  const offRevoke = bus.on("xp.revoke", revoke);
  return () => {
    offAward();
    offRevoke();
  };
}
