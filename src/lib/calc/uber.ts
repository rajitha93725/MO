import type { DailyCost, ISODate, OrderLine, Settings } from "../types";
import { sum } from "./money";

/** Daily cost category used for the Uber commission recorded with every Uber order. */
export const UBER_COST_CATEGORY = "Uber commission";

export const UBER_FORMULAS = {
  price: (s: Pick<Settings, "uber_markup_pct">) =>
    `Uber price = Menu price + ${s.uber_markup_pct}% (Settings: uber_markup_pct), rounded up to the next Rs 10`,
  commission: (s: Pick<Settings, "uber_commission_pct">) =>
    `Uber commission = Uber order total × ${s.uber_commission_pct}% (Settings: uber_commission_pct). Saved automatically as a Daily cost: ${UBER_COST_CATEGORY}, paid from Bank by Business`,
} as const;

/** Menu price → Uber price (markup %, rounded up to the next Rs 10 so the commission is always covered). */
export function uberPrice(menuPrice: number, settings: Pick<Settings, "uber_markup_pct">): number {
  return Math.ceil((menuPrice * (1 + settings.uber_markup_pct / 100)) / 10) * 10;
}

/** Commission Uber keeps from an order total. */
export function uberCommission(orderTotal: number, settings: Pick<Settings, "uber_commission_pct">): number {
  return Math.round((orderTotal * settings.uber_commission_pct) / 100);
}

/** The Daily_Costs row id linked to an Uber order, so deleting the order deletes its commission. */
export function uberCostId(orderId: string): string {
  return `UC-${orderId}`;
}

export function isUber(o: Pick<OrderLine, "payment_method">): boolean {
  return o.payment_method === "Uber";
}

/** Uber sales and commission for one day. */
export function uberDay(date: ISODate, orders: OrderLine[], dailyCosts: DailyCost[]) {
  return {
    sales: sum(orders.filter((o) => o.date === date && isUber(o)), (o) => o.line_total),
    commission: sum(dailyCosts.filter((c) => c.date === date && c.category === UBER_COST_CATEGORY), (c) => c.amount),
  };
}
