import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { receiptFromLines, receiptHtml, type ReceiptOrder } from "@/lib/receipt";
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
  const order: ReceiptOrder = receiptFromLines(lines, (id) => menu.find((m) => m.item_id === id)?.sub_category);
  const width = settings.receipt_width_mm;
  const paper = { widthMm: width, heightMm: settings.receipt_height_mm, fontPx: settings.receipt_font_px, maxPageMm: settings.receipt_max_page_mm };

  return (
    <div className="stack">
      {/* Exact paper size is set when printing (Settings: receipt_width_mm / receipt_height_mm). */}
      {print === "1" && <AutoPrint paper={paper} />}
      <div className="row no-print">
        <PrintReceiptButton paper={paper} />
        <Link href="/order" className="btn primary">+ New order</Link>
        <Link href={`/sales?date=${o.date}`} className="btn">Sales</Link>
      </div>
      <div className="small muted no-print" style={{ textAlign: "center" }}>
        Text {settings.receipt_font_px} px · paper {width} mm × {settings.receipt_height_mm ? `${settings.receipt_height_mm} mm (label)` : `receipt length, up to ${settings.receipt_max_page_mm} mm a page (roll)`} · change in Settings
      </div>
      <div className="receipt" style={{ width: `${width}mm`, ["--receipt-font" as string]: `${settings.receipt_font_px}px` }} dangerouslySetInnerHTML={{ __html: receiptHtml(order, { ...settings, logo_url: "/logo.png" }) }} />
    </div>
  );
}
