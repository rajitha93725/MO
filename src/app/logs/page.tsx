import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { StorageError } from "@/components/StorageError";
import { filterLogs, visibleLogs } from "@/lib/activity";
import { today } from "@/lib/today";
import { addDays } from "@/lib/calc/dates";
import { LOG_BUSINESSES, type ActivityLog } from "@/lib/types";

const SHOW = 300;
const BIZ_ICON: Record<string, string> = { "MO Cafe": "☕", "MO Villa": "🏡", Admin: "🔒" };

export default async function LogsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  // Partners only. The owner sees everything; other partners see MO Cafe lines only.
  const user = await requirePage("partner");
  const sp = await searchParams;
  let logs: ActivityLog[], t: string;
  try {
    const [rows, settings] = await Promise.all([repo.logs(), repo.settings()]);
    logs = visibleLogs(rows, user.owner);
    t = today(settings);
  } catch (e) {
    return <StorageError error={e} />;
  }
  const from = sp.from ?? addDays(t, -6);
  const to = sp.to ?? t;
  const business = user.owner ? sp.business ?? "" : "MO Cafe";
  const category = sp.category ?? "";
  const q = sp.q ?? "";
  const categories = Array.from(new Set(logs.map((l) => l.category))).sort();
  const shown = filterLogs(logs, { business, category, from, to, q });
  const quick = (label: string, f: string, tt: string) => (
    <Link key={label} className={`btn small ${from === f && to === tt ? "primary" : ""}`}
      href={`/logs?${new URLSearchParams({ ...(business && user.owner ? { business } : {}), ...(category ? { category } : {}), ...(q ? { q } : {}), from: f, to: tt })}`}>
      {label}
    </Link>
  );

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>📋 MO Activity Logs</h1>
      <p className="small muted" style={{ margin: 0 }}>
        What was done, when and by whom – one line per action.{user.owner ? " ☕ MO Cafe lines are also visible to the other partners; 🏡 MO Villa and 🔒 Admin only to you." : " Showing MO Cafe."}
      </p>

      <form className="card form-grid logs-filter" method="get">
        {user.owner && (
          <label className="field"><span>Business</span>
            <select name="business" defaultValue={business}>
              <option value="">All</option>
              {LOG_BUSINESSES.map((b) => <option key={b} value={b}>{BIZ_ICON[b]} {b}</option>)}
            </select>
          </label>
        )}
        <label className="field"><span>Category</span>
          <select name="category" defaultValue={category}>
            <option value="">All</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="field"><span>From</span><input type="date" name="from" defaultValue={from} /></label>
        <label className="field"><span>To</span><input type="date" name="to" defaultValue={to} /></label>
        <label className="field full"><span>Search</span><input name="q" defaultValue={q} placeholder="table, invoice, item, guest, person…" /></label>
        <div className="full row">
          <button className="primary">Filter</button>
          {quick("Today", t, t)}
          {quick("7 days", addDays(t, -6), t)}
          {quick("30 days", addDays(t, -29), t)}
          <Link href="/logs" className="btn small">Reset</Link>
        </div>
      </form>

      <div className="small muted">{shown.length} action{shown.length === 1 ? "" : "s"}{shown.length > SHOW ? ` · showing the newest ${SHOW}` : ""}</div>
      <div className="list logs-list">
        {shown.slice(0, SHOW).map((l) => (
          <div key={l.log_id} className={`item log-item biz-${l.business === "MO Villa" ? "villa" : l.business === "Admin" ? "admin" : "cafe"}`}>
            <div className="grow">
              <div className="spread small">
                <span className="muted" style={{ whiteSpace: "nowrap" }}>
                  {l.at.slice(5)}{user.owner ? ` · ${BIZ_ICON[l.business]} ${l.business}` : ""} · <span className="badge">{l.category}</span>
                </span>
                <span className="muted" style={{ whiteSpace: "nowrap" }}>{l.by_name}</span>
              </div>
              <div><b>{l.action}</b>{l.detail ? <span className="log-detail"> · {l.detail}</span> : null}</div>
            </div>
          </div>
        ))}
        {shown.length === 0 && <span className="muted">Nothing in this period.</span>}
      </div>
    </div>
  );
}
