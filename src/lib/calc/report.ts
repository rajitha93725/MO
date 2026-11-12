// Monthly report: one month of sales, orders, costs, fixed costs and profit (cafe),
// plus villa, cash and combined shares for the owner. Pure functions only.
import type { Account, CashMovement, DailyCost, MenuItem, MonthKey, OrderLine, PaymentMethod, VillaRecord } from "../types";
import { ACCOUNTS, ALL_PAYMENT_METHODS, MEALS } from "../types";
import { addDays, addMonths, daysInMonth, monthOf } from "./dates";
import { ratio, sum } from "./money";
import { daySummary } from "./daily";
import { monthProfit, type MonthProfit, type ProfitInputs } from "./profit";
import { fixedCostsForMonth, type FixedMonthLine } from "./fixedCosts";
import { villaMonth, bookingShareForMonth, isBooking, isCost, nightsByMonth, occupiesRoom, type VillaMonth } from "./villa";
import { combinedMonth, type CombinedMonth } from "./combined";
import { accountBalance, type CashInputs } from "./cash";

export interface ReportOrder {
  order_id: string;
  date: string;
  time: string;
  meal: string;
  payment_method: PaymentMethod;
  items: string; // "2× Rice & curry, 1× Lime juice"
  qty: number;
  total: number;
  cost: number;
  entered_by: string;
}

export interface ItemRow {
  item_id: string;
  item_name: string;
  category: string;
  qty: number;
  sales: number;
  foodCost: number;
  grossProfit: number;
  foodCostPct: number | null;
}

export interface GroupRow {
  name: string;
  amount: number;
  count: number;
  share: number | null; // of the group total
}

export interface CafeReport {
  month: MonthKey;
  profit: MonthProfit;
  previous: MonthProfit;
  orders: number;
  itemsSold: number;
  avgOrderValue: number | null;
  tradingDays: number; // days with at least one sale
  bestDay: { date: string; sales: number } | null;
  days: { date: string; orders: number; sales: number; foodCost: number; target: number; vsTarget: number }[];
  byMeal: (GroupRow & { foodCost: number; orders: number })[];
  byPayment: GroupRow[];
  byCategory: GroupRow[];
  items: ItemRow[];
  orderList: ReportOrder[];
  costsByCategory: GroupRow[];
  costsByAccount: GroupRow[];
  costsByPaidBy: GroupRow[];
  costList: DailyCost[];
  fixed: FixedMonthLine[];
}

export interface CashReport {
  account: Account;
  opening: number; // balance at the end of the previous month
  closing: number; // balance at the end of the month
  change: number;
}

export interface OwnerReport {
  villa: VillaMonth;
  villaBookings: (VillaRecord & { monthGross: number; monthNights: number })[];
  villaCosts: VillaRecord[];
  combined: CombinedMonth;
  cash: CashReport[];
  movements: CashMovement[];
}

const by = <T,>(rows: T[], key: (r: T) => string, amount: (r: T) => number, order?: readonly string[]): GroupRow[] => {
  const map = new Map<string, { amount: number; count: number }>();
  for (const k of order ?? []) map.set(k, { amount: 0, count: 0 });
  for (const r of rows) {
    const k = key(r) || "-";
    const g = map.get(k) ?? { amount: 0, count: 0 };
    g.amount += amount(r);
    g.count += 1;
    map.set(k, g);
  }
  const total = sum([...map.values()], (g) => g.amount);
  const out = [...map.entries()].map(([name, g]) => ({ name, amount: g.amount, count: g.count, share: ratio(g.amount, total) }));
  return order ? out : out.sort((a, b) => b.amount - a.amount);
};

/** Groups order lines into orders (lines of one order share order_id). */
export function groupOrders(lines: OrderLine[]): ReportOrder[] {
  const map = new Map<string, OrderLine[]>();
  for (const l of lines) map.set(l.order_id, [...(map.get(l.order_id) ?? []), l]);
  return [...map.entries()]
    .map(([order_id, ls]) => ({
      order_id,
      date: ls[0].date,
      time: ls[0].time,
      meal: ls[0].meal,
      payment_method: ls[0].payment_method,
      items: ls.map((l) => `${l.qty}× ${l.item_name}`).join(", "),
      qty: sum(ls, (l) => l.qty),
      total: sum(ls, (l) => l.line_total),
      cost: sum(ls, (l) => l.line_cost),
      entered_by: ls[0].entered_by,
    }))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

export function cafeReport(month: MonthKey, input: ProfitInputs, menu: MenuItem[]): CafeReport {
  const lines = input.orders.filter((o) => monthOf(o.date) === month);
  const costs = input.dailyCosts.filter((c) => monthOf(c.date) === month).sort((a, b) => a.date.localeCompare(b.date));
  const orderList = groupOrders(lines);
  const days = daysInMonth(month).map((d) => {
    const s = daySummary(d, lines, input.settings);
    return { date: d, orders: s.orders, sales: s.sales, foodCost: s.foodCost, target: s.target, vsTarget: s.vsTarget };
  });
  const sales = sum(lines, (l) => l.line_total);
  const best = days.reduce<{ date: string; sales: number } | null>((b, d) => (d.sales > 0 && (!b || d.sales > b.sales) ? { date: d.date, sales: d.sales } : b), null);

  const categoryOf = new Map(menu.map((m) => [m.item_id, m.category || "-"]));
  const itemMap = new Map<string, ItemRow>();
  for (const l of lines) {
    const r = itemMap.get(l.item_id) ?? { item_id: l.item_id, item_name: l.item_name, category: categoryOf.get(l.item_id) ?? "-", qty: 0, sales: 0, foodCost: 0, grossProfit: 0, foodCostPct: null };
    r.qty += l.qty;
    r.sales += l.line_total;
    r.foodCost += l.line_cost;
    itemMap.set(l.item_id, r);
  }
  const items = [...itemMap.values()]
    .map((r) => ({ ...r, grossProfit: r.sales - r.foodCost, foodCostPct: ratio(r.foodCost, r.sales) }))
    .sort((a, b) => b.sales - a.sales || b.qty - a.qty);

  const byMeal = MEALS.map((meal) => {
    const ls = lines.filter((l) => l.meal === meal);
    const amount = sum(ls, (l) => l.line_total);
    return { name: meal, amount, count: ls.length, share: ratio(amount, sales), foodCost: sum(ls, (l) => l.line_cost), orders: new Set(ls.map((l) => l.order_id)).size };
  });

  return {
    month,
    profit: monthProfit(month, input),
    previous: monthProfit(addMonths(month, -1), input),
    orders: orderList.length,
    itemsSold: sum(lines, (l) => l.qty),
    avgOrderValue: orderList.length ? Math.round(sales / orderList.length) : null,
    tradingDays: days.filter((d) => d.sales > 0).length,
    bestDay: best,
    days,
    byMeal,
    // count = number of orders paid that way
    byPayment: by(orderList, (o) => o.payment_method, (o) => o.total, ALL_PAYMENT_METHODS),
    byCategory: by(lines, (l) => categoryOf.get(l.item_id) ?? "-", (l) => l.line_total),
    items,
    orderList,
    costsByCategory: by(costs, (c) => c.category, (c) => c.amount),
    costsByAccount: by(costs, (c) => c.paid_from, (c) => c.amount, ACCOUNTS),
    costsByPaidBy: by(costs, (c) => c.paid_by, (c) => c.amount),
    costList: costs,
    fixed: fixedCostsForMonth(month, input.fixedCosts, input.fixedPayments, input.settings),
  };
}

export function ownerReport(month: MonthKey, input: ProfitInputs, villa: VillaRecord[], cash: CashInputs): OwnerReport {
  const settings = input.settings;
  const villaBookings = villa
    .filter(isBooking)
    .map((b) => {
      const s = bookingShareForMonth(b, month, settings);
      const nights = occupiesRoom(b) ? nightsByMonth(b.check_in, b.check_out).get(month) ?? 0 : 0;
      return { ...b, monthGross: s.gross, monthNights: nights };
    })
    .filter((b) => b.monthNights > 0 || b.monthGross !== 0 || monthOf(b.check_in) === month)
    .sort((a, b) => a.check_in.localeCompare(b.check_in));
  const first = `${month}-01`;
  const last = daysInMonth(month).at(-1)!;
  return {
    villa: villaMonth(month, villa, settings),
    villaBookings,
    villaCosts: villa.filter((r) => isCost(r) && monthOf(r.date_entered) === month).sort((a, b) => a.date_entered.localeCompare(b.date_entered)),
    combined: combinedMonth(month, input, villa),
    cash: ACCOUNTS.map((account) => {
      const opening = accountBalance(account, cash, addDays(first, -1)).balance;
      const closing = accountBalance(account, cash, last).balance;
      return { account, opening, closing, change: closing - opening };
    }),
    movements: cash.movements.filter((m) => monthOf(m.date) === month).sort((a, b) => a.date.localeCompare(b.date)),
  };
}
