import type { MonthKey, Settings, VillaRecord } from "../types";
import { monthRange } from "./dates";
import { monthProfit, partnerShares, type ProfitInputs } from "./profit";
import { villaMonth } from "./villa";
import { sum } from "./money";

export const COMBINED_FORMULA =
  "Total profit = Cafe net profit + Villa net profit. Partner share = Cafe net profit × cafe % (Settings: partners) + Villa net profit × villa % (Settings: villa_partners)";

export interface CombinedShare {
  name: string;
  /** % of cafe profit (Settings: partners). */
  cafePct: number;
  /** % of villa profit (Settings: villa_partners). */
  villaPct: number;
  cafe: number;
  villa: number;
  amount: number;
}

export interface CombinedMonth {
  month: MonthKey;
  cafe: number;
  villa: number;
  total: number;
  shares: CombinedShare[];
}

/** Everyone who shares cafe or villa profit, cafe partners first. */
export function profitPartners(settings: Pick<Settings, "partners" | "villa_partners">) {
  const names = [...settings.partners.map((p) => p.name)];
  for (const p of settings.villa_partners) if (!names.includes(p.name)) names.push(p.name);
  return names.map((name) => ({
    name,
    cafePct: settings.partners.find((p) => p.name === name)?.pct ?? 0,
    villaPct: settings.villa_partners.find((p) => p.name === name)?.pct ?? 0,
  }));
}

/** Short label such as "50% cafe · 100% villa". */
export function shareLabel(p: { cafePct: number; villaPct: number }) {
  return `${p.cafePct}% cafe · ${p.villaPct}% villa`;
}

export function combinedMonth(month: MonthKey, cafe: ProfitInputs, villa: VillaRecord[]): CombinedMonth {
  const c = monthProfit(month, cafe).netProfit;
  const v = villaMonth(month, villa, cafe.settings).netProfit;
  const cafeShares = partnerShares(c, cafe.settings);
  const villaShares = partnerShares(v, { partners: cafe.settings.villa_partners });
  const shares = profitPartners(cafe.settings).map((p) => {
    const cs = cafeShares.find((x) => x.name === p.name)?.amount ?? 0;
    const vs = villaShares.find((x) => x.name === p.name)?.amount ?? 0;
    return { ...p, cafe: cs, villa: vs, amount: cs + vs };
  });
  return { month, cafe: c, villa: v, total: c + v, shares };
}

export function combinedTable(from: MonthKey, to: MonthKey, cafe: ProfitInputs, villa: VillaRecord[]): CombinedMonth[] {
  return monthRange(from, to).map((m) => combinedMonth(m, cafe, villa));
}

/** Totals; shares are summed from the month rows so they match the table exactly. */
export function combinedTotals(rows: CombinedMonth[], settings: Pick<Settings, "partners" | "villa_partners">) {
  return {
    cafe: sum(rows, (r) => r.cafe),
    villa: sum(rows, (r) => r.villa),
    total: sum(rows, (r) => r.total),
    shares: profitPartners(settings).map((p) => {
      const get = (k: "cafe" | "villa" | "amount") => sum(rows, (r) => r.shares.find((s) => s.name === p.name)?.[k] ?? 0);
      return { ...p, cafe: get("cafe"), villa: get("villa"), amount: get("amount") };
    }),
  };
}

/** Year-to-date window: Jan of the month's year (or the opening month, if later) to the month. */
export function ytdRange(month: MonthKey, openingMonth: MonthKey): [MonthKey, MonthKey] {
  const jan = `${month.slice(0, 4)}-01`;
  return [openingMonth > jan ? openingMonth : jan, month];
}
