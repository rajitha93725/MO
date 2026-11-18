import { describe, expect, it } from "vitest";
import { mealForTime } from "../src/lib/calc/meal";

describe("meal from the order time", () => {
  it("follows the cafe's time bands", () => {
    const cases: [string, string][] = [
      ["00:00", "Dinner"], ["00:01", "Breakfast"], ["07:45", "Breakfast"], ["11:30", "Breakfast"],
      ["11:31", "Lunch"], ["14:00", "Lunch"], ["16:59", "Lunch"],
      ["17:00", "Dinner"], ["21:15", "Dinner"], ["23:59", "Dinner"],
    ];
    for (const [t, meal] of cases) expect([t, mealForTime(t)]).toEqual([t, meal]);
  });
  it("accepts times with seconds", () => {
    expect(mealForTime("11:30:59")).toBe("Breakfast");
  });
});
