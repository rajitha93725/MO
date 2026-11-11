"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { deleteCapital, saveCapital } from "@/app/actions";
import { formToObject, useAction } from "@/components/ui";
import { CAPITAL_BUSINESSES, CAPITAL_PAID_INTO, type CapitalContribution } from "@/lib/types";

export function CapitalForm({ editing, partners, today }: { editing: CapitalContribution | null; partners: string[]; today: string }) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const { pending, call, ui } = useAction();
  return (
    <form
      ref={ref}
      className="card form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        const f = formToObject(e.currentTarget);
        call(() => saveCapital(f), () => {
          if (editing) router.push("/capital");
          else ref.current?.reset();
        });
      }}
    >
      <b className="full">{editing ? "Edit contribution" : "Add contribution"}</b>
      <input type="hidden" name="capital_id" value={editing?.capital_id ?? ""} />
      <label className="field"><span>Partner *</span>
        <select name="partner" defaultValue={editing?.partner ?? partners[0]}>{partners.map((p) => <option key={p}>{p}</option>)}</select>
      </label>
      <label className="field"><span>Date *</span><input type="date" name="date" required defaultValue={editing?.date ?? today} /></label>
      <label className="field"><span>Business *</span>
        <select name="business" defaultValue={editing?.business ?? "MO Cafe"}>{CAPITAL_BUSINESSES.map((b) => <option key={b}>{b}</option>)}</select>
      </label>
      <label className="field"><span>Amount (Rs) *</span><input type="number" name="amount" inputMode="numeric" min={1} step={1} required defaultValue={editing?.amount || ""} /></label>
      <label className="field full"><span>Description *</span><input name="description" required defaultValue={editing?.description ?? ""} placeholder="e.g. Kitchen equipment, villa furniture" /></label>
      <label className="field full"><span>Paid into</span>
        <select name="paid_into" defaultValue={editing?.paid_into ?? "Paid directly"}>
          {CAPITAL_PAID_INTO.map((p) => <option key={p} value={p}>{p === "Paid directly" ? "Paid directly (to a supplier – no account change)" : `Business ${p.toLowerCase()} (raises the balance)`}</option>)}
        </select>
      </label>
      <label className="field full"><span>Notes</span><input name="notes" defaultValue={editing?.notes ?? ""} /></label>
      <div className="full">{ui}</div>
      <div className="row full">
        <button className="primary" disabled={pending} style={{ flex: 1 }}>{pending ? "Saving…" : editing ? "Update" : "Save contribution"}</button>
        {editing && <button type="button" onClick={() => router.push("/capital")}>Cancel</button>}
      </div>
    </form>
  );
}

export function DeleteCapitalButton({ id }: { id: string }) {
  const { pending, call, ui } = useAction();
  return (
    <>
      <button className="small danger" disabled={pending} onClick={() => confirm("Delete this contribution?") && call(() => deleteCapital(id))} aria-label="Delete contribution">✕</button>
      {ui}
    </>
  );
}
