import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { receiptHtml, receiptItemName, receiptPageCss, type ReceiptOrder } from "@/lib/receipt";
import { StorageError } from "@/components/StorageError";
import { orderTypeOf } from "@/lib/types";
import { AutoPrint, PrintReceiptButton } from "./ReceiptActions";

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  await requirePage("any");
  const { id } = await params;
  const { print } = await searchParams;
  let orders, settings, menu;
  try {
    [orders, settings, menu] = await Promise.all([repo.orderLines(), repo.settings(), repo.menu()]);
  } catch (e) {
    return <StorageError error={e} />;
  }
  const orderId = decodeURIComponent(id);
  let lines = orders.filter((o) => o.order_id === orderId && o.status !== "Void");
  // Just saved? Read straight from the database to be sure.
  if (!lines.length) {
    try {
      lines = (await repo.ordersFresh()).filter((o) => o.order_id === orderId && o.status !== "Void");
    } catch (e) {
      return <StorageError error={e} />;
    }
  }
  if (!lines.length) {
    return (
      <div className="stack">
        <h1>Receipt</h1>
        <div className="errors">Order {orderId} was not found. It may have been deleted.</div>
        <Link href="/order" className="btn primary">New order</Link>
      </div>
    );
  }
  const o = lines[0];
  const order: ReceiptOrder = {
    order_id: o.order_id, date: o.date, time: o.time, meal: o.meal, payment_method: o.payment_method,
    notes: lines.find((l) => l.notes)?.notes ?? "",
    order_type: orderTypeOf(o), table_no: o.table_no, status: lines.some((l) => l.status === "Open") ? "Open" : "Paid",
    lines: lines.map((l) => ({
      item_name: receiptItemName(l.item_name, menu.find((m) => m.item_id === l.item_id)?.sub_category),
      qty: l.qty, unit_price: l.unit_price, line_total: l.line_total,
    })),
  };
  const width = settings.receipt_width_mm;

  return (
    <div className="stack">
      {/* Paper size for this page only (Settings: receipt_width_mm). */}
      <style>{`${receiptPageCss(width)} @media print { .receipt { width: auto !important; max-width: none; } }`}</style>
      {print === "1" && <AutoPrint />}
      <div className="row no-print">
        <PrintReceiptButton />
        <Link href="/order" className="btn primary">+ New order</Link>
        <Link href={`/sales?date=${o.date}`} className="btn">Sales</Link>
      </div>
      <div className="receipt" style={{ width: `${width}mm` }} dangerouslySetInnerHTML={{ __html: receiptHtml(order, settings) }} />
    </div>
  );
}
