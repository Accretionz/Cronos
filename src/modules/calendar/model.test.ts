import { describe, expect, it } from "vitest";
import type { Item } from "../../core";
import { fromRecurrence, occurrences, toRecurrence } from "./model";

const ev = (scheduledFor: string, recurrence?: string) =>
  ({ id: "x", type: "event", title: "t", status: "open", scheduledFor, recurrence, tags: [], data: {}, createdAt: "", updatedAt: "" }) as Item;

describe("calendar occurrences", () => {
  it("one-off events", () => {
    expect(occurrences(ev("2026-10-12"), "2026-10-01", "2026-10-31")).toEqual(["2026-10-12"]);
    expect(occurrences(ev("2026-10-12T09:30"), "2026-10-01", "2026-10-31")).toEqual(["2026-10-12"]);
    expect(occurrences(ev("2026-11-12"), "2026-10-01", "2026-10-31")).toEqual([]);
  });
  it("weekly from an earlier start", () => {
    expect(occurrences(ev("2026-09-01", toRecurrence("weekly")), "2026-10-01", "2026-10-31")).toEqual([
      "2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27",
    ]);
  });
  it("daily across a month boundary and a DST change", () => {
    expect(occurrences(ev("2026-10-29", toRecurrence("daily")), "2026-10-01", "2026-11-02")).toEqual([
      "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02",
    ]);
  });
  it("monthly on the 31st skips short months", () => {
    expect(occurrences(ev("2026-01-31", toRecurrence("monthly")), "2026-01-01", "2026-05-31")).toEqual([
      "2026-01-31", "2026-03-31", "2026-05-31",
    ]);
  });
  it("yearly on a leap day, and across a year boundary", () => {
    expect(occurrences(ev("2020-02-29", toRecurrence("yearly")), "2023-01-01", "2024-12-31")).toEqual(["2024-02-29"]);
    expect(occurrences(ev("2026-12-25", toRecurrence("yearly")), "2026-11-29", "2027-01-02")).toEqual(["2026-12-25"]);
  });
  it("parses stored repeat rules", () => {
    expect(fromRecurrence("RRULE:FREQ=WEEKLY")).toBe("weekly");
    expect(fromRecurrence(undefined)).toBe("none");
  });
});
