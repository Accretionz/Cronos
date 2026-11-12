import { describe, expect, it } from "vitest";
import { addDays, dayKey, dayOf } from "./date";

describe("date helpers", () => {
  it("formats a local day key", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });
  it("keeps plain day keys as-is (no UTC shift)", () => {
    expect(dayOf("2026-10-15")).toBe("2026-10-15");
  });
  it("reads local date-times as local days", () => {
    expect(dayOf("2026-10-15T23:30")).toBe("2026-10-15");
  });
});
