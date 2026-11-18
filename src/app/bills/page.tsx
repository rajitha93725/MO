import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { StorageError } from "@/components/StorageError";
import { billLabel, openBills } from "@/lib/calc/bills";
import { rs } from "@/lib/calc/money";

export default async function BillsPage() {
  await requirePage("any");
  let lines;
  try {
    lines = await repo.orderLines();
  } catch (e) {
    return <StorageError error={e} />;
  }
  const bills = openBills(lines);
  const total = bills.reduce((t, b) => t + b.total, 0);
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
              <div className="spread"><b>{billLabel(b)}</b><b className="num">{rs(b.total)}</b></div>
              <div className="small muted">Opened {b.date} {b.time} · {b.items} item{b.items === 1 ? "" : "s"}: {b.lines.map((l) => `${l.qty}× ${l.item_name}`).join(", ")}</div>
            </div>
            <span className="btn small">Open →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
