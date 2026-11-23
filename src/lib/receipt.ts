// Receipt markup shared by the receipt page and background printing on the order screen.
// Pure (no server or browser APIs), so it runs on both sides.

import type { OrderLine } from "./types";
import { orderTypeOf } from "./types";
import { discountLabel, isDiscountLine, parseAddons } from "./calc/pricing";

export interface ReceiptLine {
  item_name: string;
  qty: number;
  unit_price: number;
  /** Final line amount: qty × unit price − item discount + add-ons. */
  line_total: number;
  /** Kitchen note (allergies, less spicy, …). */
  note?: string;
  /** Paid add-ons on this item. */
  addons?: { name: string; qty: number; price: number }[];
  /** Item discount, e.g. "10%" or "Rs 200", and its amount in rupees. */
  discount_label?: string;
  discount_amount?: number;
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
  /** YYMMDD_NNN, or the Uber invoice number. */
  invoice_no?: string;
  /** Bill discount, e.g. { label: "5%", amount: 330 }. */
  bill_discount?: { label: string; amount: number };
  /** Next-day offer printed at the bottom. */
  offer_text?: string;
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
  /** Paper length in mm for labels; 0 / missing = as long as the receipt (roll paper). */
  receipt_height_mm?: number;
  /** Longest page for roll paper (mm); a longer receipt continues on the next page instead of being shrunk. */
  receipt_max_page_mm?: number;
  /** Printed text size in px (Settings: receipt_font_px); headings scale with it. */
  receipt_font_px?: number;
  /** Logo printed at the top (e.g. "/logo.png"). */
  logo_url?: string;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const n = (v: number) => Math.round(v).toLocaleString("en-US");

/** The lines printed under an item: its discount, add-ons and kitchen note. */
function itemDetails(l: ReceiptLine, prices: boolean): string {
  const out: string[] = [];
  if (prices && l.discount_amount) out.push(`<tr class="r-sub"><td>&nbsp;&nbsp;Discount ${esc(l.discount_label ?? "")}</td><td class="num">−${n(l.discount_amount)}</td></tr>`);
  for (const a of l.addons ?? []) {
    out.push(prices
      ? `<tr class="r-sub"><td>&nbsp;&nbsp;+ ${esc(a.name)}${a.qty > 1 ? ` × ${n(a.qty)}` : ""}</td><td class="num">${n(a.price * a.qty)}</td></tr>`
      : `<tr class="k-sub"><td></td><td>+ ${esc(a.name)}${a.qty > 1 ? ` × ${n(a.qty)}` : ""}</td></tr>`);
  }
  if (l.note) out.push(prices ? `<tr class="r-sub"><td colspan="2">&nbsp;&nbsp;✎ ${esc(l.note)}</td></tr>` : `<tr class="k-sub"><td></td><td>✎ ${esc(l.note)}</td></tr>`);
  return out.join("");
}

/** Inner HTML of a `.receipt` box (uses the .receipt / .r-* styles in globals.css). */
export function receiptHtml(o: ReceiptOrder, s: ReceiptSettings): string {
  const subtotal = o.lines.reduce((t, l) => t + l.line_total, 0);
  const billDisc = o.bill_discount?.amount ?? 0;
  const total = subtotal - billDisc;
  const items = o.lines.reduce((t, l) => t + l.qty, 0);
  const itemDisc = o.lines.reduce((t, l) => t + (l.discount_amount ?? 0), 0);
  const rows = o.lines
    .map((l) => `<tr><td>${esc(l.item_name)}<div class="r-small">${n(l.qty)} × ${n(l.unit_price)}</div></td><td class="num">${n(l.qty * l.unit_price)}</td></tr>${itemDetails(l, true)}`)
    .join("");
  return [
    s.logo_url ? `<div class="r-logo-wrap"><img class="r-logo" src="${esc(s.logo_url)}" alt=""></div>` : "",
    `<div class="r-center"><div class="r-title">${esc(s.receipt_name)}</div>${s.receipt_address ? `<div>${esc(s.receipt_address)}</div>` : ""}</div>`,
    `<div class="r-rule"></div>`,
    serviceLine(o) ? `<div class="r-service">${esc(serviceLine(o))}</div><div class="r-rule"></div>` : "",
    `<div class="r-row"><span>${esc(o.date)} ${esc(o.time)}</span><span>${esc(o.meal)}</span></div>`,
    o.invoice_no ? `<div class="r-row"><span>Invoice</span><b>${esc(o.invoice_no)}</b></div>` : `<div>Order ${esc(o.order_id)}</div>`,
    `<div class="r-rule"></div>`,
    `<table><tbody>${rows}</tbody></table>`,
    `<div class="r-rule"></div>`,
    billDisc || itemDisc ? `<div class="r-row"><span>Subtotal</span><span>${n(subtotal)}</span></div>` : "",
    itemDisc ? `<div class="r-row r-small"><span>(item discounts included: −${n(itemDisc)})</span><span></span></div>` : "",
    billDisc ? `<div class="r-row"><span>Bill discount ${esc(o.bill_discount?.label ?? "")}</span><span>−${n(billDisc)}</span></div>` : "",
    `<div class="r-row r-total"><span>TOTAL (Rs)</span><span>${n(total)}</span></div>`,
    itemDisc + billDisc ? `<div class="r-row r-small"><span>You saved</span><span>${n(itemDisc + billDisc)}</span></div>` : "",
    o.status === "Open"
      ? `<div class="r-row"><span>Payment</span><span><b>NOT PAID YET</b></span></div>`
      : `<div class="r-row"><span>Paid by</span><span>${esc(o.payment_method)}</span></div>`,
    `<div class="r-row"><span>Items</span><span>${n(items)}</span></div>`,
    o.notes ? `<div class="r-small">Note: ${esc(o.notes)}</div>` : "",
    `<div class="r-rule"></div>`,
    o.offer_text ? `<div class="r-offer"><div class="r-offer-title">🎁 NEXT-DAY OFFER</div><div>${esc(o.offer_text)}</div></div>` : "",
    s.receipt_footer ? `<div class="r-center">${esc(s.receipt_footer)}</div>` : "",
  ].join("");
}

/**
 * Kitchen ticket: where it goes and what to make, no prices. `addOn` = items added to a bill that is already open.
 */
export function kitchenTicketHtml(o: ReceiptOrder, addOn = false): string {
  const rows = o.lines.map((l) => `<tr><td class="k-qty">${n(l.qty)} ×</td><td class="k-item">${esc(l.item_name)}</td></tr>${itemDetails(l, false)}`).join("");
  return [
    `<div class="r-center r-title">KITCHEN${addOn ? " · ADD-ON" : ""}</div>`,
    `<div class="r-rule"></div>`,
    serviceLine(o) ? `<div class="r-service">${esc(serviceLine(o))}</div>` : "",
    `<div class="r-row"><span>${esc(o.date)} ${esc(o.time)}</span><span>${esc(o.invoice_no || o.order_id.slice(-4))}</span></div>`,
    `<div class="r-rule"></div>`,
    `<table><tbody>${rows}</tbody></table>`,
    o.notes ? `<div class="r-rule"></div><div class="k-note">Note: ${esc(o.notes)}</div>` : "",
  ].join("");
}

/** Name on the receipt: the menu sub-category in front ("SweetMO · Mo special Crepes"), unless it repeats the name. */
export function receiptItemName(itemName: string, subCategory?: string): string {
  return subCategory && subCategory !== itemName ? `${subCategory} · ${itemName}` : itemName;
}

/** Blank space around the receipt on the paper (mm). */
export const RECEIPT_MARGIN_MM = 3;

/**
 * Paper length to print on: the label height from Settings (receipt_height_mm), or – when that is 0 (roll paper) –
 * the receipt's own length plus the margins, so the printer feeds exactly one receipt and no A4/Letter page.
 */
export function receiptPaperHeight(settingHeightMm: number | undefined, contentHeightMm: number, maxPageMm?: number): number {
  if (settingHeightMm && settingHeightMm > 0) return Math.round(settingHeightMm);
  const fit = Math.max(40, Math.ceil(contentHeightMm + 2 * RECEIPT_MARGIN_MM + 2));
  // Longer than the printer's paper? Keep the normal text size and let the rest run onto the next page
  // (a page longer than the paper gets shrunk by the printer driver to fit).
  return maxPageMm && maxPageMm > 0 ? Math.min(fit, Math.round(maxPageMm)) : fit;
}

/**
 * @page rule with an exact paper size. Chrome ignores a size like "80mm auto", falls back to A4/Letter and shrinks
 * the receipt, so the length is always given in mm.
 */
export function receiptPageCss(widthMm: number, heightMm: number, fontPx?: number): string {
  return `@page { size: ${widthMm}mm ${heightMm}mm; margin: ${RECEIPT_MARGIN_MM}mm; }${fontPx ? ` .receipt { --receipt-font: ${fontPx}px; }` : ""}` +
    // Never cut an item, its add-ons or a totals row in half across two pages; no shrinking to fit.
    ` .receipt tr, .receipt .r-row, .receipt .r-offer, .receipt .r-logo-wrap { break-inside: avoid; page-break-inside: avoid; }`;
}

/** px (CSS, 96 per inch) → mm. */
export const pxToMm = (px: number) => (px * 25.4) / 96;

/**
 * Receipt data from an order's lines (voided lines are left out). The bill-discount line becomes `bill_discount`;
 * item discounts, add-ons and notes go under each item. `subOf` gives an item's menu sub-category.
 */
export function receiptFromLines(lines: OrderLine[], subOf: (itemId: string) => string | undefined, extra: Partial<ReceiptOrder> = {}): ReceiptOrder {
  const live = lines.filter((l) => l.status !== "Void");
  const items = live.filter((l) => !isDiscountLine(l));
  const disc = live.find(isDiscountLine);
  const o = live[0] ?? lines[0];
  return {
    order_id: o.order_id, date: o.date, time: o.time, meal: o.meal, payment_method: o.payment_method,
    notes: live.find((l) => l.notes)?.notes ?? "", order_type: orderTypeOf(o), table_no: o.table_no,
    invoice_no: live.find((l) => l.invoice_no)?.invoice_no ?? "",
    status: live.some((l) => l.status === "Open") ? "Open" : "Paid",
    offer_text: live.find((l) => l.offer_text)?.offer_text ?? "",
    bill_discount: disc && disc.line_total ? { label: discountLabel(disc.discount_type, disc.discount_value), amount: -disc.line_total } : undefined,
    lines: items.map((r) => ({
      item_name: receiptItemName(r.item_name, subOf(r.item_id)),
      qty: r.qty, unit_price: r.unit_price, line_total: r.line_total,
      note: r.item_note || undefined,
      addons: parseAddons(r.addons).map((a) => ({ name: a.name, qty: a.qty, price: a.price })),
      discount_label: r.discount_amount ? discountLabel(r.discount_type, r.discount_value) : undefined,
      discount_amount: r.discount_amount || undefined,
    })),
    ...extra,
  };
}
