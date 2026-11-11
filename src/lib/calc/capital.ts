import type { CapitalContribution, Partner } from "../types";
import { CAPITAL_BUSINESSES } from "../types";
import { ratio, sum } from "./money";

export const CAPITAL_FORMULAS = {
  share: "Capital share = partner's contributions ÷ all contributions",
  trackOnly:
    "Capital is tracked only. It does not change the profit split (Settings: partners), which reflects money plus work (cooking & management).",
  cash: "Contributions paid into Bank or Petty cash raise that balance. 'Paid directly' (e.g. straight to a supplier) is recorded but does not touch the business accounts.",
} as const;

export interface CapitalSummary {
  total: number;
  byPartner: { name: string; amount: number; share: number | null }[];
  byBusiness: { business: string; total: number; byPartner: { name: string; amount: number; share: number | null }[] }[];
}

/** Totals per partner and per business. Partners come from Settings; any other name found is listed too. */
export function capitalSummary(rows: CapitalContribution[], partners: Pick<Partner, "name">[]): CapitalSummary {
  const names = Array.from(new Set([...partners.map((p) => p.name), ...rows.map((r) => r.partner)]));
  const per = (subset: CapitalContribution[]) => {
    const total = sum(subset, (r) => r.amount);
    return {
      total,
      byPartner: names.map((name) => {
        const amount = sum(subset.filter((r) => r.partner === name), (r) => r.amount);
        return { name, amount, share: ratio(amount, total) };
      }),
    };
  };
  const all = per(rows);
  return {
    total: all.total,
    byPartner: all.byPartner,
    byBusiness: CAPITAL_BUSINESSES.map((business) => ({ business, ...per(rows.filter((r) => r.business === business)) })),
  };
}
