"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { payBill, voidItems } from "@/app/actions";
import { useAction } from "@/components/ui";
import { printReceipt } from "@/components/printReceipt";
import { PAYMENT_METHODS, VOID_REASONS, type PaymentMethod } from "@/lib/types";
import type { ReceiptOrder, ReceiptSettings } from "@/lib/receipt";

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const PRINT_KEY = "mo.printReceipt";
const wantsPrint = () => {
  try {
    return localStorage.getItem(PRINT_KEY) !== "0";
  } catch {
    return true;
  }
};

/** Add items, print the bill, take payment, or void the whole bill. */
export function BillActions({ orderId, uber, invoiceNo, total, receipt, receiptSettings, authorisers, hasItems }: {
  orderId: string; uber: boolean; invoiceNo: string; total: number; receipt: ReceiptOrder; receiptSettings: ReceiptSettings; authorisers: string[]; hasItems: boolean;
}) {
  const router = useRouter();
  const [pay, setPay] = useState<PaymentMethod>("Cash");
  const [inv, setInv] = useState(invoiceNo);
  const [confirming, setConfirming] = useState(false);
  const { pending, call, ui } = useAction();
  return (
    <div className="stack">
      <div className="row">
        <Link href={`/order?bill=${encodeURIComponent(orderId)}`} className="btn" style={{ flex: 1 }}>+ Add items</Link>
        <button type="button" style={{ flex: 1 }} disabled={!hasItems} onClick={() => printReceipt(receipt, receiptSettings)}>🖨 Print bill</button>
      </div>

      {hasItems && uber && (
        <div className="card stack">
          <b>🛵 Rider picked it up – complete the Uber order</b>
          <label className="field"><span>Uber invoice no. *</span>
            <input value={inv} onChange={(e) => setInv(e.target.value)} placeholder="e.g. 3F2A9" autoCapitalize="characters" spellCheck={false} maxLength={40} />
          </label>
          <button type="button" className="primary" disabled={pending || !inv.trim()}
            onClick={() => call(() => payBill(orderId, "Uber", inv), (r) => {
              if (r.receipt && wantsPrint()) printReceipt(r.receipt, receiptSettings);
              router.push("/bills");
            })}>
            {pending ? "Saving…" : inv.trim() ? `✓ Completed · Uber ${rs(total)}` : "Type the Uber invoice no."}
          </button>
          <div className="small muted">Uber pays to the bank; the commission is saved as a daily cost now.</div>
        </div>
      )}
      {hasItems && !uber && (
        <div className="card stack">
          <b>Customer pays</b>
          <div className="seg" role="group" aria-label="Payment method">
            {PAYMENT_METHODS.map((p) => (
              <button key={p} type="button" className={pay === p ? "on" : ""} aria-pressed={pay === p} onClick={() => { setPay(p); setConfirming(false); }}>{p}</button>
            ))}
          </div>
          {!confirming ? (
            <button type="button" className="primary" onClick={() => setConfirming(true)}>Review payment · {rs(total)}</button>
          ) : (
            <div className="stack">
              <div className="spread"><span>Total to pay</span><b style={{ fontSize: "1.3rem" }}>{rs(total)}</b></div>
              <div className="spread"><span>Paid by</span><b>{pay}</b></div>
              <div className="row">
                <button type="button" onClick={() => setConfirming(false)} style={{ flex: 1 }}>Back</button>
                <button type="button" className="primary" disabled={pending} style={{ flex: 2 }}
                  onClick={() => call(() => payBill(orderId, pay), (r) => {
                    if (r.receipt && wantsPrint()) printReceipt(r.receipt, receiptSettings);
                    router.push("/bills");
                  })}>
                  {pending ? "Saving…" : `✓ Paid ${rs(total)} · ${pay}`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {ui}
      <VoidButton orderId={orderId} lineId="" name="the whole bill" qty={1} authorisers={authorisers} />
    </div>
  );
}

/** Void one item (or the whole bill when lineId is ""). Needs a partner's password. */
export function VoidButton({ orderId, lineId, name, qty, authorisers }: { orderId: string; lineId: string; name: string; qty: number; authorisers: string[] }) {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(1); // usually one item is cancelled; change it for more
  const [reason, setReason] = useState<string>(VOID_REASONS[0]);
  const [note, setNote] = useState("");
  const [by, setBy] = useState(authorisers[0] ?? "");
  const [pw, setPw] = useState("");
  const { pending, call, ui } = useAction();
  const whole = !lineId;

  if (!open) {
    return (
      <button type="button" className={`small danger ${whole ? "" : ""}`} onClick={() => setOpen(true)} aria-label={`Void ${name}`}>
        {whole ? "Void whole bill" : "Void"}
      </button>
    );
  }
  return (
    <div className="card stack void-box" style={{ flexBasis: "100%" }}>
      <b>Void {whole ? "the whole bill" : name}</b>
      {authorisers.length === 0 ? (
        <div className="errors">No partner has a password yet. The owner can set one in Settings → Users &amp; roles.</div>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            call(() => voidItems({ order_id: orderId, line_id: lineId, qty: n, reason, note, authorised_by: by, password: pw }), () => { setOpen(false); setPw(""); });
          }}
        >
          {!whole && qty > 1 && (
            <label className="field"><span>How many to void (of {qty})</span>
              <input type="number" min={1} max={qty} value={n} onChange={(e) => setN(Math.max(1, Math.min(qty, Number(e.target.value) || 1)))} />
            </label>
          )}
          <label className="field"><span>Reason</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>{VOID_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          </label>
          <label className="field"><span>Note {reason === "Other" ? "*" : "(optional)"}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. guest changed their mind" required={reason === "Other"} />
          </label>
          <div className="form-grid">
            <label className="field"><span>Authorised by</span>
              <select value={by} onChange={(e) => setBy(e.target.value)}>{authorisers.map((a) => <option key={a}>{a}</option>)}</select>
            </label>
            <label className="field"><span>Their password</span>
              <input type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} required />
            </label>
          </div>
          {ui}
          <div className="row">
            <button type="button" onClick={() => { setOpen(false); setPw(""); }} style={{ flex: 1 }}>Cancel</button>
            <button className="danger" disabled={pending || !pw} style={{ flex: 2 }}>{pending ? "Checking…" : "Void"}</button>
          </div>
        </form>
      )}
    </div>
  );
}
