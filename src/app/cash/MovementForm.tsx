"use client";
import { useRef, useState } from "react";
import { deleteMovement, saveMovement } from "@/app/actions";
import { formToObject, useAction } from "@/components/ui";
import { ACCOUNTS, MOVED_BY, MOVEMENT_TYPES } from "@/lib/types";

const FIXED_DIRECTION: Record<string, string> = {
  "Transfer petty→bank": "Petty cash → Bank",
  "Transfer bank→petty": "Bank → Petty cash",
  "Cash sales deposit": "Petty cash → Bank (cash takings banked)",
};

export function MovementForm({ today }: { today: string }) {
  const [type, setType] = useState<string>("Top-up");
  const ref = useRef<HTMLFormElement>(null);
  const { pending, call, ui } = useAction();
  return (
    <form
      ref={ref}
      className="card form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        const f = formToObject(e.currentTarget);
        call(() => saveMovement(f), () => ref.current?.reset());
      }}
    >
      <b className="full">Add movement</b>
      <label className="field"><span>Date</span><input type="date" name="date" required defaultValue={today} /></label>
      <label className="field"><span>Amount (Rs)</span><input type="number" name="amount" inputMode="numeric" min={1} step={1} required /></label>
      <label className="field"><span>Type</span>
        <select name="type" value={type} onChange={(e) => setType(e.target.value)}>{MOVEMENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
      </label>
      {FIXED_DIRECTION[type] ? (
        <div className="field small muted" style={{ alignSelf: "end", paddingBottom: 12 }}>{FIXED_DIRECTION[type]}</div>
      ) : (
        <label className="field"><span>Account</span>
          <select name="account" defaultValue="Petty cash">{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select>
        </label>
      )}
      <label className="field"><span>Moved by *</span>
        <select name="moved_by" required defaultValue="">
          <option value="" disabled>Who moved the money?</option>
          {MOVED_BY.map((m) => <option key={m}>{m}</option>)}
        </select>
      </label>
      <label className="field"><span>Notes</span><input name="notes" placeholder="e.g. ATM withdrawal, slip no." /></label>
      <div className="full"><button className="primary" disabled={pending} style={{ width: "100%" }}>Save movement</button></div>
      <div className="full">{ui}</div>
    </form>
  );
}

export function DeleteMovement({ id }: { id: string }) {
  const { pending, call, ui } = useAction();
  return (
    <>
      <button className="small danger" disabled={pending} onClick={() => confirm("Delete this movement?") && call(() => deleteMovement(id))} aria-label="Delete">✕</button>
      {ui}
    </>
  );
}
