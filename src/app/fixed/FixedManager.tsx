"use client";

import { useState } from "react";
import { deleteFixedCost, recordFixedPayment, saveFixedCost, undoFixedPayment } from "@/app/actions";
import { CsvButton, Tip, formToObject, useAction } from "@/components/ui";
import { HEADERS } from "@/lib/data/schema";
import { ACCOUNTS, type FixedCost, type FixedPayment } from "@/lib/types";
import type { FixedMonthLine } from "@/lib/calc/fixedCosts";
import { FORMULAS } from "@/lib/calc/profit";

const n = (v: number) => Math.round(v).toLocaleString("en-US");

export function FixedManager(props: {
  fixed: FixedCost[]; payments: FixedPayment[]; lines: FixedMonthLine[]; month: string; monthName: string; closed: boolean; today: string;
  allocation: string; basis: string; matrix: { months: string[]; rows: { name: string; cells: string[] }[] };
}) {
  const { fixed, payments, lines, month, monthName, closed, today, allocation, basis, matrix } = props;
  const [editing, setEditing] = useState<FixedCost | "new" | null>(null);
  const [paying, setPaying] = useState<FixedMonthLine | null>(null);
  const [freq, setFreq] = useState<string>("Monthly");
  const { pending, call, ui } = useAction();

  const planned = lines.reduce((t, l) => t + l.planned, 0);
  const actual = lines.reduce((t, l) => t + (l.actual ?? 0), 0);
  const counted = lines.reduce((t, l) => t + l.counted, 0);
  const startEdit = (f: FixedCost | "new") => {
    setEditing(f);
    setFreq(f === "new" ? "Monthly" : f.frequency);
  };

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>Fixed costs</h1>
        <form className="row" method="get">
          <input type="month" name="month" defaultValue={month} style={{ width: 170 }} aria-label="Month" />
          <button className="small">Show</button>
        </form>
      </div>
      {ui}

      <div className="card">
        <div className="spread">
          <b>{monthName} · planned vs actual {closed && <span className="badge">Closed month</span>}</b>
          <Tip text={`${FORMULAS.fixedCosts}. ${allocation}. Profit uses ${basis === "planned" ? "the planned amount" : "the actual payment when recorded, otherwise the plan"} (Settings: fixed_profit_basis).`} />
        </div>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table>
            <thead><tr><th>Item</th><th className="num">Planned</th><th className="num">Actual</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.fixed_id}>
                  <td>{l.name} {l.frequency === "One-time" && <span className="badge">one-time</span>}</td>
                  <td className="num">{n(l.planned)}</td>
                  <td className="num">{l.actual === null ? "-" : n(l.actual)}</td>
                  <td>{l.paid ? <span className="badge good">✓ Paid</span> : <span className="badge warn">Not paid</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {l.frequency === "Monthly" && !l.paid && <button className="small primary" onClick={() => setPaying(l)}>Mark paid</button>}
                    {l.frequency === "Monthly" && l.paid && (
                      <button className="small" disabled={pending} onClick={() => confirm("Remove the payment record?") && call(() => undoFixedPayment(l.fixed_id, month))}>Undo</button>
                    )}
                  </td>
                </tr>
              ))}
              {lines.length === 0 && <tr><td colSpan={5} className="muted">{closed ? "Closed month – no monthly fixed costs." : "No fixed costs this month."}</td></tr>}
              <tr className="total"><td>Total</td><td className="num">{n(planned)}</td><td className="num">{n(actual)}</td><td colSpan={2} className="small">Counted in profit: Rs {n(counted)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {paying && (
        <form
          className="card form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            const f = formToObject(e.currentTarget);
            call(() => recordFixedPayment(f), () => setPaying(null));
          }}
        >
          <b className="full">Record payment · {paying.name} · {monthName}</b>
          <input type="hidden" name="fixed_id" value={paying.fixed_id} />
          <input type="hidden" name="month" value={month} />
          <label className="field"><span>Amount paid (Rs)</span><input type="number" name="amount" inputMode="numeric" min={1} step={1} required defaultValue={paying.planned} /></label>
          <label className="field"><span>Paid date</span><input type="date" name="paid_date" required defaultValue={today} /></label>
          <label className="field"><span>Paid from</span>
            <select name="paid_from" defaultValue={fixed.find((f) => f.fixed_id === paying.fixed_id)?.paid_from ?? "Bank"}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select>
          </label>
          <label className="field"><span>Notes</span><input name="notes" /></label>
          <div className="row full">
            <button className="primary" disabled={pending}>Save payment</button>
            <button type="button" onClick={() => setPaying(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="spread">
        <h2>Payment status by month</h2>
      </div>
      <div className="table-wrap">
        <table className="small">
          <thead><tr><th>Item</th>{matrix.months.map((m) => <th key={m}>{m}</th>)}</tr></thead>
          <tbody>
            {matrix.rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                {r.cells.map((c, i) => (
                  <td key={i} style={{ textAlign: "center", background: c === "closed" ? "var(--closed)" : undefined }}>
                    {c === "paid" ? <span className="pos" aria-label="paid">✓</span> : c === "unpaid" ? <span className="neg" aria-label="not paid">✗</span> : c === "future" ? <span className="muted">·</span> : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ margin: 0 }}>✓ paid · ✗ not paid · grey = closed month</p>

      <div className="spread">
        <h2>Fixed cost list</h2>
        <div className="row">
          <CsvButton filename="fixed-costs" headers={HEADERS.fixedCosts} rows={fixed.map((f) => HEADERS.fixedCosts.map((h) => (f as any)[h]))} />
          <CsvButton filename="fixed-payments" headers={HEADERS.fixedPayments} rows={payments.map((f) => HEADERS.fixedPayments.map((h) => (f as any)[h]))} />
          <button className="small primary" onClick={() => startEdit("new")}>+ Add</button>
        </div>
      </div>

      {editing && (
        <form
          className="card form-grid"
          key={editing === "new" ? "new" : editing.fixed_id}
          onSubmit={(e) => {
            e.preventDefault();
            const f = formToObject(e.currentTarget);
            call(() => saveFixedCost(f), () => setEditing(null));
          }}
        >
          <b className="full">{editing === "new" ? "New fixed cost" : `Edit ${editing.name}`}</b>
          <input type="hidden" name="fixed_id" defaultValue={editing === "new" ? "" : editing.fixed_id} />
          <label className="field full"><span>Name</span>
            <input name="name" list="fixed-names" required defaultValue={editing === "new" ? "" : editing.name} />
            <datalist id="fixed-names">{["Rent", "Utility bills", "Staff salary", "Marketing", "Promotions", "Other"].map((x) => <option key={x} value={x} />)}</datalist>
          </label>
          <label className="field"><span>Amount (Rs)</span><input type="number" name="amount" inputMode="numeric" min={1} step={1} required defaultValue={editing === "new" ? "" : editing.amount} /></label>
          <label className="field"><span>Frequency</span>
            <select name="frequency" value={freq} onChange={(e) => setFreq(e.target.value)}><option>Monthly</option><option>One-time</option></select>
          </label>
          {freq === "Monthly" ? (
            <>
              <label className="field"><span>Start month</span><input type="month" name="start_month" required defaultValue={editing === "new" ? month : editing.start_month} /></label>
              <label className="field"><span>End month (optional)</span><input type="month" name="end_month" defaultValue={editing === "new" ? "" : editing.end_month} /></label>
            </>
          ) : (
            <label className="field"><span>Month paid</span><input type="month" name="month_paid" required defaultValue={editing === "new" ? month : editing.month_paid} /></label>
          )}
          <label className="field"><span>Paid from</span>
            <select name="paid_from" defaultValue={editing === "new" ? "Bank" : editing.paid_from}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select>
          </label>
          <label className="field full"><span>Notes</span><input name="notes" defaultValue={editing === "new" ? "" : editing.notes} /></label>
          <div className="row full">
            <button className="primary" disabled={pending}>Save</button>
            <button type="button" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="list">
        {fixed.map((f) => (
          <div key={f.fixed_id} className="item">
            <div className="grow">
              <b>{f.name}</b> <span className="badge">{f.frequency}</span>
              <div className="small muted">
                {f.frequency === "Monthly" ? `${f.start_month} → ${f.end_month || "ongoing"}` : `Paid ${f.month_paid}`} · {f.paid_from}
                {f.notes && ` · ${f.notes}`}
              </div>
            </div>
            <b className="num">Rs {n(f.amount)}</b>
            <button className="small" onClick={() => startEdit(f)}>Edit</button>
            <button className="small danger" disabled={pending} onClick={() => confirm(`Delete ${f.name}?`) && call(() => deleteFixedCost(f.fixed_id))}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
