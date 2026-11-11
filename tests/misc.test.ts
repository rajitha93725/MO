import { describe, expect, it } from "vitest";
import { activeTodos, daySummary, doneTodos, menuStats, todoUrgency } from "../src/lib/calc/daily";
import { V, ValidationError } from "../src/lib/validate";
import { toCsv } from "../src/components/csv";
import { order, settings } from "./fixtures";
import type { Todo } from "../src/lib/types";

describe("daily view", () => {
  it("splits sales and food cost by meal and compares to the daily target", () => {
    const orders = [
      order({ date: "2026-12-05", meal: "Breakfast", qty: 2, unit_price: 1_000, unit_cost: 400 }),
      order({ date: "2026-12-05", meal: "Dinner", qty: 10, unit_price: 3_000, unit_cost: 1_000 }),
      order({ date: "2026-12-06", meal: "Dinner", qty: 1, unit_price: 9_999, unit_cost: 1 }),
    ];
    const d = daySummary("2026-12-05", orders, settings());
    expect(d.meals.map((m) => m.sales)).toEqual([2_000, 0, 30_000]);
    expect(d.sales).toBe(32_000);
    expect(d.foodCost).toBe(10_800);
    expect(d.grossProfit).toBe(21_200);
    expect(d.target).toBe(55_000); // first-3-months daily target
    expect(d.vsTarget).toBe(-23_000);
    expect(d.meals[1].foodCostPct).toBeNull();
  });
});

describe("menu food cost %", () => {
  it("flags items above the Settings target", () => {
    expect(menuStats({ unit_cost: 450, selling_price: 1100 }, settings()).aboveTarget).toBe(true); // 40.9%
    expect(menuStats({ unit_cost: 1800, selling_price: 4500 }, settings()).aboveTarget).toBe(false); // exactly 40%
    expect(menuStats({ unit_cost: 450, selling_price: 1100 }, settings({ food_cost_target_pct: "45" })).aboveTarget).toBe(false);
  });
});

describe("to-do", () => {
  const t = (p: Partial<Todo>): Todo => ({ task_id: Math.random().toString(), task: "x", owner: "Staff", due_date: "", priority: "Low", done: false, done_date: "", booking_id: "", ...p });
  it("red when overdue, amber within N days", () => {
    const s = settings();
    expect(todoUrgency(t({ due_date: "2027-01-09" }), "2027-01-10", s)).toBe("overdue");
    expect(todoUrgency(t({ due_date: "2027-01-13" }), "2027-01-10", s)).toBe("soon");
    expect(todoUrgency(t({ due_date: "2027-01-14" }), "2027-01-10", s)).toBe("normal");
  });
  it("active list hides done tasks and sorts by due date", () => {
    const list = [t({ task: "b", due_date: "2027-02-01" }), t({ task: "done", done: true, done_date: "2027-01-01" }), t({ task: "a", due_date: "2027-01-01" })];
    expect(activeTodos(list).map((x) => x.task)).toEqual(["a", "b"]);
    expect(doneTodos(list).map((x) => x.task)).toEqual(["done"]);
  });
});

describe("validation", () => {
  it("rejects negative / non-numeric / fractional amounts and missing dates", () => {
    const v = new V();
    v.amount("Amount", "-5");
    v.amount("Amount2", "abc");
    v.amount("Amount3", "10.5");
    v.date("Date", "");
    v.qty("Qty", 0);
    expect(() => v.done()).toThrow(ValidationError);
    expect(v.errors).toHaveLength(5);
  });
  it("accepts good values", () => {
    const v = new V();
    expect(v.amount("Amount", "1,250")).toBe(1250);
    expect(v.date("Date", "2026-12-01")).toBe("2026-12-01");
    expect(() => v.done()).not.toThrow();
  });
});

describe("CSV export", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"'], ["line\nbreak", 5]])).toBe('a,b\r\n"x,y","say ""hi"""\r\n"line\nbreak",5');
  });
});
