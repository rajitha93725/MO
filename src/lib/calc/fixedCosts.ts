import type { FixedCost, FixedPayment, MonthKey, Settings } from "../types";
import { addMonths, isClosedMonth } from "./dates";

/** Is a monthly fixed cost active (planned) in this month? Closed months never carry monthly costs. */
export function isMonthlyActive(fc: FixedCost, month: MonthKey, settings: Pick<Settings, "closed_months">): boolean {
  if (fc.frequency !== "Monthly") return false;
  if (!fc.start_month || month < fc.start_month) return false;
  if (fc.end_month && month > fc.end_month) return false;
  return !isClosedMonth(month, settings.closed_months);
}

/**
 * Months (and amounts) a one-time cost is allocated to.
 * full   -> 100% in month_paid.
 * spread -> split evenly over N *open* months starting at month_paid (closed months skipped).
 *           Whole rupees; any remainder goes to the earliest months so the total is exact.
 */
export function oneTimeAllocation(
  fc: FixedCost,
  settings: Pick<Settings, "one_time_allocation" | "one_time_spread_months" | "closed_months">,
): Map<MonthKey, number> {
  const out = new Map<MonthKey, number>();
  if (fc.frequency !== "One-time" || !fc.month_paid) return out;
  if (settings.one_time_allocation === "full") {
    out.set(fc.month_paid, fc.amount);
    return out;
  }
  const n = Math.max(1, settings.one_time_spread_months);
  const months: MonthKey[] = [];
  let m = fc.month_paid;
  // Safety cap prevents an infinite loop if every month were closed.
  for (let guard = 0; months.length < n && guard < 240; guard++) {
    if (!isClosedMonth(m, settings.closed_months) || m === fc.month_paid) months.push(m);
    m = addMonths(m, 1);
  }
  const base = Math.floor(fc.amount / months.length);
  let remainder = fc.amount - base * months.length;
  for (const mo of months) {
    out.set(mo, base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }
  return out;
}

export interface FixedMonthLine {
  fixed_id: string;
  name: string;
  frequency: FixedCost["frequency"];
  planned: number;
  actual: number | null; // null = no payment recorded (monthly) ; one-time is treated as paid in month_paid
  paid: boolean;
  counted: number; // amount included in profit for this month
}

/** All fixed-cost lines that affect a month, with planned vs actual and the amount counted in profit. */
export function fixedCostsForMonth(
  month: MonthKey,
  fixed: FixedCost[],
  payments: FixedPayment[],
  settings: Settings,
): FixedMonthLine[] {
  const lines: FixedMonthLine[] = [];
  for (const fc of fixed) {
    if (fc.frequency === "Monthly") {
      const active = isMonthlyActive(fc, month, settings);
      const pays = payments.filter((p) => p.fixed_id === fc.fixed_id && p.month === month);
      if (!active && pays.length === 0) continue;
      const actual = pays.length ? pays.reduce((t, p) => t + p.amount, 0) : null;
      const planned = active ? fc.amount : 0;
      const counted = settings.fixed_profit_basis === "actual_when_paid" && actual !== null ? actual : planned;
      lines.push({ fixed_id: fc.fixed_id, name: fc.name, frequency: fc.frequency, planned, actual, paid: actual !== null, counted });
    } else {
      const alloc = oneTimeAllocation(fc, settings).get(month);
      if (alloc === undefined) continue;
      lines.push({
        fixed_id: fc.fixed_id,
        name: fc.name,
        frequency: fc.frequency,
        planned: alloc,
        actual: month === fc.month_paid ? fc.amount : null,
        paid: true,
        counted: alloc,
      });
    }
  }
  return lines;
}

/** Unpaid monthly fixed costs for a month (planned but no payment recorded). */
export function unpaidFixedCosts(month: MonthKey, fixed: FixedCost[], payments: FixedPayment[], settings: Settings) {
  return fixedCostsForMonth(month, fixed, payments, settings).filter((l) => l.frequency === "Monthly" && !l.paid && l.planned > 0);
}
