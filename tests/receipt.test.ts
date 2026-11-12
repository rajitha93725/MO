import { describe, expect, it } from "vitest";
import { receiptHtml, receiptPageCss } from "../src/lib/receipt";

const settings = { receipt_name: "MO Cafe", receipt_address: "Galle Rd", receipt_footer: "Thank you!", receipt_width_mm: 80 };
const order = {
  order_id: "ORD-1", date: "2026-11-12", time: "11:15", meal: "Lunch", payment_method: "Card", notes: "Table 4",
  lines: [
    { item_name: "Chicken Caesar salad", qty: 2, unit_price: 1950, line_total: 3900 },
    { item_name: "Samahan iced tea", qty: 1, unit_price: 1100, line_total: 1100 },
  ],
};

describe("receipt", () => {
  it("shows header, items, total, payment, item count, note and footer", () => {
    const h = receiptHtml(order, settings);
    for (const s of ["MO Cafe", "Galle Rd", "2026-11-12 11:15", "Lunch", "Order ORD-1", "Chicken Caesar salad", "2 × 1,950", "3,900", "TOTAL (Rs)", "5,000", "Card", "Note: Table 4", "Thank you!"])
      expect(h).toContain(s);
    expect(h).toMatch(/Items<\/span><span>3</);
  });
  it("escapes text so a note cannot inject HTML", () => {
    const h = receiptHtml({ ...order, notes: '<img src=x onerror="alert(1)">' }, settings);
    expect(h).not.toContain("<img");
    expect(h).toContain("&lt;img");
  });
  it("leaves out empty address, note and footer", () => {
    const h = receiptHtml({ ...order, notes: "" }, { ...settings, receipt_address: "", receipt_footer: "" });
    expect(h).not.toContain("Note:");
    expect(h.match(/r-center/g)).toHaveLength(1);
  });
  it("sets the paper width", () => {
    expect(receiptPageCss(58)).toBe("@page { size: 58mm auto; margin: 3mm; }");
  });
});
