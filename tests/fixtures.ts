import { parseSettings, DEFAULT_SETTING_ROWS, DEFAULT_TARGETS } from "../src/lib/settings";
import type { DailyCost, FixedCost, OrderLine, Settings, SettingRow } from "../src/lib/types";

export function settings(overrides: Record<string, string> = {}): Settings {
  const rows: SettingRow[] = DEFAULT_SETTING_ROWS.map((r) => ({ ...r, value: overrides[r.key] ?? r.value }));
  return parseSettings(rows, DEFAULT_TARGETS);
}

let n = 0;
export function order(p: Partial<OrderLine> & { date: string; qty: number; unit_price: number; unit_cost: number }): OrderLine {
  n++;
  return {
    line_id: `L${n}`, order_id: p.order_id ?? `O${n}`, time: "12:00", meal: "Lunch", item_id: "A01", item_name: "Item",
    payment_method: "Cash", notes: "", entered_by: "t",
    line_total: p.qty * p.unit_price, line_cost: p.qty * p.unit_cost,
    ...p,
  };
}

export function cost(p: Partial<DailyCost> & { date: string; amount: number }): DailyCost {
  n++;
  return { cost_id: `C${n}`, category: "Food & ingredients", description: "x", paid_from: "Petty cash", paid_by: "Business", notes: "", entered_by: "t", ...p };
}

export function monthly(p: Partial<FixedCost> & { amount: number; start_month: string }): FixedCost {
  n++;
  return { fixed_id: `F${n}`, name: "Rent", frequency: "Monthly", end_month: "", month_paid: "", paid_from: "Bank", notes: "", ...p };
}

export function oneTime(p: Partial<FixedCost> & { amount: number; month_paid: string }): FixedCost {
  n++;
  return { fixed_id: `F${n}`, name: "Freezer", frequency: "One-time", start_month: "", end_month: "", paid_from: "Bank", notes: "", ...p };
}
