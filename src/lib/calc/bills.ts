// Open bills: an order sent to the kitchen and paid later. Pure functions (unit-tested).

import { orderTypeOf, type OrderLine, type OrderType } from "../types";
import { sum } from "./money";

export interface Bill {
  order_id: string;
  date: string;
  time: string;
  order_type: OrderType | "";
  table_no: string;
  /** Open = at least one line not paid yet. */
  status: "Open" | "Paid" | "Void";
  /** Lines still on the bill (not voided). */
  lines: OrderLine[];
  voided: OrderLine[];
  total: number;
  items: number;
  notes: string;
}

/** All bills found in the order lines (one per order_id), oldest first. */
export function groupBills(lines: OrderLine[]): Bill[] {
  const map = new Map<string, OrderLine[]>();
  for (const l of lines) map.set(l.order_id, [...(map.get(l.order_id) ?? []), l]);
  return [...map.entries()]
    .map(([order_id, ls]) => {
      const live = ls.filter((l) => l.status !== "Void");
      const first = ls[0];
      const status: Bill["status"] = live.some((l) => l.status === "Open") ? "Open" : live.length ? "Paid" : "Void";
      return {
        order_id,
        date: first.date,
        time: first.time,
        order_type: orderTypeOf(first),
        table_no: first.table_no ?? "",
        status,
        lines: live,
        voided: ls.filter((l) => l.status === "Void"),
        total: sum(live, (l) => l.line_total),
        items: sum(live, (l) => l.qty),
        notes: ls.find((l) => l.notes)?.notes ?? "",
      };
    })
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
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
