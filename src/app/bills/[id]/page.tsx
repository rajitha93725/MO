import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { StorageError } from "@/components/StorageError";
import { billLabel, groupBills } from "@/lib/calc/bills";
import { num, rs } from "@/lib/calc/money";
import { receiptFromLines } from "@/lib/receipt";
import { discountLabel, parseAddons } from "@/lib/calc/pricing";
import { BillActions, VoidButton } from "./BillActions";

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("any");
  const id = decodeURIComponent((await params).id);
  let lines, menu, settings, users;
  try {
    [lines, menu, settings, users] = await Promise.all([repo.ordersFresh(), repo.menu(), repo.settings(), repo.users()]);
  } catch (e) {
    return <StorageError error={e} />;
  }
  const bill = groupBills(lines.filter((l) => l.order_id === id))[0];
  if (!bill) {
    return (
      <div className="stack">
        <h1>Bill</h1>
        <div className="errors">Bill {id} was not found.</div>
        <Link href="/bills" className="btn">Open bills</Link>
      </div>
    );
  }
  const open = bill.status === "Open";
  // Partners with a password can authorise a void (only their names are sent to the browser).
  const authorisers = users.filter((u) => u.role === "partner" && u.password_hash).map((u) => u.name);
  const sub = (itemId: string) => menu.find((m) => m.item_id === itemId)?.sub_category;
  const receiptSettings = {
    receipt_name: settings.receipt_name, receipt_address: settings.receipt_address,
    receipt_footer: settings.receipt_footer, receipt_width_mm: settings.receipt_width_mm, receipt_height_mm: settings.receipt_height_mm, receipt_font_px: settings.receipt_font_px, logo_url: "/logo.png",
  };
  const receipt = receiptFromLines([...bill.lines, ...(bill.discount ? [bill.discount] : [])], sub);


  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <div className="spread">
        <h1 style={{ margin: 0 }}>{billLabel(bill)}</h1>
        <span className={`badge ${open ? "warn" : bill.status === "Paid" ? "good" : "bad"}`}>{open ? "Open – not paid" : bill.status}</span>
      </div>
      <div className="small muted">
        {bill.invoice_no ? <>Invoice <b>{bill.invoice_no}</b> · </> : bill.order_type === "Uber" ? <>Uber invoice not typed yet · </> : null}
        Opened {bill.date} {bill.time}
      </div>

      <div className="card stack">
        {bill.lines.map((l) => (
          <div key={l.line_id} className="spread bill-line">
            <span style={{ flex: 1 }}>
              <b>{l.qty}×</b> {l.item_name}
              <span className="tile-group">{num(l.unit_price)} each</span>
              {l.discount_amount > 0 && <span className="line-detail">Discount {discountLabel(l.discount_type, l.discount_value)} · −{num(l.discount_amount)}</span>}
              {parseAddons(l.addons).map((a, i) => <span key={i} className="line-detail">+ {a.name}{a.qty > 1 ? ` × ${a.qty}` : ""} · {num(a.price * a.qty)}</span>)}
              {l.item_note && <span className="line-detail">✎ {l.item_note}</span>}
            </span>
            <b className="num">{num(l.line_total)}</b>
            {open && <VoidButton orderId={bill.order_id} lineId={l.line_id} name={l.item_name} qty={l.qty} authorisers={authorisers} />}
          </div>
        ))}
        {bill.lines.length === 0 && <span className="muted">No items left on this bill.</span>}
        {bill.discount && (
          <>
            <div className="spread small" style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}><span>Subtotal</span><span>{num(bill.subtotal)}</span></div>
            <div className="spread small"><span>{bill.discount.item_name}</span><span>−{num(-bill.discount.line_total)}</span></div>
          </>
        )}
        <div className="spread" style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
          <b>Total</b><b className="num" style={{ fontSize: "1.3rem" }}>{rs(bill.total)}</b>
        </div>
        {bill.voided.length > 0 && (
          <div className="stack small">
            <b className="muted">Voided</b>
            {bill.voided.map((l) => (
              <div key={l.line_id} className="spread">
                <span className="bill-line void">{l.qty}× {l.item_name} · {num(l.line_total)}</span>
                <span className="muted">by {l.void_by} · {l.void_reason}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {open ? (
        <BillActions printedAt={bill.printed_at} defaultOffer={settings.next_day_offer} offerText={bill.lines.find((l) => l.offer_text)?.offer_text ?? ""}
          subtotal={bill.subtotal} discountType={bill.discount?.discount_type ?? ""} discountValue={bill.discount?.discount_value ?? 0} orderId={bill.order_id} uber={bill.order_type === "Uber"} invoiceNo={bill.invoice_no} total={bill.total} receipt={receipt} receiptSettings={receiptSettings} authorisers={authorisers} hasItems={bill.lines.length > 0} />
      ) : (
        <div className="row">
          <Link href={`/receipt/${encodeURIComponent(bill.order_id)}`} className="btn">🖨 Receipt</Link>
          <Link href="/bills" className="btn">Open bills</Link>
          <Link href="/order" className="btn primary">+ New order</Link>
        </div>
      )}
    </div>
  );
}
