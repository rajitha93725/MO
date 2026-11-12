import { describe, expect, it } from "vitest";
import { uberCommission, uberCostId, uberDay, uberPrice, UBER_COST_CATEGORY } from "../src/lib/calc/uber";
import { accountForPayment } from "../src/lib/calc/cash";
import { parseSettings } from "../src/lib/settings";
import { settings } from "./fixtures";
import type { DailyCost, OrderLine } from "../src/lib/types";

const s = { uber_markup_pct: 33.4, uber_commission_pct: 25 };

describe("Uber pricing", () => {
  it("adds 33.4% and rounds up to the next Rs 10", () => {
    expect(uberPrice(1850, s)).toBe(2470); // 1850 × 1.334 = 2467.9
    expect(uberPrice(650, s)).toBe(870); // 867.1
    expect(uberPrice(3850, s)).toBe(5140); // 5135.9
    expect(uberPrice(1500, s)).toBe(2010); // 2001
  });
  it("cafe keeps at least the menu price after a 25% commission", () => {
    for (const p of [650, 950, 1200, 1850, 2950, 3850]) {
      const u = uberPrice(p, s);
      expect(u - uberCommission(u, s)).toBeGreaterThanOrEqual(p);
    }
  });
  it("commission is a rounded % of the Uber total", () => {
    expect(uberCommission(2470, s)).toBe(618);
    expect(uberCommission(0, s)).toBe(0);
  });
  it("Uber money lands in the bank; commission is linked to the order", () => {
    expect(accountForPayment("Uber")).toBe("Bank");
    expect(uberCostId("ORD-1")).toBe("UC-ORD-1");
  });
});

describe("Uber settings", () => {
  it("defaults and keeps 'Uber commission' as a cost category", () => {
    const st = settings();
    expect([st.uber_markup_pct, st.uber_commission_pct]).toEqual([33.4, 25]);
    expect(st.cost_categories).toContain(UBER_COST_CATEGORY);
    expect(parseSettings([{ key: "cost_categories", value: "Gas,Uber commission", description: "" }], []).cost_categories).toEqual(["Gas", UBER_COST_CATEGORY]);
  });
  it("rejects a commission of 100% or more", () => {
    expect(() => parseSettings([{ key: "uber_commission_pct", value: "100", description: "" }], [])).toThrow(/uber_commission_pct/);
  });
});

describe("uberDay", () => {
  const line = (o: Partial<OrderLine>): OrderLine => ({
    line_id: "x", order_id: "o", date: "2027-01-05", time: "10:00", meal: "Lunch", item_id: "A01", item_name: "x",
    qty: 1, unit_price: 0, line_total: 0, unit_cost: 0, line_cost: 0, payment_method: "Cash", notes: "", entered_by: "", ...o,
  });
  const cost = (o: Partial<DailyCost>): DailyCost => ({
    cost_id: "c", date: "2027-01-05", category: UBER_COST_CATEGORY, description: "", amount: 0, paid_from: "Bank", paid_by: "Business", notes: "", entered_by: "", ...o,
  });
  it("sums Uber sales and commission for the day only", () => {
    const orders = [
      line({ payment_method: "Uber", line_total: 2470 }),
      line({ payment_method: "Uber", line_total: 870 }),
      line({ payment_method: "Cash", line_total: 1850 }),
      line({ payment_method: "Uber", line_total: 999, date: "2027-01-06" }),
    ];
    const costs = [cost({ amount: 835 }), cost({ amount: 50, category: "Gas & fuel" }), cost({ amount: 9, date: "2027-01-06" })];
    expect(uberDay("2027-01-05", orders, costs)).toEqual({ sales: 3340, commission: 835 });
  });
});
