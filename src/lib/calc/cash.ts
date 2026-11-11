import type { Account, CapitalContribution, CashMovement, DailyCost, FixedCost, FixedPayment, ISODate, OrderLine, Settings, VillaRecord } from "../types";
import { sum } from "./money";

export const CASH_FORMULAS = {
  petty:
    "Petty cash = Opening balance + Partner capital paid into petty cash + Cash sales + Villa payouts received to petty cash + Top-ups + Transfers bank→petty − Daily, fixed & villa costs paid from petty cash (by Business) − Transfers petty→bank − Cash sales deposits − Withdrawals",
  bank:
    "Bank = Opening balance + Partner capital paid into bank + Card & bank-transfer sales + Villa payouts received to bank + Top-ups + Transfers petty→bank + Cash sales deposits − Daily, fixed & villa costs paid from bank (by Business) − Transfers bank→petty − Withdrawals",
  partnerPaid: "Costs with paid_by = Rajitha / Janith were paid personally: they do not reduce business balances and are listed as owed to that partner.",
} as const;

export interface BalanceBreakdown {
  account: Account;
  opening: number;
  capitalIn: number;
  sales: number;
  topUps: number;
  transfersIn: number;
  dailyCostsPaid: number;
  fixedCostsPaid: number;
  villaPayouts: number;
  villaCostsPaid: number;
  transfersOut: number;
  withdrawals: number;
  balance: number;
}

export interface CashInputs {
  orders: OrderLine[];
  dailyCosts: DailyCost[];
  fixedCosts: FixedCost[];
  fixedPayments: FixedPayment[];
  movements: CashMovement[];
  villa?: VillaRecord[];
  capital?: CapitalContribution[];
}

/** Which account a sale's money lands in. */
export function accountForPayment(method: OrderLine["payment_method"]): Account {
  return method === "Cash" ? "Petty cash" : "Bank";
}

/**
 * Balance of one account up to and including `asOf` (or all time when omitted).
 * Monthly fixed costs reduce cash only when a payment is recorded (Fixed_Payments).
 * One-time fixed costs reduce cash on the 1st of month_paid.
 */
export function accountBalance(account: Account, input: CashInputs, asOf?: ISODate): BalanceBreakdown {
  const upTo = <T extends { date: string }>(rows: T[]) => (asOf ? rows.filter((r) => r.date <= asOf) : rows);
  const mv = upTo(input.movements);
  const amt = (pred: (m: CashMovement) => boolean) => sum(mv.filter(pred), (m) => m.amount);

  const opening = amt((m) => m.type === "Opening balance" && m.account === account);
  const topUps = amt((m) => m.type === "Top-up" && m.account === account);
  const withdrawals = amt((m) => m.type === "Withdrawal" && m.account === account);

  const pettyToBank = amt((m) => m.type === "Transfer petty→bank" || m.type === "Cash sales deposit");
  const bankToPetty = amt((m) => m.type === "Transfer bank→petty");
  const transfersIn = account === "Petty cash" ? bankToPetty : pettyToBank;
  const transfersOut = account === "Petty cash" ? pettyToBank : bankToPetty;

  const sales = sum(
    upTo(input.orders).filter((o) => accountForPayment(o.payment_method) === account),
    (o) => o.line_total,
  );

  const dailyCostsPaid = sum(
    upTo(input.dailyCosts).filter((c) => c.paid_from === account && c.paid_by === "Business"),
    (c) => c.amount,
  );

  const monthlyPaid = sum(
    input.fixedPayments.filter((p) => p.paid_from === account && (!asOf || (p.paid_date || `${p.month}-01`) <= asOf)),
    (p) => p.amount,
  );
  const oneTimePaid = sum(
    input.fixedCosts.filter(
      (f) => f.frequency === "One-time" && f.paid_from === account && f.month_paid && (!asOf || `${f.month_paid}-01` <= asOf),
    ),
    (f) => f.amount,
  );
  const fixedCostsPaid = monthlyPaid + oneTimePaid;

  // MO Villa: received payouts come in on payout_date (check-out date when blank); villa costs go out on their date.
  const villa = input.villa ?? [];
  const payoutDate = (r: VillaRecord) => r.payout_date || r.check_out;
  const villaPayouts = sum(
    villa.filter((r) => r.record_type === "Booking" && r.payout_status === "Received" && r.received_to === account && (!asOf || payoutDate(r) <= asOf)),
    (r) => r.net_payout,
  );
  const villaCostsPaid = sum(
    villa.filter((r) => r.record_type === "Cost" && r.paid_from === account && (!asOf || r.date_entered <= asOf)),
    (r) => r.cost_amount,
  );

  // Partner capital paid into this account ("Paid directly" never touches the accounts).
  const capitalIn = sum((input.capital ?? []).filter((c) => c.paid_into === account && (!asOf || c.date <= asOf)), (c) => c.amount);

  const balance =
    opening + capitalIn + sales + villaPayouts + topUps + transfersIn - dailyCostsPaid - fixedCostsPaid - villaCostsPaid - transfersOut - withdrawals;
  return { account, opening, capitalIn, sales, topUps, transfersIn, dailyCostsPaid, fixedCostsPaid, villaPayouts, villaCostsPaid, transfersOut, withdrawals, balance };
}

export function isPettyLow(balance: number, settings: Pick<Settings, "petty_low_threshold">): boolean {
  return balance < settings.petty_low_threshold;
}

/** Amounts paid personally by each partner (owed back by the business). */
export function owedToPartners(dailyCosts: DailyCost[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of dailyCosts) if (c.paid_by !== "Business") out[c.paid_by] = (out[c.paid_by] ?? 0) + c.amount;
  return out;
}
