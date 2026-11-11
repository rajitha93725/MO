import { describe, expect, it } from "vitest";
import { cafeReport, groupOrders, ownerReport } from "../src/lib/calc/report";
import { monthProfit } from "../src/lib/calc/profit";
import { commissionFor, netPayoutFor, nightsBetween } from "../src/lib/calc/villa";
import { cost, monthly, order, settings } from "./fixtures";
import type { CashMovement, MenuItem, VillaRecord } from "../src/lib/types";

const s = settings();
const menu: MenuItem[] = [
  { item_id: "A01", category: "All day dining", sub_category: "", item_name: "Rice & curry", unit_cost: 400, selling_price: 1000, active: true, description: "" },
  { item_id: "D01", category: "Drinks", sub_category: "", item_name: "Lime juice", unit_cost: 100, selling_price: 500, active: true, description: "" },
];
const L = (o: string, date: string, item: "A01" | "D01", qty: number, extra: Partial<Parameters<typeof order>[0]> = {}) => {
  const m = menu.find((x) => x.item_id === item)!;
  return order({ order_id: o, date, item_id: item, item_name: m.item_name, qty, unit_price: m.selling_price, unit_cost: m.unit_cost, ...extra });
};

const orders = [
  L("O1", "2027-01-05", "A01", 2, { meal: "Lunch", time: "12:10", payment_method: "Cash" }),
  L("O1", "2027-01-05", "D01", 2, { meal: "Lunch", time: "12:10", payment_method: "Cash" }),
  L("O2", "2027-01-05", "A01", 1, { meal: "Dinner", time: "19:30", payment_method: "Card" }),
  L("O3", "2027-01-20", "D01", 4, { meal: "Breakfast", time: "08:00", payment_method: "Bank transfer" }),
  L("O4", "2026-12-28", "A01", 3, { meal: "Lunch", payment_method: "Cash" }), // previous month
];
const dailyCosts = [
  cost({ date: "2027-01-03", amount: 2_000, category: "Food & ingredients", paid_from: "Petty cash" }),
  cost({ date: "2027-01-10", amount: 1_000, category: "Gas & fuel", paid_from: "Bank" }),
  cost({ date: "2027-01-12", amount: 500, category: "Food & ingredients", paid_from: "Petty cash", paid_by: "Rajitha" }),
  cost({ date: "2026-12-30", amount: 9_999, category: "Other" }), // previous month
];
const fixedCosts = [monthly({ amount: 3_000, start_month: "2026-12" })];
const input = { orders, dailyCosts, fixedCosts, fixedPayments: [], settings: s };
const r = cafeReport("2027-01", input, menu);

describe("cafe monthly report", () => {
  it("uses the same profit figures as the profit page", () => {
    expect(r.profit).toEqual(monthProfit("2027-01", input));
    expect(r.previous).toEqual(monthProfit("2026-12", input));
    expect(r.profit.sales).toBe(2_000 + 1_000 + 1_000 + 2_000);
  });

  it("counts orders, items, average order and trading days", () => {
    expect(r.orders).toBe(3);
    expect(r.itemsSold).toBe(2 + 2 + 1 + 4);
    expect(r.avgOrderValue).toBe(2_000); // 6,000 / 3
    expect(r.tradingDays).toBe(2);
    expect(r.bestDay).toEqual({ date: "2027-01-05", sales: 4_000 });
    expect(r.days).toHaveLength(31);
  });

  it("groups orders into one row per order with an item summary", () => {
    expect(r.orderList.map((o) => [o.order_id, o.items, o.total])).toEqual([
      ["O1", "2× Rice & curry, 2× Lime juice", 3_000],
      ["O2", "1× Rice & curry", 1_000],
      ["O3", "4× Lime juice", 2_000],
    ]);
    expect(groupOrders([])).toEqual([]);
  });

  it("splits sales by meal, payment method and menu category, each adding up to sales", () => {
    expect(r.byMeal.map((m) => [m.name, m.amount, m.orders])).toEqual([["Breakfast", 2_000, 1], ["Lunch", 3_000, 1], ["Dinner", 1_000, 1]]);
    expect(r.byPayment.map((m) => [m.name, m.amount, m.count])).toEqual([["Cash", 3_000, 1], ["Card", 1_000, 1], ["Bank transfer", 2_000, 1]]);
    expect(r.byCategory.map((m) => [m.name, m.amount])).toEqual([["All day dining", 3_000], ["Drinks", 3_000]]);
    for (const g of [r.byMeal, r.byPayment, r.byCategory]) expect(g.reduce((a, x) => a + x.amount, 0)).toBe(r.profit.sales);
  });

  it("ranks items by sales with food cost %", () => {
    const rice = r.items.find((i) => i.item_id === "A01")!;
    expect([rice.qty, rice.sales, rice.foodCost, rice.grossProfit]).toEqual([3, 3_000, 1_200, 1_800]);
    expect(rice.foodCostPct).toBeCloseTo(0.4);
  });

  it("summarises daily costs by category, account and payer, matching profit", () => {
    expect(r.costList).toHaveLength(3);
    expect(r.costsByCategory.map((c) => [c.name, c.amount, c.count])).toEqual([["Food & ingredients", 2_500, 2], ["Gas & fuel", 1_000, 1]]);
    expect(r.costsByAccount.map((c) => [c.name, c.amount])).toEqual([["Petty cash", 2_500], ["Bank", 1_000]]);
    expect(r.costsByPaidBy.find((c) => c.name === "Rajitha")!.amount).toBe(500);
    expect(r.costsByCategory.reduce((a, c) => a + c.amount, 0)).toBe(r.profit.dailyCosts);
  });

  it("lists fixed costs counted in the month", () => {
    expect(r.fixed.reduce((a, f) => a + f.counted, 0)).toBe(r.profit.fixedCosts);
    expect(r.fixed[0].paid).toBe(false);
  });

  it("an empty month gives zeros, not errors", () => {
    const e = cafeReport("2027-03", input, menu);
    expect([e.orders, e.tradingDays, e.avgOrderValue, e.bestDay, e.items.length]).toEqual([0, 0, null, null, 0]);
    expect(e.byPayment.map((p) => p.amount)).toEqual([0, 0, 0]);
  });
});

describe("owner report (villa, combined, cash)", () => {
  const blank: VillaRecord = {
    record_id: "", record_type: "Booking", date_entered: "2027-01-01", room_number: "Room 1", room_type: "Double", platform: "Airbnb",
    booking_ref: "", guest_name: "", guests: 2, check_in: "", check_out: "", nights: 0, status: "Confirmed", total_price: 0,
    commission_pct: 10, commission_amount: 0, booking_costs: 0, net_payout: 0, payout_status: "Pending", payout_date: "",
    received_to: "", cost_category: "", cost_description: "", cost_amount: 0, cost_room: "", paid_from: "", notes: "",
  };
  const bk = (p: Partial<VillaRecord>): VillaRecord => {
    const b = { ...blank, ...p };
    b.nights = nightsBetween(b.check_in, b.check_out);
    b.commission_amount = commissionFor(b.total_price, b.commission_pct);
    b.net_payout = netPayoutFor(b.total_price, b.commission_amount, b.booking_costs);
    return b;
  };
  const villa = [
    bk({ record_id: "B1", check_in: "2027-01-30", check_out: "2027-02-02", total_price: 30_000 }), // 2 nights Jan, 1 Feb
    bk({ record_id: "B2", room_number: "Room 2", check_in: "2027-01-10", check_out: "2027-01-12", total_price: 0, status: "Cancelled" }), // no cancellation fee
    bk({ record_id: "B3", check_in: "2027-03-01", check_out: "2027-03-03", total_price: 8_000 }),
    { ...blank, record_id: "C1", record_type: "Cost" as const, status: "" as const, payout_status: "" as const, date_entered: "2027-01-15", cost_amount: 1_500, cost_room: "All rooms", paid_from: "Bank" as const },
  ];
  const movements: CashMovement[] = [
    { movement_id: "M1", date: "2026-12-01", account: "Bank", type: "Opening balance", amount: 100_000, notes: "", moved_by: "Rajitha" },
    { movement_id: "M2", date: "2027-01-08", account: "Petty cash", type: "Top-up", amount: 5_000, notes: "", moved_by: "Janith" },
  ];
  const o = ownerReport("2027-01", input, villa, { orders, dailyCosts, fixedCosts, fixedPayments: [], movements, villa, capital: [] });

  it("lists bookings touching the month with their share of nights and gross", () => {
    expect(o.villaBookings.map((b) => [b.record_id, b.monthNights, b.monthGross])).toEqual([["B2", 0, 0], ["B1", 2, 20_000]]);
    expect(o.villa.gross).toBe(20_000);
    expect(o.villaCosts.map((c) => c.record_id)).toEqual(["C1"]);
  });

  it("combined profit and shares add up", () => {
    expect(o.combined.total).toBe(o.combined.cafe + o.combined.villa);
    expect(o.combined.shares.reduce((a, x) => a + x.amount, 0)).toBe(o.combined.total);
  });

  it("cash opening = previous month end, closing = month end", () => {
    const pc = o.cash.find((c) => c.account === "Petty cash")!;
    const bank = o.cash.find((c) => c.account === "Bank")!;
    expect(o.movements.map((m) => m.movement_id)).toEqual(["M2"]);
    expect(pc.change).toBe(pc.closing - pc.opening);
    // Bank: Dec opening 100,000 + Dec card sales 0 − Dec costs paid from bank … opening is whatever Dec ended with.
    expect(bank.closing - bank.opening).toBe(1_000 /* card */ + 2_000 /* transfer */ - 1_000 /* gas */ - 1_500 /* villa cost */);
  });
});
