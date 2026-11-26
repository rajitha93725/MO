import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { StorageError } from "@/components/StorageError";
import { billLabel, minutesOpen, openBills } from "@/lib/calc/bills";
import { OpenFor } from "@/components/OpenFor";
import { nowTime, today } from "@/lib/today";
import { rs } from "@/lib/calc/money";

export default async function BillsPage() {
  await requirePage("any");
  let lines, settings;
  try {
    [lines, settings] = await Promise.all([repo.orderLines(), repo.settings()]);
  } catch (e) {
    return <StorageError error={e} />;
  }
  const bills = openBills(lines);
  const total = bills.reduce((t, b) => t + b.total, 0);
  const t = today(settings);
  const now = nowTime(settings);
  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>🧾 Open bills</h1>
        <Link href="/order" className="btn primary">+ New order</Link>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Sent to the kitchen, not paid yet. They count as sales only after payment. {bills.length ? `${bills.length} open · ${rs(total)}` : ""}
      </p>
      <div className="list">
        {bills.length === 0 && <span className="muted">No open bills.</span>}
        {bills.map((b) => (
          <Link key={b.order_id} href={`/bills/${encodeURIComponent(b.order_id)}`} className="item" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="grow">
              <div className="spread bill-row-head"><b>{billLabel(b)}{b.invoice_no ? <span className="small muted"> · {b.invoice_no}</span> : null}</b><b className="num">{rs(b.total)}</b></div>
              <div className="small"><b><OpenFor minutes={minutesOpen(b, t, now)} /></b> at the table</div>
              {b.printed_at && <span className="badge good small">🖨 Bill printed {b.printed_at.slice(11)} · waiting for payment</span>}
              <div className="small muted">Opened {b.date} {b.time} · {b.items} item{b.items === 1 ? "" : "s"}: {b.lines.map((l) => `${l.qty}× ${l.item_name}`).join(", ")}</div>
            </div>
            <span className="btn small">Open →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
