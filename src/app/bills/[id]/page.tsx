import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { StorageError } from "@/components/StorageError";
import { billLabel, groupBills } from "@/lib/calc/bills";
import { num, rs } from "@/lib/calc/money";
import { receiptItemName } from "@/lib/receipt";
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
    receipt_footer: settings.receipt_footer, receipt_width_mm: settings.receipt_width_mm,
  };
  const receipt = {
    order_id: bill.order_id, date: bill.date, time: bill.time, meal: bill.lines[0]?.meal ?? "", payment_method: bill.lines[0]?.payment_method ?? "",
    notes: bill.notes, order_type: bill.order_type, table_no: bill.table_no, status: open ? "Open" : "Paid",
    lines: bill.lines.map((l) => ({ item_name: receiptItemName(l.item_name, sub(l.item_id)), qty: l.qty, unit_price: l.unit_price, line_total: l.line_total })),
  };

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <div className="spread">
        <h1 style={{ margin: 0 }}>{billLabel(bill)}</h1>
        <span className={`badge ${open ? "warn" : bill.status === "Paid" ? "good" : "bad"}`}>{open ? "Open – not paid" : bill.status}</span>
      </div>
      <div className="small muted">Opened {bill.date} {bill.time} · {bill.order_id}</div>

      <div className="card stack">
        {bill.lines.map((l) => (
          <div key={l.line_id} className="spread bill-line">
            <span style={{ flex: 1 }}>
              <b>{l.qty}×</b> {l.item_name}
              <span className="tile-group">{num(l.unit_price)} each</span>
            </span>
            <b className="num">{num(l.line_total)}</b>
            {open && <VoidButton orderId={bill.order_id} lineId={l.line_id} name={l.item_name} qty={l.qty} authorisers={authorisers} />}
          </div>
        ))}
        {bill.lines.length === 0 && <span className="muted">No items left on this bill.</span>}
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
        <BillActions orderId={bill.order_id} total={bill.total} receipt={receipt} receiptSettings={receiptSettings} authorisers={authorisers} hasItems={bill.lines.length > 0} />
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
