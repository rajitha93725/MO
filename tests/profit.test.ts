import { describe, expect, it } from "vitest";
import { monthProfit, partnerShares, profitTable, totalProfit, yearToDate } from "../src/lib/calc/profit";
import { fixedCostsForMonth, isMonthlyActive, oneTimeAllocation, unpaidFixedCosts } from "../src/lib/calc/fixedCosts";
import { cost, monthly, oneTime, order, settings } from "./fixtures";
import type { FixedPayment } from "../src/lib/types";

const base = (o: Partial<Parameters<typeof monthProfit>[1]> = {}) => ({
  orders: [], dailyCosts: [], fixedCosts: [], fixedPayments: [], settings: settings(), ...o,
});

describe("monthProfit – core formulas", () => {
  const input = base({
    orders: [
      order({ date: "2026-12-01", qty: 2, unit_price: 1450, unit_cost: 450 }), // 2900 / 900
      order({ date: "2026-12-15", qty: 1, unit_price: 2450, unit_cost: 850 }), // 2450 / 850
      order({ date: "2027-01-02", qty: 5, unit_price: 1000, unit_cost: 100 }), // other month
    ],
    dailyCosts: [
      cost({ date: "2026-12-01", amount: 1200, category: "Food & ingredients" }),
      cost({ date: "2026-12-02", amount: 300, category: "Drinks & beverages" }),
      cost({ date: "2026-12-03", amount: 500, category: "Gas & fuel" }),
      cost({ date: "2027-01-03", amount: 9999 }),
    ],
    fixedCosts: [monthly({ amount: 3000, start_month: "2026-12" })],
  });
  const r = monthProfit("2026-12", input);

  it("sales = sum of line_total in month", () => expect(r.sales).toBe(5350));
  it("food cost = sum of line_cost (menu-based)", () => expect(r.foodCost).toBe(1750));
  it("daily costs = sum of Daily_Costs.amount in month", () => expect(r.dailyCosts).toBe(2000));
  it("fixed costs = active monthly costs", () => expect(r.fixedCosts).toBe(3000));
  it("total costs = daily + fixed", () => expect(r.totalCosts).toBe(5000));
  it("net profit = sales − total costs (menu food cost is NOT subtracted again)", () => expect(r.netProfit).toBe(350));
  it("net margin = net profit ÷ sales", () => expect(r.netMargin).toBeCloseTo(350 / 5350));
  it("food cost check uses food_check_categories only", () => {
    expect(r.actualFoodPurchases).toBe(1500);
    expect(r.foodCostDifference).toBe(1500 - 1750);
  });
  it("partner shares split net profit 50/50", () => {
    expect(r.partnerShares).toEqual([
      { name: "Rajitha", pct: 50, amount: 175 },
      { name: "Janith", pct: 50, amount: 175 },
    ]);
  });
});

describe("net margin edge case", () => {
  it("is null (shown as '-') when sales = 0", () => {
    const r = monthProfit("2026-12", base({ fixedCosts: [monthly({ amount: 1000, start_month: "2026-12" })] }));
    expect(r.sales).toBe(0);
    expect(r.netProfit).toBe(-1000);
    expect(r.netMargin).toBeNull();
  });
});

describe("partner split comes from Settings", () => {
  it("uses a 60/40 split", () => {
    const s = settings({ partners: "Rajitha:60,Janith:40" });
    expect(partnerShares(1000, s).map((x) => x.amount)).toEqual([600, 400]);
  });
  it("shares always add up to net profit exactly (rounding)", () => {
    const s = settings({ partners: "A:33.33,B:33.33,C:33.34" });
    const shares = partnerShares(1001, s);
    expect(shares.reduce((t, x) => t + x.amount, 0)).toBe(1001);
  });
  it("rejects a split that does not total 100", () => {
    expect(() => settings({ partners: "Rajitha:50,Janith:40" })).toThrow(/100/);
  });
  it("negative profit gives negative shares", () => {
    expect(partnerShares(-500, settings()).map((x) => x.amount)).toEqual([-250, -250]);
  });
});

describe("monthly fixed costs", () => {
  const s = settings();
  const rent = monthly({ amount: 100_000, start_month: "2026-12", end_month: "2027-08" });

  it("count from start_month to end_month", () => {
    expect(isMonthlyActive(rent, "2026-11", s)).toBe(false);
    expect(isMonthlyActive(rent, "2026-12", s)).toBe(true);
    expect(isMonthlyActive(rent, "2027-05", s)).toBe(true);
    expect(isMonthlyActive(rent, "2027-09", s)).toBe(false);
  });
  it("skip closed months (June–October by default)", () => {
    expect(isMonthlyActive(rent, "2027-06", s)).toBe(false);
    expect(isMonthlyActive(rent, "2027-08", s)).toBe(false);
  });
  it("open-ended when end_month is blank", () => {
    const r = monthly({ amount: 1, start_month: "2026-12" });
    expect(isMonthlyActive(r, "2030-01", s)).toBe(true);
  });
  it("closed months come from Settings", () => {
    const s2 = settings({ closed_months: "7,8" });
    expect(isMonthlyActive(rent, "2027-06", s2)).toBe(true);
    expect(isMonthlyActive(rent, "2027-07", s2)).toBe(false);
  });
  it("closed months have zero fixed costs and zero plan in profit", () => {
    const r = monthProfit("2027-07", base({ fixedCosts: [rent] }));
    expect(r.closed).toBe(true);
    expect(r.fixedCosts).toBe(0);
    expect(r.plannedSales).toBe(0);
  });
});

describe("one-time fixed costs", () => {
  const freezer = oneTime({ amount: 145_000, month_paid: "2027-01" });

  it("full: 100% in month paid", () => {
    const a = oneTimeAllocation(freezer, settings({ one_time_allocation: "full" }));
    expect([...a.entries()]).toEqual([["2027-01", 145_000]]);
  });
  it("spread: evenly over N open months, remainder to earliest, total exact", () => {
    const a = oneTimeAllocation(oneTime({ amount: 100_000, month_paid: "2027-01" }), settings({ one_time_allocation: "spread", one_time_spread_months: "3" }));
    expect([...a.entries()]).toEqual([["2027-01", 33_334], ["2027-02", 33_333], ["2027-03", 33_333]]);
  });
  it("spread skips closed months", () => {
    const a = oneTimeAllocation(oneTime({ amount: 60_000, month_paid: "2027-05" }), settings({ one_time_allocation: "spread", one_time_spread_months: "3" }));
    expect([...a.keys()]).toEqual(["2027-05", "2027-11", "2027-12"]);
    expect([...a.values()].reduce((t, v) => t + v, 0)).toBe(60_000);
  });
  it("is included in monthly profit", () => {
    const r = monthProfit("2027-01", base({ fixedCosts: [freezer] }));
    expect(r.fixedCosts).toBe(145_000);
  });
});

describe("planned vs actual fixed costs", () => {
  const rent = monthly({ fixed_id: "RENT", amount: 100_000, start_month: "2026-12" });
  const pay: FixedPayment = { payment_id: "P1", fixed_id: "RENT", month: "2026-12", amount: 95_000, paid_date: "2026-12-05", paid_from: "Bank", notes: "" };

  it("actual_when_paid uses the recorded payment", () => {
    const lines = fixedCostsForMonth("2026-12", [rent], [pay], settings({ fixed_profit_basis: "actual_when_paid" }));
    expect(lines[0]).toMatchObject({ planned: 100_000, actual: 95_000, paid: true, counted: 95_000 });
  });
  it("actual_when_paid falls back to the plan when unpaid", () => {
    const lines = fixedCostsForMonth("2027-01", [rent], [pay], settings());
    expect(lines[0]).toMatchObject({ planned: 100_000, actual: null, paid: false, counted: 100_000 });
  });
  it("planned basis ignores actual amount", () => {
    const lines = fixedCostsForMonth("2026-12", [rent], [pay], settings({ fixed_profit_basis: "planned" }));
    expect(lines[0].counted).toBe(100_000);
  });
  it("unpaid list shows only unpaid monthly costs", () => {
    expect(unpaidFixedCosts("2026-12", [rent], [pay], settings())).toHaveLength(0);
    expect(unpaidFixedCosts("2027-01", [rent], [pay], settings())).toHaveLength(1);
  });
});

describe("plan comparison, tables and YTD", () => {
  const input = base({
    orders: [
      order({ date: "2026-12-10", qty: 1, unit_price: 1_500_000, unit_cost: 0 }),
      order({ date: "2027-01-10", qty: 1, unit_price: 1_000_000, unit_cost: 0 }),
      order({ date: "2027-02-10", qty: 1, unit_price: 1_000_000, unit_cost: 0 }),
    ],
    fixedCosts: [monthly({ amount: 370_000, start_month: "2026-12" })],
  });

  it("compares to the target period for the month", () => {
    const r = monthProfit("2026-12", input);
    expect(r.plannedSales).toBe(1_375_000);
    expect(r.salesVsPlan).toBe(125_000);
    expect(r.plannedNetProfit).toBe(206_250);
    expect(r.profitVsPlan).toBe(1_130_000 - 206_250);
  });

  it("profitTable returns every month in range, closed ones included", () => {
    const rows = profitTable("2027-04", "2027-11", input);
    expect(rows.map((r) => r.month)).toEqual(["2027-04", "2027-05", "2027-06", "2027-07", "2027-08", "2027-09", "2027-10", "2027-11"]);
    expect(rows.filter((r) => r.closed).length).toBe(5);
  });

  it("YTD runs Jan..month of that year and equals the sum of month rows", () => {
    const ytd = yearToDate("2027-02", input);
    expect(ytd.months).toBe(2);
    expect(ytd.sales).toBe(2_000_000);
    expect(ytd.netProfit).toBe(2_000_000 - 2 * 370_000);
    expect(ytd.partnerShares.map((s) => s.amount)).toEqual([630_000, 630_000]);
  });

  it("YTD in the opening year starts at the opening month", () => {
    const ytd = yearToDate("2026-12", input);
    expect(ytd.months).toBe(1);
    expect(ytd.sales).toBe(1_500_000);
  });

  it("totals margin is '-' when no sales", () => {
    const t = totalProfit(profitTable("2027-06", "2027-08", input), input.settings);
    expect(t.netMargin).toBeNull();
  });
});
