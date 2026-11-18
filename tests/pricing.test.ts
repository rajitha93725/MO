import { describe, expect, it } from "vitest";
import { addonsTotal, discountAmount, discountLabel, discountProblem, linePrice, parseAddons } from "../src/lib/calc/pricing";
import { receiptFromLines, receiptHtml, kitchenTicketHtml } from "../src/lib/receipt";
import { groupBills } from "../src/lib/calc/bills";
import { order } from "./fixtures";

describe("discounts", () => {
  it("% or Rs, never more than the amount", () => {
    expect(discountAmount(3700, "%", 10)).toBe(370);
    expect(discountAmount(3700, "%", 150)).toBe(3700);
    expect(discountAmount(3700, "Rs", 500)).toBe(500);
    expect(discountAmount(300, "Rs", 500)).toBe(300);
    expect(discountAmount(3700, "", 10)).toBe(0);
    expect(discountLabel("%", 12.5)).toBe("12.5%");
    expect(discountLabel("Rs", 200)).toBe("Rs 200");
  });
  it("flags bad discounts", () => {
    expect(discountProblem(1000, "%", 120)).toMatch(/100%/);
    expect(discountProblem(1000, "Rs", 1500)).toMatch(/more than/);
    expect(discountProblem(1000, "Rs", 0)).toMatch(/above 0/);
    expect(discountProblem(1000, "", 0)).toBeNull();
  });
});

describe("line price", () => {
  it("item discount is taken from the item only, not the add-ons", () => {
    // 2 × 1,850 = 3,700; 10% off = 370; + extra cheese 550 + 2 eggs 200
    const p = linePrice(2, 1850, [{ price: 550, qty: 1 }, { price: 100, qty: 2 }], "%", 10);
    expect(p).toEqual({ base: 3700, discount: 370, addons: 750, total: 4080 });
    expect(addonsTotal([{ price: 550, qty: 1 }])).toBe(550);
  });
  it("reads stored add-ons safely", () => {
    expect(parseAddons('[{"item_id":"X01","name":"Extra cheese","price":550,"qty":1,"cost":250}]')).toEqual([{ item_id: "X01", name: "Extra cheese", price: 550, qty: 1, cost: 250 }]);
    expect(parseAddons("not json")).toEqual([]);
    expect(parseAddons("")).toEqual([]);
  });
});

describe("invoice with discounts, add-ons, notes, offer and logo", () => {
  const base = { date: "2026-11-18", unit_cost: 0, order_id: "O1", invoice_no: "261118_021", status: "Paid" as const, payment_method: "Cash" as const };
  const lines = [
    order({ ...base, line_id: "O1-1", item_id: "B01", item_name: "Mo special Crepes", qty: 2, unit_price: 1850, line_total: 4080,
      discount_type: "%", discount_value: 10, discount_amount: 370, addons_total: 750, item_note: "Less spicy, Without onions",
      addons: JSON.stringify([{ item_id: "X01", name: "Extra cheese", price: 550, qty: 1, cost: 0 }, { item_id: "X04", name: "Extra egg", price: 100, qty: 2, cost: 0 }]), offer_text: "10% off breakfast tomorrow" }),
    order({ ...base, line_id: "O1-2", item_id: "D01", item_name: "Papaya juice", qty: 1, unit_price: 650, line_total: 650 }),
    order({ ...base, line_id: "O1-3", item_id: "BILL-DISCOUNT", item_name: "Bill discount 5%", qty: 1, unit_price: -237, line_total: -237, discount_type: "%", discount_value: 5, discount_amount: 237 }),
  ];
  const r = receiptFromLines(lines, (id) => (id === "B01" ? "SweetMO" : undefined));
  const h = receiptHtml(r, { receipt_name: "MO Cafe", receipt_address: "", receipt_footer: "Thanks", receipt_width_mm: 80, logo_url: "/logo.png" });
  it("bill discount is shown on its own, items keep their details", () => {
    expect(r.bill_discount).toEqual({ label: "5%", amount: 237 });
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ item_name: "SweetMO · Mo special Crepes", discount_label: "10%", discount_amount: 370, note: "Less spicy, Without onions" });
  });
  it("prints the logo, item discount, add-ons and note under the item, subtotal, bill discount, total and the offer", () => {
    expect(h).toContain('<img class="r-logo" src="/logo.png"');
    expect(h).toContain("Discount 10%</td><td class=\"num\">−370");
    expect(h).toContain("+ Extra cheese</td><td class=\"num\">550");
    expect(h).toContain("+ Extra egg × 2</td><td class=\"num\">200");
    expect(h).toContain("✎ Less spicy, Without onions");
    expect(h).toContain("<span>Subtotal</span><span>4,730</span>");
    expect(h).toContain("<span>Bill discount 5%</span><span>−237</span>");
    expect(h).toContain("<span>TOTAL (Rs)</span><span>4,493</span>");
    expect(h).toContain("You saved</span><span>607");
    expect(h).toContain("NEXT-DAY OFFER");
    expect(h).toContain("10% off breakfast tomorrow");
  });
  it("kitchen ticket shows add-ons and notes, no prices", () => {
    const k = kitchenTicketHtml(r);
    expect(k).toContain("+ Extra cheese");
    expect(k).toContain("✎ Less spicy");
    expect(k).not.toContain("550");
  });
  it("the bill keeps the discount line apart from the items", () => {
    const b = groupBills(lines)[0];
    expect([b.lines.length, b.items, b.subtotal, b.total, b.discount?.line_total]).toEqual([2, 3, 4730, 4493, -237]);
  });
});
