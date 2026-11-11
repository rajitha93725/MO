import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { today } from "@/lib/today";
import { addMonths, isValidMonth, monthLabel, monthOf } from "@/lib/calc/dates";
import { num, pct, rs } from "@/lib/calc/money";
import { FORMULAS } from "@/lib/calc/profit";
import { VILLA_FORMULAS } from "@/lib/calc/villa";
import { COMBINED_FORMULA, shareLabel } from "@/lib/calc/combined";
import { cafeReport, ownerReport, type GroupRow } from "@/lib/calc/report";
import { CsvButton, Tip } from "@/components/ui";
import { StorageError } from "@/components/StorageError";
import { PrintButton } from "./PrintButton";

const signed = (v: number) => <span className={v < 0 ? "neg" : v > 0 ? "pos" : ""}>{num(v)}</span>;
const share = (v: number | null) => (v === null ? "-" : `${(v * 100).toFixed(1)}%`);
const change = (now: number, before: number) => {
  const d = now - before;
  return (
    <span className={d < 0 ? "neg" : d > 0 ? "pos" : "muted"}>
      {d > 0 ? "▲" : d < 0 ? "▼" : "="} {num(Math.abs(d))}
    </span>
  );
};

function Groups({ title, rows, countLabel, tip }: { title: string; rows: GroupRow[]; countLabel: string; tip?: string }) {
  const total = rows.reduce((a, r) => a + r.amount, 0);
  return (
    <div className="card">
      <b>{title} {tip && <Tip text={tip} />}</b>
      <table className="small" style={{ marginTop: 6 }}>
        <thead><tr><th></th><th className="num">{countLabel}</th><th className="num">Rs</th><th className="num">Share</th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.name}><td>{r.name}</td><td className="num">{r.count}</td><td className="num">{num(r.amount)}</td><td className="num">{share(r.share)}</td></tr>)}
          {rows.length === 0 && <tr><td colSpan={4} className="muted">Nothing this month</td></tr>}
          <tr className="total"><td>Total</td><td className="num">{rows.reduce((a, r) => a + r.count, 0)}</td><td className="num">{num(total)}</td><td></td></tr>
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, csv, children }: { title: string; csv?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="stack report-section">
      <div className="spread"><h2 style={{ margin: 0 }}>{title}</h2>{csv && <span className="no-print">{csv}</span>}</div>
      {children}
    </section>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requirePage("partner");
  let data;
  try {
    data = await repo.all();
  } catch (e) {
    return <StorageError error={e} />;
  }
  const { menu, settings, orders, dailyCosts, fixedCosts, fixedPayments, movements, villa, capital } = data;
  const t = today(settings);
  const q = (await searchParams).month;
  const month = q && isValidMonth(q) ? q : monthOf(t);
  const input = { orders, dailyCosts, fixedCosts, fixedPayments, settings };
  const r = cafeReport(month, input, menu);
  const p = r.profit;
  const prev = r.previous;
  // Villa, cash and the combined split are for the owner only.
  const o = user.owner ? ownerReport(month, input, villa, { orders, dailyCosts, fixedCosts, fixedPayments, movements, villa, capital }) : null;
  const label = monthLabel(month);
  const file = (name: string) => `${name}-${month}`;

  const statement: [string, number, number, string?][] = [
    ["Sales", p.sales, prev.sales, FORMULAS.sales],
    ["Food cost (menu-based)", p.foodCost, prev.foodCost, FORMULAS.foodCost],
    ["Gross profit", p.sales - p.foodCost, prev.sales - prev.foodCost, FORMULAS.grossProfit],
    ["Daily costs", p.dailyCosts, prev.dailyCosts, FORMULAS.dailyCosts],
    ["Fixed costs", p.fixedCosts, prev.fixedCosts, FORMULAS.fixedCosts],
    ["Total costs", p.totalCosts, prev.totalCosts, FORMULAS.totalCosts],
    ["Net profit", p.netProfit, prev.netProfit, FORMULAS.netProfit],
  ];

  const summaryRows: (string | number)[][] = [
    ["Month", month],
    ...statement.map(([k, v]) => [k, v]),
    ["Net margin %", p.netMargin === null ? "-" : (p.netMargin * 100).toFixed(1)],
    ["Orders", r.orders],
    ["Items sold", r.itemsSold],
    ["Average order value", r.avgOrderValue ?? "-"],
    ["Trading days", r.tradingDays],
    ["Planned sales", p.plannedSales],
    ["Sales vs plan", p.salesVsPlan],
    ["Planned net profit", p.plannedNetProfit],
    ["Profit vs plan", p.profitVsPlan],
    ["Actual food & drink purchases", p.actualFoodPurchases],
    ["Food check difference", p.foodCostDifference],
    ...p.partnerShares.map((s) => [`Cafe share ${s.name} (${s.pct}%)`, s.amount]),
    ...r.byMeal.map((m) => [`Sales ${m.name}`, m.amount]),
    ...r.byPayment.map((m) => [`Sales paid by ${m.name}`, m.amount]),
    ...r.costsByCategory.map((c) => [`Daily cost: ${c.name}`, c.amount]),
    ...(o
      ? [
          ["Villa gross", o.villa.gross],
          ["Villa commission", o.villa.commission],
          ["Villa booking costs", o.villa.bookingCosts],
          ["Villa costs", o.villa.villaCosts],
          ["Villa net profit", o.villa.netProfit],
          ["Villa booked nights", o.villa.bookedNights],
          ["Villa occupancy %", o.villa.occupancy === null ? "-" : (o.villa.occupancy * 100).toFixed(1)],
          ["Total profit (cafe + villa)", o.combined.total],
          ...o.combined.shares.map((s) => [`Share ${s.name} (${shareLabel(s)})`, s.amount]),
          ...o.cash.flatMap((c) => [[`${c.account} opening`, c.opening], [`${c.account} closing`, c.closing]]),
        ]
      : []),
  ];

  return (
    <div className="stack report">
      <div className="spread">
        <h1 style={{ margin: 0 }}>Monthly report · {label}</h1>
        <div className="row no-print">
          <a className="btn small" href={`?month=${addMonths(month, -1)}`} aria-label="Previous month">‹</a>
          <form className="row" method="get">
            <input type="month" name="month" defaultValue={month} style={{ width: 150 }} aria-label="Month" />
            <button className="small" type="submit">Go</button>
          </form>
          <a className="btn small" href={`?month=${addMonths(month, 1)}`} aria-label="Next month">›</a>
          <PrintButton />
          <CsvButton filename={file("summary")} headers={["metric", "value"]} rows={summaryRows} />
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {user.owner ? "MO Cafe and MO Villa" : "MO Cafe"} · all amounts in Rs · compared with {monthLabel(addMonths(month, -1))}.
        {p.closed && <b> {label} is a closed month (Settings: closed_months).</b>} Generated {t}.
      </p>

      {/* ---------- headline ---------- */}
      <div className="grid cols-4">
        <div className="card stat"><div className="label">Sales <Tip text={FORMULAS.sales} /></div><div className="value">{rs(p.sales)}</div><div className="sub">{change(p.sales, prev.sales)} vs last month</div></div>
        <div className="card stat"><div className="label">Orders</div><div className="value">{r.orders}</div><div className="sub">Avg {r.avgOrderValue === null ? "-" : rs(r.avgOrderValue)} · {r.itemsSold} items</div></div>
        <div className="card stat"><div className="label">Total costs <Tip text={FORMULAS.totalCosts} /></div><div className="value">{rs(p.totalCosts)}</div><div className="sub">Daily {num(p.dailyCosts)} + Fixed {num(p.fixedCosts)}</div></div>
        <div className="card stat"><div className="label">Cafe net profit <Tip text={FORMULAS.netProfit} /></div><div className={`value ${p.netProfit < 0 ? "neg" : ""}`}>{rs(p.netProfit)}</div><div className="sub">Margin {p.netMargin === null ? "-" : pct(p.netProfit, p.sales)} · {change(p.netProfit, prev.netProfit)}</div></div>
      </div>
      {o && (
        <div className="grid cols-4">
          <div className="card stat"><div className="label">Villa net profit <Tip text={VILLA_FORMULAS.netProfit} /></div><div className={`value ${o.villa.netProfit < 0 ? "neg" : ""}`}>{rs(o.villa.netProfit)}</div><div className="sub">Gross {num(o.villa.gross)} · {o.villa.bookedNights} nights</div></div>
          <div className="card stat"><div className="label">Total profit <Tip text={COMBINED_FORMULA} /></div><div className={`value ${o.combined.total < 0 ? "neg" : ""}`}>{rs(o.combined.total)}</div><div className="sub">Cafe {num(o.combined.cafe)} + Villa {num(o.combined.villa)}</div></div>
          {o.combined.shares.map((s) => (
            <div key={s.name} className="card stat"><div className="label">{s.name} ({shareLabel(s)}) <Tip text={COMBINED_FORMULA} /></div><div className={`value ${s.amount < 0 ? "neg" : ""}`}>{rs(s.amount)}</div><div className="sub">Cafe {num(s.cafe)} + Villa {num(s.villa)}</div></div>
          ))}
        </div>
      )}

      {/* ---------- profit statement ---------- */}
      <Section title="Cafe profit statement">
        <div className="table-wrap">
          <table>
            <thead><tr><th></th><th className="num">{label}</th><th className="num">{monthLabel(addMonths(month, -1))}</th><th className="num">Change</th></tr></thead>
            <tbody>
              {statement.map(([k, v, b, tip]) => (
                <tr key={k} className={k === "Net profit" || k === "Gross profit" ? "total" : ""}><td>{k} {tip && <Tip text={tip} />}</td><td className="num">{signed(v)}</td><td className="num">{num(b)}</td><td className="num">{change(v, b)}</td></tr>
              ))}
              <tr><td>Net margin <Tip text={FORMULAS.netMargin} /></td><td className="num">{p.netMargin === null ? "-" : pct(p.netProfit, p.sales)}</td><td className="num">{prev.netMargin === null ? "-" : pct(prev.netProfit, prev.sales)}</td><td></td></tr>
              <tr><td>Food cost % <Tip text={FORMULAS.foodCostPct} /></td><td className="num">{pct(p.foodCost, p.sales)}</td><td className="num">{pct(prev.foodCost, prev.sales)}</td><td className="small muted num">target ≤ {settings.food_cost_target_pct}%</td></tr>
              {p.partnerShares.map((s) => (
                <tr key={s.name}><td>{s.name}&apos;s cafe share ({s.pct}%) <Tip text={FORMULAS.partnerShare} /></td><td className="num">{num(s.amount)}</td><td className="num">{num(prev.partnerShares.find((x) => x.name === s.name)?.amount ?? 0)}</td><td></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid md-2">
          <div className="card">
            <b>Plan</b>
            <table className="small" style={{ marginTop: 6 }}>
              <tbody>
                <tr><td>Planned sales</td><td className="num">{num(p.plannedSales)}</td><td className="num">{signed(p.salesVsPlan)}</td></tr>
                <tr><td>Planned net profit</td><td className="num">{num(p.plannedNetProfit)}</td><td className="num">{signed(p.profitVsPlan)}</td></tr>
              </tbody>
            </table>
            <div className="small muted">Right column = actual − plan <Tip text={FORMULAS.vsPlan} /></div>
          </div>
          <div className="card">
            <b>Food cost check <Tip text={FORMULAS.foodCheck} /></b>
            <table className="small" style={{ marginTop: 6 }}>
              <tbody>
                <tr><td>Actual food &amp; drink purchases</td><td className="num">{num(p.actualFoodPurchases)}</td></tr>
                <tr><td>Menu-based food cost</td><td className="num">{num(p.foodCost)}</td></tr>
                <tr className="total"><td>Difference</td><td className="num">{signed(p.foodCostDifference)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* ---------- sales ---------- */}
      <Section
        title="Sales"
        csv={<CsvButton filename={file("daily-sales")} headers={["date", "orders", "sales", "food_cost", "target", "vs_target"]} rows={r.days.map((d) => [d.date, d.orders, d.sales, d.foodCost, d.target, d.vsTarget])} />}
      >
        <p className="small muted" style={{ margin: 0 }}>
          {r.tradingDays} trading day{r.tradingDays === 1 ? "" : "s"}
          {r.bestDay && <> · best day {r.bestDay.date} ({rs(r.bestDay.sales)})</>}
          {r.tradingDays > 0 && <> · average {rs(Math.round(p.sales / r.tradingDays))} per trading day</>}
        </p>
        <div className="grid cols-3">
          <div className="card">
            <b>By meal</b>
            <table className="small" style={{ marginTop: 6 }}>
              <thead><tr><th></th><th className="num">Orders</th><th className="num">Rs</th><th className="num">Food %</th></tr></thead>
              <tbody>
                {r.byMeal.map((m) => <tr key={m.name}><td>{m.name}</td><td className="num">{m.orders}</td><td className="num">{num(m.amount)}</td><td className="num">{pct(m.foodCost, m.amount)}</td></tr>)}
                <tr className="total"><td>Total</td><td className="num">{r.orders}</td><td className="num">{num(p.sales)}</td><td className="num">{pct(p.foodCost, p.sales)}</td></tr>
              </tbody>
            </table>
          </div>
          <Groups title="By payment" rows={r.byPayment} countLabel="Orders" tip="Cash goes to petty cash; card and bank transfer go to the bank" />
          <Groups title="By menu category" rows={r.byCategory} countLabel="Lines" />
        </div>
        <div className="table-wrap">
          <table className="small">
            <thead><tr><th>Date</th><th className="num">Orders</th><th className="num">Sales</th><th className="num">Food cost</th><th className="num">Target</th><th className="num">Vs target</th></tr></thead>
            <tbody>
              {r.days.filter((d) => d.sales > 0 || d.orders > 0).map((d) => (
                <tr key={d.date}><td>{d.date}</td><td className="num">{d.orders}</td><td className="num">{num(d.sales)}</td><td className="num">{num(d.foodCost)}</td><td className="num">{num(d.target)}</td><td className="num">{signed(d.vsTarget)}</td></tr>
              ))}
              {r.tradingDays === 0 && <tr><td colSpan={6} className="muted">No sales this month</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ---------- items ---------- */}
      <Section
        title="Items sold"
        csv={<CsvButton filename={file("items")} headers={["item_id", "item_name", "category", "qty", "sales", "food_cost", "gross_profit", "food_cost_pct"]} rows={r.items.map((i) => [i.item_id, i.item_name, i.category, i.qty, i.sales, i.foodCost, i.grossProfit, i.foodCostPct === null ? "-" : (i.foodCostPct * 100).toFixed(1)])} />}
      >
        <div className="table-wrap">
          <table className="small">
            <thead><tr><th>#</th><th>Item</th><th>Category</th><th className="num">Qty</th><th className="num">Sales</th><th className="num">Food cost</th><th className="num">Gross profit</th><th className="num">Food %</th></tr></thead>
            <tbody>
              {r.items.map((i, n) => (
                <tr key={i.item_id}>
                  <td>{n + 1}</td><td>{i.item_name}</td><td>{i.category}</td><td className="num">{i.qty}</td><td className="num">{num(i.sales)}</td><td className="num">{num(i.foodCost)}</td><td className="num">{num(i.grossProfit)}</td>
                  <td className={`num ${i.foodCostPct !== null && i.foodCostPct * 100 > settings.food_cost_target_pct ? "neg" : ""}`}>{pct(i.foodCost, i.sales)}</td>
                </tr>
              ))}
              {r.items.length === 0 && <tr><td colSpan={8} className="muted">No items sold</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ---------- orders ---------- */}
      <Section
        title={`Order details (${r.orders})`}
        csv={<CsvButton filename={file("orders")} headers={["order_id", "date", "time", "meal", "payment_method", "items", "qty", "total", "food_cost", "entered_by"]} rows={r.orderList.map((x) => [x.order_id, x.date, x.time, x.meal, x.payment_method, x.items, x.qty, x.total, x.cost, x.entered_by])} />}
      >
        <div className="table-wrap report-long">
          <table className="small">
            <thead><tr><th>Date</th><th>Time</th><th>Meal</th><th>Items</th><th>Paid</th><th className="num">Total</th><th>By</th></tr></thead>
            <tbody>
              {r.orderList.map((x) => (
                <tr key={x.order_id}><td style={{ whiteSpace: "nowrap" }}>{x.date}</td><td>{x.time}</td><td>{x.meal}</td><td>{x.items}</td><td>{x.payment_method}</td><td className="num">{num(x.total)}</td><td>{x.entered_by}</td></tr>
              ))}
              {r.orderList.length === 0 && <tr><td colSpan={7} className="muted">No orders this month</td></tr>}
              {r.orderList.length > 0 && <tr className="total"><td colSpan={5}>Total</td><td className="num">{num(p.sales)}</td><td></td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ---------- costs ---------- */}
      <Section
        title="Daily costs"
        csv={<CsvButton filename={file("daily-costs")} headers={["date", "category", "description", "amount", "paid_from", "paid_by", "notes", "entered_by"]} rows={r.costList.map((c) => [c.date, c.category, c.description, c.amount, c.paid_from, c.paid_by, c.notes, c.entered_by])} />}
      >
        <div className="grid cols-3">
          <Groups title="By category" rows={r.costsByCategory} countLabel="Entries" />
          <Groups title="Paid from" rows={r.costsByAccount} countLabel="Entries" />
          <Groups title="Paid by" rows={r.costsByPaidBy} countLabel="Entries" tip="Costs paid personally by a partner count in profit but are owed back to that partner" />
        </div>
        <div className="table-wrap report-long">
          <table className="small">
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th className="num">Amount</th><th>From</th><th>By</th></tr></thead>
            <tbody>
              {r.costList.map((c) => <tr key={c.cost_id}><td style={{ whiteSpace: "nowrap" }}>{c.date}</td><td>{c.category}</td><td>{c.description}</td><td className="num">{num(c.amount)}</td><td>{c.paid_from}</td><td>{c.paid_by}</td></tr>)}
              {r.costList.length === 0 && <tr><td colSpan={6} className="muted">No daily costs this month</td></tr>}
              {r.costList.length > 0 && <tr className="total"><td colSpan={3}>Total</td><td className="num">{num(p.dailyCosts)}</td><td colSpan={2}></td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ---------- fixed costs ---------- */}
      <Section
        title="Fixed costs"
        csv={<CsvButton filename={file("fixed-costs")} headers={["fixed_id", "name", "frequency", "planned", "actual", "paid", "counted_in_profit"]} rows={r.fixed.map((f) => [f.fixed_id, f.name, f.frequency, f.planned, f.actual ?? "", f.paid ? "yes" : "no", f.counted])} />}
      >
        <div className="table-wrap">
          <table className="small">
            <thead><tr><th>Name</th><th>Type</th><th className="num">Planned</th><th className="num">Actual</th><th>Status</th><th className="num">In profit <Tip text={FORMULAS.fixedCosts} /></th></tr></thead>
            <tbody>
              {r.fixed.map((f) => (
                <tr key={f.fixed_id}><td>{f.name}</td><td>{f.frequency}</td><td className="num">{num(f.planned)}</td><td className="num">{f.actual === null ? "-" : num(f.actual)}</td><td>{f.paid ? <span className="badge">Paid</span> : <span className="badge warn">Not paid</span>}</td><td className="num">{num(f.counted)}</td></tr>
              ))}
              {r.fixed.length === 0 && <tr><td colSpan={6} className="muted">No fixed costs this month</td></tr>}
              <tr className="total"><td colSpan={2}>Total</td><td className="num">{num(r.fixed.reduce((a, f) => a + f.planned, 0))}</td><td className="num">{num(r.fixed.reduce((a, f) => a + (f.actual ?? 0), 0))}</td><td></td><td className="num">{num(p.fixedCosts)}</td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* ---------- owner only ---------- */}
      {o && (
        <>
          <Section
            title="MO Villa"
            csv={<CsvButton filename={file("villa-bookings")} headers={["record_id", "room", "platform", "guest", "check_in", "check_out", "status", "nights_this_month", "gross_this_month", "total_price", "commission", "net_payout", "payout_status"]} rows={o.villaBookings.map((b) => [b.record_id, b.room_number, b.platform, b.guest_name, b.check_in, b.check_out, b.status, b.monthNights, b.monthGross, b.total_price, b.commission_amount, b.net_payout, b.payout_status])} />}
          >
            <div className="grid cols-3">
              <div className="card">
                <b>Villa profit <Tip text={VILLA_FORMULAS.netProfit} /></b>
                <table className="small" style={{ marginTop: 6 }}>
                  <tbody>
                    <tr><td>Gross bookings</td><td className="num">{num(o.villa.gross)}</td></tr>
                    <tr><td>− Commission</td><td className="num">{num(o.villa.commission)}</td></tr>
                    <tr><td>− Booking costs</td><td className="num">{num(o.villa.bookingCosts)}</td></tr>
                    <tr><td>− Villa costs</td><td className="num">{num(o.villa.villaCosts)}</td></tr>
                    <tr className="total"><td>Net profit</td><td className="num">{signed(o.villa.netProfit)}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="card">
                <b>Occupancy <Tip text={VILLA_FORMULAS.occupancy} /></b>
                <table className="small" style={{ marginTop: 6 }}>
                  <tbody>
                    <tr><td>Booked nights</td><td className="num">{o.villa.bookedNights} / {settings.villa_rooms.length * o.villa.days}</td></tr>
                    <tr><td>Occupancy</td><td className="num">{share(o.villa.occupancy)}</td></tr>
                    <tr><td>Average price / night</td><td className="num">{o.villa.avgPricePerNight === null ? "-" : num(o.villa.avgPricePerNight)}</td></tr>
                    <tr><td>Bookings counted</td><td className="num">{o.villa.bookings}</td></tr>
                    {o.villa.roomOccupancy.map((x) => <tr key={x.room}><td>{x.room}</td><td className="num">{x.nights} nights · {share(x.occupancy)}</td></tr>)}
                  </tbody>
                </table>
              </div>
              <div className="card">
                <b>By platform</b>
                <table className="small" style={{ marginTop: 6 }}>
                  <thead><tr><th></th><th className="num">Bookings</th><th className="num">Rs</th></tr></thead>
                  <tbody>{o.villa.byPlatform.map((x) => <tr key={x.platform}><td>{x.platform}</td><td className="num">{x.bookings}</td><td className="num">{num(x.revenue)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
            <div className="table-wrap">
              <table className="small">
                <thead><tr><th>Room</th><th className="num">Gross</th><th className="num">Commission</th><th className="num">Booking costs</th><th className="num">Own costs</th><th className="num">Shared costs</th><th className="num">Net profit</th></tr></thead>
                <tbody>{o.villa.perRoom.map((x) => <tr key={x.room}><td>{x.room}</td><td className="num">{num(x.gross)}</td><td className="num">{num(x.commission)}</td><td className="num">{num(x.bookingCosts)}</td><td className="num">{num(x.ownCosts)}</td><td className="num">{num(x.sharedCosts)}</td><td className="num">{signed(x.netProfit)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="table-wrap report-long">
              <table className="small">
                <thead><tr><th>Room</th><th>Guest / platform</th><th>Stay</th><th>Status</th><th className="num">Nights this month</th><th className="num">Gross this month</th><th>Payout</th></tr></thead>
                <tbody>
                  {o.villaBookings.map((b) => <tr key={b.record_id}><td>{b.room_number}</td><td>{b.guest_name || "-"} · {b.platform}</td><td style={{ whiteSpace: "nowrap" }}>{b.check_in} → {b.check_out}</td><td>{b.status}</td><td className="num">{b.monthNights}</td><td className="num">{num(b.monthGross)}</td><td>{b.payout_status}</td></tr>)}
                  {o.villaBookings.length === 0 && <tr><td colSpan={7} className="muted">No bookings this month</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="spread"><b>Villa costs</b><span className="no-print"><CsvButton filename={file("villa-costs")} headers={["date", "category", "description", "room", "amount", "paid_from"]} rows={o.villaCosts.map((c) => [c.date_entered, c.cost_category, c.cost_description, c.cost_room, c.cost_amount, c.paid_from])} /></span></div>
            <div className="table-wrap">
              <table className="small">
                <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Room</th><th className="num">Amount</th><th>From</th></tr></thead>
                <tbody>
                  {o.villaCosts.map((c) => <tr key={c.record_id}><td>{c.date_entered}</td><td>{c.cost_category}</td><td>{c.cost_description}</td><td>{c.cost_room}</td><td className="num">{num(c.cost_amount)}</td><td>{c.paid_from}</td></tr>)}
                  {o.villaCosts.length === 0 && <tr><td colSpan={6} className="muted">No villa costs this month</td></tr>}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Business profit & partner shares">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Partner</th><th className="num">Cafe share</th><th className="num">Villa share</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {o.combined.shares.map((s) => <tr key={s.name}><td>{s.name} <span className="small muted">({shareLabel(s)})</span></td><td className="num">{num(s.cafe)}</td><td className="num">{num(s.villa)}</td><td className="num"><b>{signed(s.amount)}</b></td></tr>)}
                  <tr className="total"><td>Total</td><td className="num">{num(o.combined.cafe)}</td><td className="num">{num(o.combined.villa)}</td><td className="num">{signed(o.combined.total)}</td></tr>
                </tbody>
              </table>
            </div>
            <p className="small muted" style={{ margin: 0 }}>{COMBINED_FORMULA}</p>
          </Section>

          <Section
            title="Cash & bank"
            csv={<CsvButton filename={file("cash-movements")} headers={["date", "type", "account", "amount", "moved_by", "notes"]} rows={o.movements.map((m) => [m.date, m.type, m.account, m.amount, m.moved_by, m.notes])} />}
          >
            <div className="table-wrap">
              <table>
                <thead><tr><th>Account</th><th className="num">Opening ({month}-01)</th><th className="num">Closing (month end)</th><th className="num">Change</th></tr></thead>
                <tbody>{o.cash.map((c) => <tr key={c.account}><td>{c.account}</td><td className="num">{num(c.opening)}</td><td className="num">{num(c.closing)}</td><td className="num">{signed(c.change)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="table-wrap">
              <table className="small">
                <thead><tr><th>Date</th><th>Type</th><th>Account</th><th className="num">Amount</th><th>Moved by</th><th>Notes</th></tr></thead>
                <tbody>
                  {o.movements.map((m) => <tr key={m.movement_id}><td>{m.date}</td><td>{m.type}</td><td>{m.account}</td><td className="num">{num(m.amount)}</td><td>{m.moved_by || "-"}</td><td>{m.notes}</td></tr>)}
                  {o.movements.length === 0 && <tr><td colSpan={6} className="muted">No cash movements this month</td></tr>}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
