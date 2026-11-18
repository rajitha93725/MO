import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { today } from "@/lib/today";
import { accountBalance, isPettyLow, CASH_FORMULAS, type BalanceBreakdown } from "@/lib/calc/cash";
import { num, rs } from "@/lib/calc/money";
import { Tip, CsvButton } from "@/components/ui";
import { StorageError } from "@/components/StorageError";
import { HEADERS } from "@/lib/data/schema";
import { MovementForm, DeleteMovement } from "./MovementForm";
import { CAFE_MOVEMENT_TYPES, accountLabel, movementAccounts, movementLabel } from "@/lib/types";

function Breakdown({ b, tip, low }: { b: BalanceBreakdown; tip: string; low?: boolean }) {
  const cafe = b.account === "Petty cash";
  const villa = b.account === "Villa petty cash";
  // Each petty cash box only shows the lines of its own business.
  const rows: [string, number][] = [
    ["Opening balance", b.opening],
    ["+ Partner capital paid in", b.capitalIn],
    ...(!villa ? ([[cafe ? "+ Cash sales" : "+ Card, bank-transfer & Uber sales", b.sales]] as [string, number][]) : []),
    ...(!cafe ? ([["+ Villa payouts received", b.villaPayouts]] as [string, number][]) : []),
    ["+ Top-ups", b.topUps],
    ["+ Transfers in", b.transfersIn],
    ...(!villa ? ([["− Daily costs paid", -b.dailyCostsPaid], ["− Fixed costs paid", -b.fixedCostsPaid]] as [string, number][]) : []),
    ...(!cafe ? ([["− Villa costs paid", -b.villaCostsPaid]] as [string, number][]) : []),
    ["− Transfers out", -b.transfersOut],
    ["− Withdrawals", -b.withdrawals],
  ];
  return (
    <div className={`card ${low ? "stat warn" : ""}`}>
      <div className="spread"><b>{accountLabel(b.account)} <Tip text={tip} /></b>{low && <span className="badge bad">⚠ Low</span>}</div>
      <div style={{ fontSize: "1.6rem", fontWeight: 700 }} className={b.balance < 0 ? "neg" : ""}>{rs(b.balance)}</div>
      <table className="small">
        <tbody>
          {rows.map(([l, v]) => <tr key={l}><td>{l}</td><td className="num">{num(v)}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

export default async function CashPage() {
  // Owner: all accounts. Other partners: the cafe petty cash only (the bank and villa box carry villa money).
  const user = await requirePage("partner");
  const owner = user.owner;
  let data;
  try {
    data = await repo.all();
  } catch (e) {
    return <StorageError error={e} />;
  }
  const { settings, movements } = data;
  const petty = accountBalance("Petty cash", data);
  const villaPetty = accountBalance("Villa petty cash", data);
  const bank = accountBalance("Bank", data);
  const low = isPettyLow(petty.balance, settings);
  const visible = owner ? movements : movements.filter((m) => CAFE_MOVEMENT_TYPES.includes(m.type) && movementAccounts(m).includes("Petty cash"));
  const sorted = [...visible].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="stack">
      <h1>{owner ? "Cash & bank" : "Cafe petty cash"}</h1>
      {low && <div className="errors">Cafe petty cash is below the low threshold of {rs(settings.petty_low_threshold)}. Top up from the bank.</div>}
      <div className={`grid ${owner ? "cols-3" : ""}`}>
        <Breakdown b={petty} tip={CASH_FORMULAS.petty} low={low} />
        {owner && <Breakdown b={villaPetty} tip={CASH_FORMULAS.villaPetty} />}
        {owner && <Breakdown b={bank} tip={CASH_FORMULAS.bank} />}
      </div>
      <p className="small muted" style={{ margin: 0 }}>{CASH_FORMULAS.partnerPaid} Partner capital is recorded on the <a href="/capital">Capital page</a>.</p>
      <MovementForm today={today(settings)} owner={owner} />
      <div className="spread">
        <h2>Movements</h2>
        <CsvButton filename={owner ? "cash-movements" : "cafe-petty-cash-movements"} headers={HEADERS.cash} rows={visible.map((m) => HEADERS.cash.map((h) => (h === "account" ? accountLabel(m.account) : (m as any)[h])))} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Account</th><th className="num">Amount</th><th>Moved by</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {sorted.map((m) => (
              <tr key={m.movement_id}>
                <td>{m.date}</td><td>{movementLabel(m.type)}</td><td>{accountLabel(m.account)}</td><td className="num">{num(m.amount)}</td><td>{m.moved_by || <span className="muted">-</span>}</td><td>{m.notes}</td>
                <td><DeleteMovement id={m.movement_id} /></td>
              </tr>
            ))}
            {sorted.length === 0 && <tr><td colSpan={7} className="muted">No movements yet – add the opening balances first.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
