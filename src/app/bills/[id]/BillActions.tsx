"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { payBill, printBill, voidItems } from "@/app/actions";
import { DiscountInput } from "@/app/order/OrderEntry";
import { discountAmount, discountProblem, type DiscountType } from "@/lib/calc/pricing";
import { useAction } from "@/components/ui";
import { printReceipt } from "@/components/printReceipt";
import { PAYMENT_METHODS, VOID_REASONS, type PaymentMethod } from "@/lib/types";
import type { ReceiptOrder, ReceiptSettings } from "@/lib/receipt";

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;

/**
 * The table flow: (1) print the bill (with discount and offer) and take it to the table,
 * (2) when the customer has paid, tap how they paid - done. Uber bills are completed with the Uber invoice no.
 */
export function BillActions({ orderId, uber, invoiceNo, total, receiptSettings, authorisers, hasItems, subtotal, discountType, discountValue, defaultOffer, offerText, printedAt }: {
  orderId: string; uber: boolean; invoiceNo: string; total: number; receipt: ReceiptOrder; receiptSettings: ReceiptSettings; authorisers: string[]; hasItems: boolean;
  subtotal: number; discountType: string; discountValue: number; defaultOffer: string; offerText: string; printedAt: string;
}) {
  const router = useRouter();
  const [dType, setDType] = useState<DiscountType>((discountType as DiscountType) || "");
  const [dValue, setDValue] = useState(discountValue);
  const [offerOn, setOfferOn] = useState(Boolean(offerText));
  const [offer, setOffer] = useState(offerText || defaultOffer);
  const dProblem = discountProblem(subtotal, dType, dValue, "Bill discount");
  const previewTotal = subtotal - (dProblem ? 0 : discountAmount(subtotal, dType, dValue));
  const discountChanged = dType !== (discountType || "") || dValue !== discountValue;
  const offerChanged = (offerOn ? offer.trim() : "") !== offerText;
  const changedSincePrint = discountChanged || offerChanged;
  const [pay, setPay] = useState<PaymentMethod | "">("");
  const [inv, setInv] = useState(invoiceNo);
  const [printPaid, setPrintPaid] = useState(false);
  const pr = useAction();
  const { pending, call, ui } = useAction();

  const print = () =>
    pr.call(() => printBill(orderId, { type: dType, value: dValue }, offerOn ? offer : ""), (r) => {
      if (r.receipt) printReceipt(r.receipt, receiptSettings);
      router.refresh();
    });
  const notPrinted = changedSincePrint ? "Print the bill first (discount / offer changed)" : "";

  return (
    <div className="stack">
      <Link href={`/order?bill=${encodeURIComponent(orderId)}`} className="btn">+ Add items</Link>

      {hasItems && (
        <div className="card stack step-card">
          <div className="spread"><b>① Bill for the table</b>{printedAt && !changedSincePrint && <span className="badge good">🖨 Printed {printedAt.slice(11)}</span>}</div>
          <div className="spread small"><span>Bill discount</span>{dType && !dProblem ? <span>−{rs(discountAmount(subtotal, dType, dValue))} of {rs(subtotal)}</span> : null}</div>
          <DiscountInput type={dType} value={dValue} onChange={(t, v) => { setDType(t); setDValue(v); }} />
          {dProblem && <div className="errors">{dProblem}</div>}
          <label className="row small"><input type="checkbox" checked={offerOn} onChange={(e) => setOfferOn(e.target.checked)} /> 🎁 Next-day offer on the bill</label>
          {offerOn && <input value={offer} onChange={(e) => setOffer(e.target.value)} maxLength={200} placeholder="e.g. Show this bill tomorrow: 10% off breakfast" />}
          <button type="button" className={printedAt && !changedSincePrint ? "" : "primary"} disabled={pr.pending || Boolean(dProblem)} onClick={print}>
            {pr.pending ? "Saving…" : `🖨 ${printedAt ? "Print bill again" : "Print bill"} · ${rs(previewTotal)}`}
          </button>
          {pr.ui}
          <div className="small muted">Saves the discount and offer, then prints the bill with everything on it. Take it to the table.</div>
        </div>
      )}

      {hasItems && uber && (
        <div className="card stack step-card">
          <b>② Rider picked it up – complete the Uber order</b>
          <label className="field"><span>Uber invoice no. *</span>
            <input value={inv} onChange={(e) => setInv(e.target.value)} placeholder="e.g. 3F2A9" autoCapitalize="characters" spellCheck={false} maxLength={40} />
          </label>
          <button type="button" className="primary" disabled={pending || !inv.trim() || changedSincePrint}
            onClick={() => call(() => payBill(orderId, "Uber", inv), (r) => {
              if (r.receipt && printPaid) printReceipt(r.receipt, receiptSettings);
              router.push("/bills");
            })}>
            {pending ? "Saving…" : notPrinted || (inv.trim() ? `✓ Completed · Uber ${rs(total)}` : "Type the Uber invoice no.")}
          </button>
          <label className="row small"><input type="checkbox" checked={printPaid} onChange={(e) => setPrintPaid(e.target.checked)} /> Also print a paid receipt</label>
        </div>
      )}

      {hasItems && !uber && (
        <div className="card stack step-card">
          <b>② Payment received – how did they pay?</b>
          <div className="seg" role="group" aria-label="Payment method">
            {PAYMENT_METHODS.map((p) => (
              <button key={p} type="button" className={pay === p ? "on" : ""} aria-pressed={pay === p} onClick={() => setPay(p)}>{p}</button>
            ))}
          </div>
          <button type="button" className="primary" disabled={pending || !pay || changedSincePrint}
            onClick={() => pay && call(() => payBill(orderId, pay), (r) => {
              if (r.receipt && printPaid) printReceipt(r.receipt, receiptSettings);
              router.push("/bills");
            })}>
            {pending ? "Saving…" : notPrinted || (pay ? `✓ Paid ${rs(total)} · ${pay} – done` : "Tap Cash, Card or Bank transfer")}
          </button>
          <label className="row small"><input type="checkbox" checked={printPaid} onChange={(e) => setPrintPaid(e.target.checked)} /> Also print a paid receipt</label>
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
