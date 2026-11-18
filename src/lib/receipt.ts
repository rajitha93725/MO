// Receipt markup shared by the receipt page and background printing on the order screen.
// Pure (no server or browser APIs), so it runs on both sides.

export interface ReceiptLine {
  item_name: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

export interface ReceiptOrder {
  order_id: string;
  date: string;
  time: string;
  meal: string;
  payment_method: string;
  notes: string;
  lines: ReceiptLine[];
  /** Dine-in / Take-away / Uber, printed big for the kitchen (missing on old orders). */
  order_type?: string;
  table_no?: string;
  /** "Open" = bill shown before payment (prints "NOT PAID"). */
  status?: string;
}

/** Kitchen line: where the food goes. */
export function serviceLine(o: Pick<ReceiptOrder, "order_type" | "table_no">): string {
  if (o.order_type === "Dine-in") return `DINE-IN · ${o.table_no || "no table"}`;
  if (o.order_type === "Take-away") return "TAKE-AWAY · PACK";
  if (o.order_type === "Uber") return "UBER · PACK";
  return "";
}

export interface ReceiptSettings {
  receipt_name: string;
  receipt_address: string;
  receipt_footer: string;
  receipt_width_mm: number;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const n = (v: number) => Math.round(v).toLocaleString("en-US");

/** Inner HTML of a `.receipt` box (uses the .receipt / .r-* styles in globals.css). */
export function receiptHtml(o: ReceiptOrder, s: ReceiptSettings): string {
  const total = o.lines.reduce((t, l) => t + l.line_total, 0);
  const items = o.lines.reduce((t, l) => t + l.qty, 0);
  const rows = o.lines
    .map((l) => `<tr><td>${esc(l.item_name)}<div class="r-small">${n(l.qty)} × ${n(l.unit_price)}</div></td><td class="num">${n(l.line_total)}</td></tr>`)
    .join("");
  return [
    `<div class="r-center"><div class="r-title">${esc(s.receipt_name)}</div>${s.receipt_address ? `<div>${esc(s.receipt_address)}</div>` : ""}</div>`,
    `<div class="r-rule"></div>`,
    serviceLine(o) ? `<div class="r-service">${esc(serviceLine(o))}</div><div class="r-rule"></div>` : "",
    `<div class="r-row"><span>${esc(o.date)} ${esc(o.time)}</span><span>${esc(o.meal)}</span></div>`,
    `<div>Order ${esc(o.order_id)}</div>`,
    `<div class="r-rule"></div>`,
    `<table><tbody>${rows}</tbody></table>`,
    `<div class="r-rule"></div>`,
    `<div class="r-row r-total"><span>TOTAL (Rs)</span><span>${n(total)}</span></div>`,
    o.status === "Open"
      ? `<div class="r-row"><span>Payment</span><span><b>NOT PAID YET</b></span></div>`
      : `<div class="r-row"><span>Paid by</span><span>${esc(o.payment_method)}</span></div>`,
    `<div class="r-row"><span>Items</span><span>${n(items)}</span></div>`,
    o.notes ? `<div class="r-small">Note: ${esc(o.notes)}</div>` : "",
    `<div class="r-rule"></div>`,
    s.receipt_footer ? `<div class="r-center">${esc(s.receipt_footer)}</div>` : "",
  ].join("");
}

/**
 * Kitchen ticket: where it goes and what to make, no prices. `addOn` = items added to a bill that is already open.
 */
export function kitchenTicketHtml(o: ReceiptOrder, addOn = false): string {
  const rows = o.lines.map((l) => `<tr><td class="k-qty">${n(l.qty)} ×</td><td class="k-item">${esc(l.item_name)}</td></tr>`).join("");
  return [
    `<div class="r-center r-title">KITCHEN${addOn ? " · ADD-ON" : ""}</div>`,
    `<div class="r-rule"></div>`,
    serviceLine(o) ? `<div class="r-service">${esc(serviceLine(o))}</div>` : "",
    `<div class="r-row"><span>${esc(o.date)} ${esc(o.time)}</span><span>${esc(o.order_id.slice(-4))}</span></div>`,
    `<div class="r-rule"></div>`,
    `<table><tbody>${rows}</tbody></table>`,
    o.notes ? `<div class="r-rule"></div><div class="k-note">Note: ${esc(o.notes)}</div>` : "",
  ].join("");
}

/** Name on the receipt: the menu sub-category in front ("SweetMO · Mo special Crepes"), unless it repeats the name. */
export function receiptItemName(itemName: string, subCategory?: string): string {
  return subCategory && subCategory !== itemName ? `${subCategory} · ${itemName}` : itemName;
}

/** @page rule for the receipt paper width. */
export function receiptPageCss(widthMm: number): string {
  return `@page { size: ${widthMm}mm auto; margin: 3mm; }`;
}
