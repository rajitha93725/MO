import { describe, expect, it } from "vitest";
import { capitalSummary } from "../src/lib/calc/capital";
import { accountBalance } from "../src/lib/calc/cash";
import { partnerShares } from "../src/lib/calc/profit";
import { settings } from "./fixtures";
import type { CapitalContribution } from "../src/lib/types";

let n = 0;
const cap = (p: Partial<CapitalContribution> & Pick<CapitalContribution, "partner" | "amount">): CapitalContribution => ({
  capital_id: `CAP-${++n}`, date: "2026-11-01", business: "MO Cafe", description: "x", paid_into: "Paid directly", notes: "", ...p,
});

const rows = [
  cap({ partner: "Rajitha", amount: 1_200_000, business: "MO Cafe" }),
  cap({ partner: "Rajitha", amount: 700_000, business: "MO Villa" }),
  cap({ partner: "Janith", amount: 100_000, business: "MO Cafe" }),
];

describe("capital summary", () => {
  const s = capitalSummary(rows, settings().partners);

  it("totals and each partner's share of capital", () => {
    expect(s.total).toBe(2_000_000);
    expect(s.byPartner.map((p) => [p.name, p.amount])).toEqual([["Rajitha", 1_900_000], ["Janith", 100_000]]);
    expect(s.byPartner[0].share).toBeCloseTo(0.95);
    expect(s.byPartner[1].share).toBeCloseTo(0.05);
  });

  it("splits by business", () => {
    const cafe = s.byBusiness.find((b) => b.business === "MO Cafe")!;
    const villa = s.byBusiness.find((b) => b.business === "MO Villa")!;
    expect(cafe.total).toBe(1_300_000);
    expect(cafe.byPartner.find((p) => p.name === "Janith")!.share).toBeCloseTo(100_000 / 1_300_000);
    expect(villa.byPartner.map((p) => p.amount)).toEqual([700_000, 0]);
    expect(s.byBusiness.find((b) => b.business === "Both")!.byPartner[0].share).toBeNull(); // no rows -> "-"
  });

  it("is tracked only: the profit split stays as set in Settings (50/50)", () => {
    expect(partnerShares(100_000, settings()).map((x) => x.amount)).toEqual([50_000, 50_000]);
  });

  it("empty list gives zero total and '-' shares", () => {
    const e = capitalSummary([], settings().partners);
    expect(e.total).toBe(0);
    expect(e.byPartner.every((p) => p.share === null)).toBe(true);
  });
});

describe("capital and cash balances", () => {
  const base = { orders: [], dailyCosts: [], fixedCosts: [], fixedPayments: [], movements: [] };
  const capital = [
    cap({ partner: "Rajitha", amount: 600_000, paid_into: "Bank", date: "2026-11-01" }),
    cap({ partner: "Janith", amount: 40_000, paid_into: "Petty cash", date: "2026-11-20" }),
    cap({ partner: "Rajitha", amount: 1_200_000, paid_into: "Paid directly" }),
  ];

  it("money paid into Bank or Petty cash raises that balance", () => {
    expect(accountBalance("Bank", { ...base, capital }).capitalIn).toBe(600_000);
    expect(accountBalance("Petty cash", { ...base, capital }).balance).toBe(40_000);
  });
  it("'Paid directly' does not touch the business accounts", () => {
    const total = accountBalance("Bank", { ...base, capital }).balance + accountBalance("Petty cash", { ...base, capital }).balance;
    expect(total).toBe(640_000);
  });
  it("respects the as-of date", () => {
    expect(accountBalance("Petty cash", { ...base, capital }, "2026-11-19").capitalIn).toBe(0);
  });
});
