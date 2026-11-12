import { describe, expect, it } from "vitest";
import { levelFromXp, xpForNextLevel } from "./model";

describe("levels", () => {
  it("each level costs 50 more than the last", () => {
    expect([xpForNextLevel(1), xpForNextLevel(2), xpForNextLevel(5)]).toEqual([100, 150, 300]);
  });
  it("works out level and progress from total XP", () => {
    expect(levelFromXp(0)).toEqual({ level: 1, into: 0, needed: 100, total: 0 });
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100)).toEqual({ level: 2, into: 0, needed: 150, total: 100 });
    expect(levelFromXp(260)).toEqual({ level: 3, into: 10, needed: 200, total: 260 });
  });
});
