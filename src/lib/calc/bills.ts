// Open bills: an order sent to the kitchen and paid later. Pure functions (unit-tested).

import { orderTypeOf, type OrderLine, type OrderType } from "../types";
import { sum } from "./money";
import { BILL_DISCOUNT_ID, isDiscountLine } from "./pricing";

export interface Bill {
  order_id: string;
  date: string;
  time: string;
  order_type: OrderType | "";
  table_no: string;
  /** Open = at least one line not paid yet. */
  status: "Open" | "Paid" | "Void";
  /** Items still on the bill (not voided; without the bill-discount line). */
  lines: OrderLine[];
  /** The bill-discount line, if the bill has one (its line_total is negative). */
  discount?: OrderLine;
  /** Sum of the items before the bill discount. */
  subtotal: number;
  voided: OrderLine[];
  total: number;
  items: number;
  notes: string;
  invoice_no: string;
  /** When the bill was printed for the table ("" = not yet). */
  printed_at: string;
}

/** First invoice number of each day (261118_021, 261118_022, …). */
export const FIRST_DAILY_INVOICE = 21;

/** Next cafe invoice number for a date: YYMMDD_NNN, counting up from 021 each day (voided bills keep theirs). */
export function nextInvoiceNo(date: string, lines: Pick<OrderLine, "invoice_no">[]): string {
  const prefix = `${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}_`;
  let max = FIRST_DAILY_INVOICE - 1;
  for (const l of lines) {
    if (!l.invoice_no?.startsWith(prefix)) continue;
    const n = Number(l.invoice_no.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return prefix + String(max + 1).padStart(3, "0");
}

/** All bills found in the order lines (one per order_id), oldest first. */
export function groupBills(lines: OrderLine[]): Bill[] {
  const map = new Map<string, OrderLine[]>();
  for (const l of lines) map.set(l.order_id, [...(map.get(l.order_id) ?? []), l]);
  return [...map.entries()]
    .map(([order_id, ls]) => {
      const live = ls.filter((l) => l.status !== "Void");
      const items = live.filter((l) => !isDiscountLine(l));
      const first = ls[0];
      const status: Bill["status"] = live.some((l) => l.status === "Open") ? "Open" : items.length ? "Paid" : "Void";
      return {
        order_id,
        date: first.date,
        time: first.time,
        order_type: orderTypeOf(first),
        table_no: first.table_no ?? "",
        status,
        lines: items,
        discount: live.find((l) => l.item_id === BILL_DISCOUNT_ID),
        subtotal: sum(items, (l) => l.line_total),
        voided: ls.filter((l) => l.status === "Void" && !isDiscountLine(l)),
        total: sum(live, (l) => l.line_total),
        items: sum(items, (l) => l.qty),
        notes: ls.find((l) => l.notes)?.notes ?? "",
        invoice_no: ls.find((l) => l.invoice_no)?.invoice_no ?? "",
        printed_at: live.find((l) => l.printed_at)?.printed_at ?? "",
      };
    })
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

/** Every line still on the bill: the items and the bill-discount line. */
export function liveLines(b: Bill): OrderLine[] {
  return b.discount ? [...b.lines, b.discount] : b.lines;
}

export function openBills(lines: OrderLine[]): Bill[] {
  return groupBills(lines).filter((b) => b.status === "Open");
}

/** Table → open bill id, so a busy table opens its bill instead of starting a second one. */
export function busyTables(bills: Bill[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of bills) if (b.status === "Open" && b.table_no) out[b.table_no] = b.order_id;
  return out;
}

/** Whole minutes since the bill was opened (date + HH:MM), given the cafe's today and now. Never negative. */
export function minutesOpen(b: Pick<Bill, "date" | "time">, today: string, now: string): number {
  const at = (d: string, t: string) => {
    const [y, m, day] = d.split("-").map(Number);
    const [h, min] = t.split(":").map(Number);
    return Date.UTC(y, (m || 1) - 1, day || 1, h || 0, min || 0);
  };
  const diff = Math.round((at(today, now) - at(b.date, b.time)) / 60000);
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
}

/** Short duration, e.g. "8m", "1h 05m", "26h 10m". */
export function durationLabel(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** Next line number for an order (line ids are <order_id>-<n>). */
export function nextLineNo(lines: OrderLine[], order_id: string): number {
  const ns = lines.filter((l) => l.order_id === order_id).map((l) => Number(l.line_id.slice(order_id.length + 1)) || 0);
  return (ns.length ? Math.max(...ns) : 0) + 1;
}

/** Short label of a bill, e.g. "🍽️ Garden 2" or "📦 Take-away 12:40". */
export function billLabel(b: Pick<Bill, "order_type" | "table_no" | "time">): string {
  if (b.order_type === "Dine-in") return `🍽️ ${b.table_no || "Dine-in"}`;
  if (b.order_type === "Uber") return `🛵 Uber ${b.time}`;
  return `📦 Take-away ${b.time}`;
}
