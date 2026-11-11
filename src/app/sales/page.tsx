import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { today } from "@/lib/today";
import { daySummary } from "@/lib/calc/daily";
import { FORMULAS } from "@/lib/calc/profit";
import { addDays, daysInMonth, monthLabel, monthOf } from "@/lib/calc/dates";
import { num, pct, rs } from "@/lib/calc/money";
import { CsvButton, Tip } from "@/components/ui";
import { StorageError } from "@/components/StorageError";
import { DeleteOrderButton } from "./DeleteOrderButton";
import { HEADERS } from "@/lib/data/schema";

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requirePage("any");
  let orders, settings;
  try {
    [orders, settings] = await Promise.all([repo.orders(), repo.settings()]);
  } catch (e) {
    return <StorageError error={e} />;
  }
  const t = today(settings);
  const date = (await searchParams).date || t;
  const s = daySummary(date, orders, settings);
  const dayOrders = orders.filter((o) => o.date === date);
  const grouped = Array.from(new Set(dayOrders.map((o) => o.order_id))).map((id) => {
    const lines = dayOrders.filter((o) => o.order_id === id);
    return { id, lines, total: lines.reduce((a, l) => a + l.line_total, 0) };
  }).sort((a, b) => b.lines[0].time.localeCompare(a.lines[0].time));
  const month = monthOf(date);
  const monthDays = daysInMonth(month).filter((d) => d <= t).map((d) => daySummary(d, orders, settings)).filter((d) => d.sales > 0 || d.date === date);
  const monthOrders = orders.filter((o) => monthOf(o.date) === month);

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>Daily sales</h1>
        <form className="row" method="get">
          <a className="btn small" href={`?date=${addDays(date, -1)}`} aria-label="Previous day">‹</a>
          <input type="date" name="date" defaultValue={date} style={{ width: 160 }} aria-label="Date" />
          <button className="small" type="submit">Go</button>
          <a className="btn small" href={`?date=${addDays(date, 1)}`} aria-label="Next day">›</a>
        </form>
      </div>

      <div className="grid cols-4">
        <div className="card stat"><div className="label">Sales <Tip text={FORMULAS.sales.replace("month", "day")} /></div><div className="value">{rs(s.sales)}</div><div className="sub">{s.orders} orders</div></div>
        <div className="card stat"><div className="label">Food cost % <Tip text={FORMULAS.foodCostPct} /></div><div className="value">{pct(s.foodCost, s.sales)}</div><div className="sub">{rs(s.foodCost)}</div></div>
        <div className="card stat"><div className="label">Gross profit <Tip text={FORMULAS.grossProfit} /></div><div className="value">{rs(s.grossProfit)}</div></div>
        <div className={`card stat ${s.target && s.vsTarget < 0 ? "bad" : ""}`}>
          <div className="label">Vs daily target <Tip text="Daily target = breakfast + lunch + dinner targets of the period (Targets tab)" /></div>
          <div className={`value ${s.vsTarget >= 0 ? "pos" : "neg"}`}>{s.target ? `${s.vsTarget >= 0 ? "+" : ""}${num(s.vsTarget)}` : "-"}</div>
          <div className="sub">{s.target ? `${s.vsTarget >= 0 ? "Above" : "Below"} target ${rs(s.target)}` : "No target for this date"}</div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Meal</th><th className="num">Sales</th><th className="num">Food cost</th><th className="num">Food cost %</th><th className="num">Gross profit</th><th className="num">Target</th><th className="num">Vs target</th></tr></thead>
          <tbody>
            {s.meals.map((m) => (
              <tr key={m.meal}>
                <td>{m.meal}</td>
                <td className="num">{num(m.sales)}</td>
                <td className="num">{num(m.foodCost)}</td>
                <td className="num">{pct(m.foodCost, m.sales)}</td>
                <td className="num">{num(m.grossProfit)}</td>
                <td className="num">{num(m.target)}</td>
                <td className={`num ${m.sales - m.target >= 0 ? "pos" : "neg"}`}>{m.target ? num(m.sales - m.target) : "-"}</td>
              </tr>
            ))}
            <tr className="total">
              <td>Day total</td><td className="num">{num(s.sales)}</td><td className="num">{num(s.foodCost)}</td><td className="num">{pct(s.foodCost, s.sales)}</td>
              <td className="num">{num(s.grossProfit)}</td><td className="num">{num(s.target)}</td><td className={`num ${s.vsTarget >= 0 ? "pos" : "neg"}`}>{s.target ? num(s.vsTarget) : "-"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="spread"><h2>Orders on {date}</h2>
        <CsvButton filename={`orders-${date}`} headers={HEADERS.orders} rows={dayOrders.map((o) => HEADERS.orders.map((h) => (o as any)[h]))} />
      </div>
      <div className="list">
        {grouped.length === 0 && <span className="muted">No orders.</span>}
        {grouped.map((g) => (
          <div key={g.id} className="item" style={{ alignItems: "flex-start" }}>
            <div className="grow">
              <div className="spread"><b>{g.lines[0].time} · {g.lines[0].meal}</b><b className="num">{rs(g.total)}</b></div>
              <div className="small muted">{g.lines.map((l) => `${l.qty}× ${l.item_name}`).join(", ")}</div>
              <div className="small"><span className="badge">{g.lines[0].payment_method}</span> {g.lines[0].notes}</div>
            </div>
            <a className="btn small" href={`/receipt/${encodeURIComponent(g.id)}`} aria-label="Print receipt">🖨</a>
            {user.role === "partner" && <DeleteOrderButton orderId={g.id} />}
          </div>
        ))}
      </div>

      <div className="spread"><h2>{monthLabel(month)} by day</h2>
        <CsvButton filename={`orders-${month}`} headers={HEADERS.orders} rows={monthOrders.map((o) => HEADERS.orders.map((h) => (o as any)[h]))} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th className="num">Breakfast</th><th className="num">Lunch</th><th className="num">Dinner</th><th className="num">Total</th><th className="num">Food %</th><th className="num">Vs target</th></tr></thead>
          <tbody>
            {monthDays.map((d) => (
              <tr key={d.date}>
                <td><a href={`?date=${d.date}`}>{d.date.slice(5)}</a></td>
                {d.meals.map((m) => <td key={m.meal} className="num">{num(m.sales)}</td>)}
                <td className="num"><b>{num(d.sales)}</b></td>
                <td className="num">{pct(d.foodCost, d.sales)}</td>
                <td className={`num ${d.vsTarget >= 0 ? "pos" : "neg"}`}>{d.target ? num(d.vsTarget) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
