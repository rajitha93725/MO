import { describe, expect, it } from "vitest";
import { billLabel, busyTables, groupBills, nextLineNo, openBills } from "../src/lib/calc/bills";
import { isPaidLine, type OrderLine } from "../src/lib/types";
import { order } from "./fixtures";

const line = (p: Partial<OrderLine>) => order({ date: "2027-01-05", qty: 1, unit_price: 1000, unit_cost: 300, ...p });

describe("open bills", () => {
  const lines = [
    line({ order_id: "A", line_id: "A-1", status: "Open", order_type: "Dine-in", table_no: "Garden 2", time: "12:10" }),
    line({ order_id: "A", line_id: "A-2", status: "Open", order_type: "Dine-in", table_no: "Garden 2", qty: 2 }),
    line({ order_id: "A", line_id: "A-3", status: "Void", order_type: "Dine-in", table_no: "Garden 2", void_by: "Rajitha", void_reason: "Customer cancelled" }),
    line({ order_id: "B", line_id: "B-1", status: "Paid", order_type: "Take-away" }),
    line({ order_id: "C", line_id: "C-1", status: "", payment_method: "Cash" }), // old order: paid
    line({ order_id: "D", line_id: "D-1", status: "Void" }),
  ];
  it("groups lines into bills; voided items never count", () => {
    const a = groupBills(lines).find((b) => b.order_id === "A")!;
    expect([a.status, a.total, a.items, a.lines.length, a.voided.length]).toEqual(["Open", 3000, 3, 2, 1]);
    expect(groupBills(lines).find((b) => b.order_id === "D")!.status).toBe("Void");
    expect(groupBills(lines).find((b) => b.order_id === "C")!.status).toBe("Paid");
  });
  it("only open bills are listed, and their tables are busy", () => {
    expect(openBills(lines).map((b) => b.order_id)).toEqual(["A"]);
    expect(busyTables(openBills(lines))).toEqual({ "Garden 2": "A" });
  });
  it("sales count paid lines only (old lines without status are paid)", () => {
    expect(lines.filter(isPaidLine).map((l) => l.line_id)).toEqual(["B-1", "C-1"]);
  });
  it("new lines on a bill continue the numbering", () => {
    expect(nextLineNo(lines, "A")).toBe(4);
    expect(nextLineNo(lines, "NEW")).toBe(1);
  });
  it("labels", () => {
    expect(billLabel({ order_type: "Dine-in", table_no: "Upstairs 3", time: "12:00" })).toBe("🍽️ Upstairs 3");
    expect(billLabel({ order_type: "Take-away", table_no: "", time: "12:40" })).toBe("📦 Take-away 12:40");
  });
});
