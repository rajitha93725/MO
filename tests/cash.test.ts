import { describe, expect, it } from "vitest";
import { accountBalance, accountForPayment, isPettyLow, owedToPartners } from "../src/lib/calc/cash";
import { cost, monthly, oneTime, order, settings } from "./fixtures";
import type { CashMovement, FixedPayment } from "../src/lib/types";

const mv = (p: Partial<CashMovement> & Pick<CashMovement, "type" | "amount">): CashMovement => ({
  movement_id: Math.random().toString(36), date: "2026-12-01", account: "Petty cash", notes: "", moved_by: "Rajitha", ...p,
});

describe("payment method → account", () => {
  it("cash goes to petty cash, card and bank transfer to bank", () => {
    expect(accountForPayment("Cash")).toBe("Petty cash");
    expect(accountForPayment("Card")).toBe("Bank");
    expect(accountForPayment("Bank transfer")).toBe("Bank");
  });
});

describe("petty cash and bank balances", () => {
  const rent = monthly({ fixed_id: "RENT", amount: 100_000, start_month: "2026-12", paid_from: "Bank" });
  const salary = monthly({ fixed_id: "SAL", amount: 160_000, start_month: "2026-12", paid_from: "Petty cash" });
  const payments: FixedPayment[] = [
    { payment_id: "P1", fixed_id: "RENT", month: "2026-12", amount: 100_000, paid_date: "2026-12-05", paid_from: "Bank", notes: "" },
    { payment_id: "P2", fixed_id: "SAL", month: "2026-12", amount: 160_000, paid_date: "2026-12-30", paid_from: "Petty cash", notes: "" },
  ];
  const input = {
    orders: [
      order({ date: "2026-12-02", qty: 10, unit_price: 2_000, unit_cost: 0, payment_method: "Cash" }), // 20,000 petty
      order({ date: "2026-12-03", qty: 1, unit_price: 300_000, unit_cost: 0, payment_method: "Cash" }), // 300,000 petty
      order({ date: "2026-12-03", qty: 1, unit_price: 50_000, unit_cost: 0, payment_method: "Card" }), // 50,000 bank
      order({ date: "2026-12-04", qty: 1, unit_price: 25_000, unit_cost: 0, payment_method: "Bank transfer" }), // 25,000 bank
    ],
    dailyCosts: [
      cost({ date: "2026-12-02", amount: 8_000, paid_from: "Petty cash" }),
      cost({ date: "2026-12-03", amount: 6_000, paid_from: "Bank" }),
      cost({ date: "2026-12-03", amount: 1_500, paid_from: "Petty cash", paid_by: "Rajitha" }), // personal, excluded
    ],
    fixedCosts: [rent, salary, oneTime({ amount: 145_000, month_paid: "2026-12", paid_from: "Bank" })],
    fixedPayments: payments,
    movements: [
      mv({ type: "Opening balance", account: "Petty cash", amount: 50_000, date: "2026-11-30" }),
      mv({ type: "Opening balance", account: "Bank", amount: 600_000, date: "2026-11-30" }),
      mv({ type: "Top-up", account: "Petty cash", amount: 10_000 }),
      mv({ type: "Withdrawal", account: "Bank", amount: 5_000 }),
      mv({ type: "Transfer bank→petty", account: "Bank", amount: 40_000 }),
      mv({ type: "Transfer petty→bank", account: "Petty cash", amount: 15_000 }),
      mv({ type: "Cash sales deposit", account: "Petty cash", amount: 200_000, date: "2026-12-20" }),
    ],
  };

  it("petty cash = opening + cash sales + top-ups + transfers in − petty payments − transfers out", () => {
    const b = accountBalance("Petty cash", input);
    expect(b).toMatchObject({
      opening: 50_000, sales: 320_000, topUps: 10_000, transfersIn: 40_000,
      dailyCostsPaid: 8_000, fixedCostsPaid: 160_000, transfersOut: 215_000, withdrawals: 0,
    });
    expect(b.balance).toBe(50_000 + 320_000 + 10_000 + 40_000 - 8_000 - 160_000 - 215_000);
  });

  it("bank = opening + card/transfer sales + transfers in − bank payments − transfers out − withdrawals", () => {
    const b = accountBalance("Bank", input);
    expect(b).toMatchObject({
      opening: 600_000, sales: 75_000, topUps: 0, transfersIn: 215_000,
      dailyCostsPaid: 6_000, fixedCostsPaid: 100_000 + 145_000, transfersOut: 40_000, withdrawals: 5_000,
    });
    expect(b.balance).toBe(600_000 + 75_000 + 215_000 - 6_000 - 245_000 - 40_000 - 5_000);
  });

  it("transfers between accounts do not change the combined total", () => {
    const noTransfers = { ...input, movements: input.movements.filter((m) => !m.type.startsWith("Transfer") && m.type !== "Cash sales deposit") };
    const total = (i: typeof input) => accountBalance("Petty cash", i).balance + accountBalance("Bank", i).balance;
    expect(total(input)).toBe(total(noTransfers));
  });

  it("unpaid monthly fixed costs do not reduce cash", () => {
    const b = accountBalance("Bank", { ...input, fixedPayments: [] });
    expect(b.fixedCostsPaid).toBe(145_000); // only the one-time cost
  });

  it("as-of date ignores later movements and payments", () => {
    const b = accountBalance("Petty cash", input, "2026-12-02");
    // opening 50k + 20k cash sales + top-up 10k + 40k in − 8k cost − 15k out (deposit on 20th and salary on 30th excluded)
    expect(b.balance).toBe(50_000 + 20_000 + 10_000 + 40_000 - 8_000 - 15_000);
  });

  it("costs paid personally by partners are tracked as owed, not deducted", () => {
    expect(owedToPartners(input.dailyCosts)).toEqual({ Rajitha: 1_500 });
  });
});

describe("low petty cash warning", () => {
  it("uses the threshold from Settings", () => {
    const s = settings({ petty_low_threshold: "20000" });
    expect(isPettyLow(19_999, s)).toBe(true);
    expect(isPettyLow(20_000, s)).toBe(false);
    expect(isPettyLow(5_000, settings({ petty_low_threshold: "1000" }))).toBe(false);
  });
});
