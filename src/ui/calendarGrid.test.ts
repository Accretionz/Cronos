import { describe, expect, it } from "vitest";
import { addMonths, clampDay, isDayKey, monthGrid, monthInRange, weekdayOf, withMonth, yearInRange, yearPageStart } from "./calendarGrid";

describe("date picker grid", () => {
  it("shows six whole weeks starting on Sunday", () => {
    const g = monthGrid("2026-11-13");
    expect(g).toHaveLength(42);
    expect(g[0]).toBe("2026-11-01"); // Nov 1 2026 is a Sunday
    expect(weekdayOf(g[0])).toBe(0);
    expect(g[41]).toBe("2026-12-12");
  });

  it("pads from the previous month", () => {
    const g = monthGrid("2026-10-05"); // Oct 1 2026 is a Thursday
    expect(g[0]).toBe("2026-09-27");
    expect(g[4]).toBe("2026-10-01");
  });

  it("moves months without spilling into the next one", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-01-15", -12)).toBe("2025-01-15");
  });

  it("checks day keys and bounds", () => {
    expect(isDayKey("2026-02-29")).toBe(false);
    expect(isDayKey("2028-02-29")).toBe(true);
    expect(isDayKey("")).toBe(false);
    expect(clampDay("2026-01-01", "2026-02-01")).toBe("2026-02-01");
    expect(clampDay("2026-05-01", undefined, "2026-04-30")).toBe("2026-04-30");
  });

  it("jumps to another month or year without spilling over", () => {
    expect(withMonth("2026-01-31", 2026, 1)).toBe("2026-02-28");
    expect(withMonth("2028-02-29", 2027, 1)).toBe("2027-02-28");
    expect(withMonth("2026-11-13", 1999, 4)).toBe("1999-05-13");
  });

  it("pages years in twelves", () => {
    expect(yearPageStart(2026)).toBe(2016);
    expect(yearPageStart(2027)).toBe(2016);
    expect(yearPageStart(2028)).toBe(2028);
  });

  it("knows which months and years can be picked", () => {
    expect(monthInRange(2026, 10, undefined, "2026-11-13")).toBe(true);
    expect(monthInRange(2026, 11, undefined, "2026-11-13")).toBe(false);
    expect(monthInRange(2026, 0, "2026-01-31")).toBe(true);
    expect(yearInRange(2027, undefined, "2026-11-13")).toBe(false);
    expect(yearInRange(2026, "2026-12-31")).toBe(true);
  });
});
