import type { MonthKey, VillaRecord } from "../types";
import { monthRange } from "./dates";
import { monthProfit, partnerShares, type ProfitInputs } from "./profit";
import { villaMonth } from "./villa";
import { sum } from "./money";

export const COMBINED_FORMULA = "Total profit = Cafe net profit + Villa net profit. Partner shares = Total profit × partner % (Settings: partners)";

export interface CombinedMonth {
  month: MonthKey;
  cafe: number;
  villa: number;
  total: number;
  shares: { name: string; pct: number; amount: number }[];
}

export function combinedMonth(month: MonthKey, cafe: ProfitInputs, villa: VillaRecord[]): CombinedMonth {
  const c = monthProfit(month, cafe).netProfit;
  const v = villaMonth(month, villa, cafe.settings).netProfit;
  const total = c + v;
  return { month, cafe: c, villa: v, total, shares: partnerShares(total, cafe.settings) };
}

export function combinedTable(from: MonthKey, to: MonthKey, cafe: ProfitInputs, villa: VillaRecord[]): CombinedMonth[] {
  return monthRange(from, to).map((m) => combinedMonth(m, cafe, villa));
}

/** Totals; shares are summed from the month rows so they match the table exactly. */
export function combinedTotals(rows: CombinedMonth[], partners: { name: string; pct: number }[]) {
  return {
    cafe: sum(rows, (r) => r.cafe),
    villa: sum(rows, (r) => r.villa),
    total: sum(rows, (r) => r.total),
    shares: partners.map((p) => ({ name: p.name, pct: p.pct, amount: sum(rows, (r) => r.shares.find((s) => s.name === p.name)?.amount ?? 0) })),
  };
}

/** Year-to-date window: Jan of the month's year (or the opening month, if later) to the month. */
export function ytdRange(month: MonthKey, openingMonth: MonthKey): [MonthKey, MonthKey] {
  const jan = `${month.slice(0, 4)}-01`;
  return [openingMonth > jan ? openingMonth : jan, month];
}
