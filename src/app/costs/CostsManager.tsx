"use client";

import { useRef, useState } from "react";
import { deleteDailyCost, saveDailyCost } from "@/app/actions";
import { CsvButton, Tip, formToObject, useAction } from "@/components/ui";
import { HEADERS } from "@/lib/data/schema";
import { ACCOUNTS, PAID_BY, type DailyCost } from "@/lib/types";
import { CASH_FORMULAS, owedToPartners } from "@/lib/calc/cash";

const n = (v: number) => Math.round(v).toLocaleString("en-US");

export function CostsManager({ costs, allCosts, month, today, categories, isPartner }: {
  costs: DailyCost[]; allCosts: DailyCost[]; month: string; today: string; categories: string[]; isPartner: boolean;
}) {
  const [editing, setEditing] = useState<DailyCost | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { pending, call, ui } = useAction();
  const total = costs.reduce((t, c) => t + c.amount, 0);
  const byCat = categories.map((c) => ({ c, t: costs.filter((x) => x.category === c).reduce((a, x) => a + x.amount, 0) })).filter((x) => x.t > 0);
  const owed = owedToPartners(allCosts);

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>Daily costs</h1>
        <div className="row">
          <a className="btn small" href="/fixed">Fixed costs →</a>
        </div>
      </div>

      <form
        ref={formRef}
        key={editing?.cost_id ?? "new"}
        className="card form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          const f = formToObject(e.currentTarget);
          call(() => saveDailyCost(f), () => {
            setEditing(null);
            formRef.current?.reset();
          });
        }}
      >
        <b className="full">{editing ? "Edit cost" : "Add cost"}</b>
        <input type="hidden" name="cost_id" defaultValue={editing?.cost_id ?? ""} />
        <label className="field"><span>Date</span><input type="date" name="date" required defaultValue={editing?.date ?? today} /></label>
        <label className="field"><span>Amount (Rs)</span><input type="number" name="amount" inputMode="numeric" min={1} step={1} required defaultValue={editing?.amount ?? ""} /></label>
        <label className="field full"><span>Category</span>
          <select name="category" defaultValue={editing?.category ?? categories[0]}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        <label className="field full"><span>Description</span><input name="description" required defaultValue={editing?.description ?? ""} placeholder="e.g. Fish market" /></label>
        <label className="field"><span>Paid from</span>
          <select name="paid_from" defaultValue={editing?.paid_from ?? "Petty cash"}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select>
        </label>
        <label className="field"><span>Paid by</span>
          <select name="paid_by" defaultValue={editing?.paid_by ?? "Business"}>{PAID_BY.map((a) => <option key={a}>{a}</option>)}</select>
        </label>
        <label className="field full"><span>Notes</span><input name="notes" defaultValue={editing?.notes ?? ""} /></label>
        <div className="row full">
          <button className="primary" disabled={pending} style={{ flex: 1 }}>{pending ? "Saving…" : editing ? "Update" : "Save cost"}</button>
          {editing && <button type="button" onClick={() => setEditing(null)}>Cancel</button>}
        </div>
      </form>
      {ui}

      <div className="spread">
        <form className="row" method="get">
          <input type="month" name="month" defaultValue={month} style={{ width: 170 }} aria-label="Month" />
          <button className="small">Show</button>
        </form>
        <CsvButton filename={`daily-costs-${month}`} headers={HEADERS.dailyCosts} rows={costs.map((c) => HEADERS.dailyCosts.map((h) => (c as any)[h]))} />
      </div>

      <div className="card">
        <div className="spread"><b>Total {month}</b><b className="num">Rs {n(total)}</b></div>
        <div className="small muted" style={{ marginTop: 4 }}>{byCat.map((x) => `${x.c}: ${n(x.t)}`).join(" · ") || "No costs yet"}</div>
        {Object.keys(owed).length > 0 && (
          <div className="small" style={{ marginTop: 6 }}>
            Owed to partners (all time) <Tip text={CASH_FORMULAS.partnerPaid} />: {Object.entries(owed).map(([k, v]) => `${k} Rs ${n(v)}`).join(" · ")}
          </div>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Category</th><th>Description</th><th className="num">Amount</th><th>From</th><th>By</th>{isPartner && <th></th>}</tr></thead>
          <tbody>
            {costs.map((c) => (
              <tr key={c.cost_id}>
                <td>{c.date.slice(5)}</td><td>{c.category}</td><td>{c.description}{c.notes && <div className="small muted">{c.notes}</div>}</td>
                <td className="num">{n(c.amount)}</td><td>{c.paid_from}</td><td>{c.paid_by}</td>
                {isPartner && (
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="small" onClick={() => { setEditing(c); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>{" "}
                    <button className="small danger" disabled={pending} onClick={() => confirm("Delete this cost?") && call(() => deleteDailyCost(c.cost_id))}>✕</button>
                  </td>
                )}
              </tr>
            ))}
            {costs.length === 0 && <tr><td colSpan={7} className="muted">No costs this month.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
