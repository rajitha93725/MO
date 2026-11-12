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
    `<div class="r-row"><span>${esc(o.date)} ${esc(o.time)}</span><span>${esc(o.meal)}</span></div>`,
    `<div>Order ${esc(o.order_id)}</div>`,
    `<div class="r-rule"></div>`,
    `<table><tbody>${rows}</tbody></table>`,
    `<div class="r-rule"></div>`,
    `<div class="r-row r-total"><span>TOTAL (Rs)</span><span>${n(total)}</span></div>`,
    `<div class="r-row"><span>Paid by</span><span>${esc(o.payment_method)}</span></div>`,
    `<div class="r-row"><span>Items</span><span>${n(items)}</span></div>`,
    o.notes ? `<div class="r-small">Note: ${esc(o.notes)}</div>` : "",
    `<div class="r-rule"></div>`,
    s.receipt_footer ? `<div class="r-center">${esc(s.receipt_footer)}</div>` : "",
  ].join("");
}

/** @page rule for the receipt paper width. */
export function receiptPageCss(widthMm: number): string {
  return `@page { size: ${widthMm}mm auto; margin: 3mm; }`;
}
