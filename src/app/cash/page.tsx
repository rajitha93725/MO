import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { today } from "@/lib/today";
import { accountBalance, isPettyLow, CASH_FORMULAS, type BalanceBreakdown } from "@/lib/calc/cash";
import { num, rs } from "@/lib/calc/money";
import { Tip, CsvButton } from "@/components/ui";
import { StorageError } from "@/components/StorageError";
import { HEADERS } from "@/lib/data/schema";
import { MovementForm, DeleteMovement } from "./MovementForm";

function Breakdown({ b, tip, low }: { b: BalanceBreakdown; tip: string; low?: boolean }) {
  const rows: [string, number][] = [
    ["Opening balance", b.opening],
    ["+ Partner capital paid in", b.capitalIn],
    [b.account === "Petty cash" ? "+ Cash sales" : "+ Card & bank-transfer sales", b.sales],
    ["+ Villa payouts received", b.villaPayouts],
    ["+ Top-ups", b.topUps],
    ["+ Transfers in", b.transfersIn],
    ["− Daily costs paid", -b.dailyCostsPaid],
    ["− Fixed costs paid", -b.fixedCostsPaid],
    ["− Villa costs paid", -b.villaCostsPaid],
    ["− Transfers out", -b.transfersOut],
    ["− Withdrawals", -b.withdrawals],
  ];
  return (
    <div className={`card ${low ? "stat warn" : ""}`}>
      <div className="spread"><b>{b.account} <Tip text={tip} /></b>{low && <span className="badge bad">⚠ Low</span>}</div>
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
  await requirePage("partner");
  let data;
  try {
    data = await repo.all();
  } catch (e) {
    return <StorageError error={e} />;
  }
  const { settings, movements } = data;
  const petty = accountBalance("Petty cash", data);
  const bank = accountBalance("Bank", data);
  const low = isPettyLow(petty.balance, settings);
  const sorted = [...movements].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="stack">
      <h1>Cash &amp; bank</h1>
      {low && <div className="errors">Petty cash is below the low threshold of {rs(settings.petty_low_threshold)}. Top up from the bank.</div>}
      <div className="grid md-2">
        <Breakdown b={petty} tip={CASH_FORMULAS.petty} low={low} />
        <Breakdown b={bank} tip={CASH_FORMULAS.bank} />
      </div>
      <p className="small muted" style={{ margin: 0 }}>{CASH_FORMULAS.partnerPaid} Partner capital is recorded on the <a href="/capital">Capital page</a>.</p>
      <MovementForm today={today(settings)} />
      <div className="spread">
        <h2>Movements</h2>
        <CsvButton filename="cash-movements" headers={HEADERS.cash} rows={movements.map((m) => HEADERS.cash.map((h) => (m as any)[h]))} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Account</th><th className="num">Amount</th><th>Moved by</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {sorted.map((m) => (
              <tr key={m.movement_id}>
                <td>{m.date}</td><td>{m.type}</td><td>{m.account}</td><td className="num">{num(m.amount)}</td><td>{m.moved_by || <span className="muted">-</span>}</td><td>{m.notes}</td>
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
