import { describe, expect, it } from "vitest";
import { todayKey } from "../../core";
import { makeStore, settle } from "../../test/helpers";
import { startLedger } from "../game/ledger";
import { XP_ENTRY } from "../game/model";
import { setDone, watchCompletions } from "./logic";
import { DAILY, describeSchedule, isDueOn, scheduledWeekdays, streakOf, toggleDay, toRecurrence, type Daily, type Weekday } from "./model";

const daily = (recurrence: string, doneDays: string[]) =>
  ({ id: "a", type: DAILY, title: "x", status: "open", recurrence, tags: [], data: { difficulty: "easy", doneDays }, createdAt: "2026-09-01T12:00:00Z", updatedAt: "" }) as Daily;
const MWF = "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR";
const TODAY = "2026-10-13"; // a Tuesday

describe("schedules", () => {
  it("stores every day or chosen weekdays as a standard rule", () => {
    expect(toRecurrence([0, 1, 2, 3, 4, 5, 6])).toBe("RRULE:FREQ=DAILY");
    expect(toRecurrence([5, 1, 3] as Weekday[])).toBe(MWF);
    expect(scheduledWeekdays(daily(MWF, []))).toEqual([1, 3, 5]);
  });
  it("knows which days a daily is due", () => {
    expect(isDueOn(daily(MWF, []), "2026-10-12")).toBe(true);
    expect(isDueOn(daily(MWF, []), "2026-10-13")).toBe(false);
  });
  it("describes schedules in words", () => {
    expect([describeSchedule([1, 2, 3, 4, 5] as Weekday[]), describeSchedule([0, 6] as Weekday[]), describeSchedule([1, 3] as Weekday[])]).toEqual(["Weekdays", "Weekends", "Mon, Wed"]);
  });
  it("toggles completion days, kept sorted", () => {
    expect(toggleDay(["2026-10-12"], "2026-10-11", true)).toEqual(["2026-10-11", "2026-10-12"]);
    expect(toggleDay(["2026-10-11", "2026-10-12"], "2026-10-11", false)).toEqual(["2026-10-12"]);
  });
});

describe("streaks", () => {
  it("counts consecutive due days", () => {
    expect(streakOf(daily("RRULE:FREQ=DAILY", ["2026-10-11", "2026-10-12", "2026-10-13"]), TODAY)).toBe(3);
  });
  it("an unfinished today doesn't break it", () => {
    expect(streakOf(daily("RRULE:FREQ=DAILY", ["2026-10-11", "2026-10-12"]), TODAY)).toBe(2);
  });
  it("a missed day does", () => {
    expect(streakOf(daily("RRULE:FREQ=DAILY", ["2026-10-10", "2026-10-12"]), TODAY)).toBe(1);
  });
  it("days off don't count against it", () => {
    expect(streakOf(daily(MWF, ["2026-10-07", "2026-10-09", "2026-10-12"]), TODAY)).toBe(3);
  });
});

describe("XP for dailies", () => {
  async function setup() {
    const env = await makeStore();
    startLedger(env.bus, env.store);
    watchCompletions(env.bus, env.store);
    const xp = () => env.store.query({ type: XP_ENTRY }).reduce((s, e) => s + (e.data.amount as number), 0);
    const make = (title: string, difficulty: string) =>
      env.store.create({ type: DAILY, title, recurrence: "RRULE:FREQ=DAILY", data: { difficulty, doneDays: [] } }) as Promise<Daily>;
    const toggle = async (id: string, done: boolean) => {
      await setDone(env.store, env.store.get(id) as Daily, todayKey(), done);
      await settle();
    };
    return { ...env, xp, make, toggle };
  }

  it("awards by difficulty, plus a perfect-day bonus", async () => {
    const { xp, make, toggle } = await setup();
    const gym = await make("Gym", "hard");
    const read = await make("Read", "medium");
    await toggle(gym.id, true);
    expect(xp()).toBe(50);
    await toggle(read.id, true);
    expect(xp()).toBe(100); // 50 + 25 + 25 bonus
  });

  it("un-checking takes XP back; re-checking pays once", async () => {
    const { xp, make, toggle } = await setup();
    const gym = await make("Gym", "hard");
    await toggle(gym.id, true);
    await toggle(gym.id, false);
    expect(xp()).toBe(0);
    await toggle(gym.id, true);
    expect(xp()).toBe(75); // 50 + 25 perfect day (only daily)
  });

  it("the same award key never pays twice", async () => {
    const { bus, xp, make, toggle } = await setup();
    const gym = await make("Gym", "hard");
    await toggle(gym.id, true);
    bus.emit("xp.award", { key: `daily:${gym.id}:${todayKey()}`, amount: 50, reason: "dup", source: "test" });
    await settle();
    expect(xp()).toBe(75);
  });
});
