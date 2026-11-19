"use client";

import { useRef, useState } from "react";
import { deleteDailyCost, saveDailyCost } from "@/app/actions";
import { CsvButton, Tip, formToObject, useAction } from "@/components/ui";
import { HEADERS } from "@/lib/data/schema";
import { ACCOUNT_LABEL, CAFE_ACCOUNTS, PAID_BY, accountLabel, type DailyCost } from "@/lib/types";
import { CASH_FORMULAS, owedToPartners } from "@/lib/calc/cash";

const n = (v: number) => Math.round(v).toLocaleString("en-US");

export function CostsManager({ costs, allCosts, month, today, categories, subcategories, isPartner }: {
  costs: DailyCost[]; allCosts: DailyCost[]; month: string; today: string; categories: string[];
  subcategories: Record<string, string[]>; isPartner: boolean;
}) {
  const [editing, setEditing] = useState<DailyCost | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { pending, call, ui } = useAction();
  const [category, setCategory] = useState(categories[0] ?? "");
  const total = costs.reduce((t, c) => t + c.amount, 0);
  // Month totals by category (any category found in the month, incl. old ones and Uber commission), with sub-categories.
  const catNames = Array.from(new Set([...categories, ...costs.map((c) => c.category)]));
  const byCat = catNames
    .map((c) => {
      const rows = costs.filter((x) => x.category === c);
      const subs = Array.from(new Set(rows.map((x) => x.sub_category || ""))).map((sc) => ({ sc, t: rows.filter((x) => (x.sub_category || "") === sc).reduce((a, x) => a + x.amount, 0) }));
      return { c, t: rows.reduce((a, x) => a + x.amount, 0), subs: subs.filter((x) => x.sc).sort((a, b) => b.t - a.t) };
    })
    .filter((x) => x.t > 0);
  // Options for the form: an old entry keeps its old category / sub-category.
  const catOptions = editing && !categories.includes(editing.category) ? [...categories, editing.category] : categories;
  const subs = subcategories[category] ?? [];
  const subOptions = editing?.sub_category && editing.category === category && !subs.includes(editing.sub_category) ? [...subs, editing.sub_category] : subs;
  const startEdit = (c: DailyCost) => { setEditing(c); setCategory(c.category); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const stopEdit = () => { setEditing(null); setCategory(categories[0] ?? ""); };
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
            // Keep the category for the next entry (several buys of one kind in a row).
            setEditing(null);
            formRef.current?.reset();
          });
        }}
      >
        <b className="full">{editing ? "Edit cost" : "Add cost"}</b>
        <input type="hidden" name="cost_id" defaultValue={editing?.cost_id ?? ""} />
        <label className="field"><span>Date</span><input type="date" name="date" required defaultValue={editing?.date ?? today} /></label>
        <label className="field"><span>Amount (Rs)</span><input type="number" name="amount" inputMode="numeric" min={1} step={1} required defaultValue={editing?.amount ?? ""} /></label>
        <label className="field"><span>Category</span>
          <select name="category" value={category} onChange={(e) => setCategory(e.target.value)}>{catOptions.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        {subOptions.length > 0 ? (
          <label className="field"><span>Sub-category</span>
            <select key={category} name="sub_category" defaultValue={editing && editing.category === category ? editing.sub_category : subOptions[0]}>
              {subOptions.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        ) : <span />}
        <label className="field full"><span>Description{subOptions.length ? " (optional)" : ""}</span>
          <input name="description" required={!subOptions.length} defaultValue={editing?.description ?? ""} placeholder={subOptions.length ? "e.g. Fish market, 2 kg" : "e.g. Fish market"} />
        </label>
        <label className="field"><span>Paid from</span>
          <select name="paid_from" defaultValue={editing?.paid_from ?? "Petty cash"}>{CAFE_ACCOUNTS.map((a) => <option key={a} value={a}>{ACCOUNT_LABEL[a]}</option>)}</select>
        </label>
        <label className="field"><span>Paid by</span>
          <select name="paid_by" defaultValue={editing?.paid_by ?? "Business"}>{PAID_BY.map((a) => <option key={a}>{a}</option>)}</select>
        </label>
        <label className="field full"><span>Notes</span><input name="notes" defaultValue={editing?.notes ?? ""} /></label>
        <div className="row full">
          <button className="primary" disabled={pending} style={{ flex: 1 }}>{pending ? "Saving…" : editing ? "Update" : "Save cost"}</button>
          {editing && <button type="button" onClick={stopEdit}>Cancel</button>}
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
        {byCat.length === 0 && <div className="small muted" style={{ marginTop: 4 }}>No costs yet</div>}
        {byCat.length > 0 && (
          <table className="small" style={{ marginTop: 6 }}>
            <tbody>
              {byCat.map((x) => (
                <tr key={x.c}>
                  <td><b>{x.c}</b>{x.subs.length > 0 && <div className="muted">{x.subs.map((s) => `${s.sc} ${n(s.t)}`).join(" · ")}</div>}</td>
                  <td className="num"><b>{n(x.t)}</b></td>
                  <td className="num muted">{total ? `${Math.round((x.t / total) * 100)}%` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
                <td>{c.date.slice(5)}</td><td>{c.category}{c.sub_category && <div className="small muted">{c.sub_category}</div>}</td><td>{c.description}{c.notes && <div className="small muted">{c.notes}</div>}</td>
                <td className="num">{n(c.amount)}</td><td>{accountLabel(c.paid_from)}</td><td>{c.paid_by}</td>
                {isPartner && (
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="small" onClick={() => startEdit(c)}>Edit</button>{" "}
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
