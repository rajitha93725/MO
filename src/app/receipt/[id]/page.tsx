import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { groupOrders } from "@/lib/calc/report";
import { num } from "@/lib/calc/money";
import { StorageError } from "@/components/StorageError";
import { AutoPrint, PrintReceiptButton } from "./ReceiptActions";

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  await requirePage("any");
  const { id } = await params;
  const { print } = await searchParams;
  let orders, settings;
  try {
    [orders, settings] = await Promise.all([repo.orders(), repo.settings()]);
  } catch (e) {
    return <StorageError error={e} />;
  }
  const orderId = decodeURIComponent(id);
  const lines = orders.filter((o) => o.order_id === orderId);
  if (!lines.length) {
    return (
      <div className="stack">
        <h1>Receipt</h1>
        <div className="errors">Order {orderId} was not found. It may have been deleted.</div>
        <Link href="/order" className="btn primary">New order</Link>
      </div>
    );
  }
  const [o] = groupOrders(lines);
  const notes = lines.find((l) => l.notes)?.notes ?? "";
  const width = settings.receipt_width_mm;

  return (
    <div className="stack">
      {/* Paper size for this page only (Settings: receipt_width_mm). */}
      <style>{`@page { size: ${width}mm auto; margin: 3mm; } @media print { .receipt { width: auto; max-width: none; } }`}</style>
      {print === "1" && <AutoPrint />}
      <div className="row no-print">
        <PrintReceiptButton />
        <Link href="/order" className="btn primary">+ New order</Link>
        <Link href={`/sales?date=${o.date}`} className="btn">Sales</Link>
      </div>

      <div className="receipt" style={{ width: `${width}mm` }}>
        <div className="r-center">
          <div className="r-title">{settings.receipt_name}</div>
          {settings.receipt_address && <div>{settings.receipt_address}</div>}
        </div>
        <div className="r-rule" />
        <div className="r-row"><span>{o.date} {o.time}</span><span>{o.meal}</span></div>
        <div>Order {o.order_id}</div>
        <div className="r-rule" />
        <table>
          <tbody>
            {lines.map((l) => (
              <tr key={l.line_id}>
                <td>
                  {l.item_name}
                  <div className="r-small">{l.qty} × {num(l.unit_price)}</div>
                </td>
                <td className="num">{num(l.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="r-rule" />
        <div className="r-row r-total"><span>TOTAL (Rs)</span><span>{num(o.total)}</span></div>
        <div className="r-row"><span>Paid by</span><span>{o.payment_method}</span></div>
        <div className="r-row"><span>Items</span><span>{o.qty}</span></div>
        {notes && <div className="r-small">Note: {notes}</div>}
        <div className="r-rule" />
        {settings.receipt_footer && <div className="r-center">{settings.receipt_footer}</div>}
      </div>
    </div>
  );
}
