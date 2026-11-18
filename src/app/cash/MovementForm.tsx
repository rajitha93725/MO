"use client";
import { useRef, useState } from "react";
import { deleteMovement, saveMovement } from "@/app/actions";
import { formToObject, useAction } from "@/components/ui";
import { ACCOUNTS, ACCOUNT_LABEL, CAFE_MOVEMENT_TYPES, MOVED_BY, MOVEMENT_TYPES, TRANSFERS, movementLabel, type MovementType } from "@/lib/types";

export function MovementForm({ today, owner }: { today: string; owner: boolean }) {
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
        <select name="type" value={type} onChange={(e) => setType(e.target.value)}>{(owner ? MOVEMENT_TYPES : CAFE_MOVEMENT_TYPES).map((t) => <option key={t} value={t}>{movementLabel(t)}</option>)}</select>
      </label>
      {TRANSFERS[type as MovementType] ? (
        <div className="field small muted" style={{ alignSelf: "end", paddingBottom: 12 }}>
          {TRANSFERS[type as MovementType]!.map((a) => ACCOUNT_LABEL[a]).join(" → ")}
        </div>
      ) : (
        <label className="field"><span>Account</span>
          <select name="account" defaultValue="Petty cash">{(owner ? ACCOUNTS : (["Petty cash"] as const)).map((a) => <option key={a} value={a}>{ACCOUNT_LABEL[a]}</option>)}</select>
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
