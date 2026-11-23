"use client";

import { printReceipt } from "@/components/printReceipt";
import type { ReceiptOrder, ReceiptSettings } from "@/lib/receipt";

/** Prints a sample receipt at the paper size in Settings, to set up and check the printer. */
export function TestPrint({ settings, today }: { settings: ReceiptSettings; today: string }) {
  const sample: ReceiptOrder = {
    order_id: "TEST", date: today, time: "12:00", meal: "Lunch", payment_method: "Cash", notes: "",
    invoice_no: "TEST PRINT", order_type: "Dine-in", table_no: "T1",
    lines: [
      { item_name: "Sample item one", qty: 2, unit_price: 1_200, line_total: 2_400 },
      { item_name: "Sample item with a longer name", qty: 1, unit_price: 1_850, line_total: 1_850 },
      { item_name: "Iced coffee", qty: 1, unit_price: 900, line_total: 900 },
    ],
  };
  const h = settings.receipt_height_mm;
  return (
    <div className="card">
      <b>Printer test</b>
      <div className="small muted" style={{ margin: "4px 0 8px" }}>
        Paper {settings.receipt_width_mm} mm wide × {h ? `${h} mm (label)` : "as long as the receipt (roll)"}. Change{" "}
        <code>receipt_width_mm</code> / <code>receipt_height_mm</code> above, save, then test. In the print window pick your
        printer (not “Save as PDF”), Margins: None or Default, and untick “Headers and footers”.
      </div>
      <button type="button" onClick={() => printReceipt(sample, settings)}>🖨 Test print</button>
    </div>
  );
}
