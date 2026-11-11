import type { DailyCost, FixedCost, FixedPayment, MonthKey, OrderLine, Settings } from "../types";
import { isClosedMonth, monthOf, monthRange } from "./dates";
import { fixedCostsForMonth } from "./fixedCosts";
import { ratio, sum } from "./money";
import { targetFor } from "../settings";

/** Formulas shown as tooltips in the UI. Keep these in sync with the code below. */
export const FORMULAS = {
  sales: "Sales = sum of Orders.line_total in the month",
  foodCost: "Food cost (menu-based) = sum of Orders.line_cost in the month (qty × unit_cost snapshot)",
  dailyCosts: "Daily costs = sum of Daily_Costs.amount in the month",
  fixedCosts:
    "Fixed costs = monthly fixed costs active this month (start_month ≤ month ≤ end_month, not a closed month) + one-time costs allocated to this month (Settings: one_time_allocation)",
  totalCosts: "Total costs = Daily costs + Fixed costs",
  netProfit: "Net profit = Sales − Total costs",
  netMargin: "Net margin = Net profit ÷ Sales (shown as \"-\" when Sales = 0)",
  partnerShare: "Partner share = Net profit × partner % (Settings: partners)",
  foodCheck:
    "Food cost check = Actual purchases (Daily costs in Settings: food_check_categories) − Menu-based food cost. Positive = waste / stock build-up / price changes",
  grossProfit: "Gross profit = Sales − Food cost (menu-based)",
  foodCostPct: "Food cost % = Food cost (menu-based) ÷ Sales",
  vsPlan: "Vs plan = Actual − Planned (Targets tab)",
} as const;

export interface MonthProfit {
  month: MonthKey;
  closed: boolean;
  sales: number;
  foodCost: number;
  dailyCosts: number;
  fixedCosts: number;
  totalCosts: number;
  netProfit: number;
  netMargin: number | null;
  partnerShares: { name: string; pct: number; amount: number }[];
  actualFoodPurchases: number;
  foodCostDifference: number; // actual purchases − menu-based
  plannedSales: number;
  plannedNetProfit: number;
  salesVsPlan: number;
  profitVsPlan: number;
}

export interface ProfitInputs {
  orders: OrderLine[];
  dailyCosts: DailyCost[];
  fixedCosts: FixedCost[];
  fixedPayments: FixedPayment[];
  settings: Settings;
}

export function partnerShares(netProfit: number, settings: Pick<Settings, "partners">) {
  // Round each share to whole rupees; give any rounding remainder to the last partner so shares add up exactly.
  const shares = settings.partners.map((p) => ({ name: p.name, pct: p.pct, amount: Math.round((netProfit * p.pct) / 100) }));
  if (shares.length) {
    const diff = netProfit - shares.reduce((t, s) => t + s.amount, 0);
    shares[shares.length - 1].amount += diff;
  }
  return shares;
}

export function monthProfit(month: MonthKey, input: ProfitInputs): MonthProfit {
  const { settings } = input;
  const orders = input.orders.filter((o) => monthOf(o.date) === month);
  const costs = input.dailyCosts.filter((c) => monthOf(c.date) === month);

  const sales = sum(orders, (o) => o.line_total);
  const foodCost = sum(orders, (o) => o.line_cost);
  const dailyCosts = sum(costs, (c) => c.amount);
  const fixedCosts = sum(fixedCostsForMonth(month, input.fixedCosts, input.fixedPayments, settings), (l) => l.counted);
  const totalCosts = dailyCosts + fixedCosts;
  const netProfit = sales - totalCosts;

  const foodCats = new Set(settings.food_check_categories);
  const actualFoodPurchases = sum(costs.filter((c) => foodCats.has(c.category)), (c) => c.amount);

  const target = targetFor(month, settings.targets);
  const closed = isClosedMonth(month, settings.closed_months);
  const plannedSales = closed || !target ? 0 : target.planned_monthly_sales;
  const plannedNetProfit = closed || !target ? 0 : target.planned_net_profit;

  return {
    month,
    closed,
    sales,
    foodCost,
    dailyCosts,
    fixedCosts,
    totalCosts,
    netProfit,
    netMargin: ratio(netProfit, sales),
    partnerShares: partnerShares(netProfit, settings),
    actualFoodPurchases,
    foodCostDifference: actualFoodPurchases - foodCost,
    plannedSales,
    plannedNetProfit,
    salesVsPlan: sales - plannedSales,
    profitVsPlan: netProfit - plannedNetProfit,
  };
}

export type ProfitTotals = Omit<MonthProfit, "month" | "closed"> & { months: number };

export function totalProfit(rows: MonthProfit[], settings: Pick<Settings, "partners">): ProfitTotals {
  const s = (f: (r: MonthProfit) => number) => sum(rows, f);
  const sales = s((r) => r.sales);
  const netProfit = s((r) => r.netProfit);
  const foodCost = s((r) => r.foodCost);
  const actualFoodPurchases = s((r) => r.actualFoodPurchases);
  const plannedSales = s((r) => r.plannedSales);
  const plannedNetProfit = s((r) => r.plannedNetProfit);
  return {
    months: rows.length,
    sales,
    foodCost,
    dailyCosts: s((r) => r.dailyCosts),
    fixedCosts: s((r) => r.fixedCosts),
    totalCosts: s((r) => r.totalCosts),
    netProfit,
    netMargin: ratio(netProfit, sales),
    // Sum of monthly shares (not re-split) so YTD matches the month rows exactly.
    partnerShares: settings.partners.map((p) => ({
      name: p.name,
      pct: p.pct,
      amount: sum(rows, (r) => r.partnerShares.find((x) => x.name === p.name)?.amount ?? 0),
    })),
    actualFoodPurchases,
    foodCostDifference: actualFoodPurchases - foodCost,
    plannedSales,
    plannedNetProfit,
    salesVsPlan: sales - plannedSales,
    profitVsPlan: netProfit - plannedNetProfit,
  };
}

/** Month-by-month table from `from` to `to` inclusive. */
export function profitTable(from: MonthKey, to: MonthKey, input: ProfitInputs): MonthProfit[] {
  return monthRange(from, to).map((m) => monthProfit(m, input));
}

/** Year-to-date: Jan of `month`'s year (or opening month, if later) through `month`. */
export function yearToDate(month: MonthKey, input: ProfitInputs): ProfitTotals {
  const jan = `${month.slice(0, 4)}-01`;
  const from = input.settings.opening_month > jan ? input.settings.opening_month : jan;
  return totalProfit(profitTable(from, month, input), input.settings);
}
