import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { today } from "@/lib/today";
import { daySummary, activeTodos, todoUrgency } from "@/lib/calc/daily";
import { accountBalance, isPettyLow, CASH_FORMULAS } from "@/lib/calc/cash";
import { monthProfit, profitTable, FORMULAS } from "@/lib/calc/profit";
import { unpaidFixedCosts } from "@/lib/calc/fixedCosts";
import { addMonths, daysInMonth, monthLabel, monthOf } from "@/lib/calc/dates";
import { pct, rs } from "@/lib/calc/money";
import { Tip } from "@/components/ui";
import { DailyMealChart, ProfitPlanChart } from "@/components/Charts";
import { MEALS, isVillaTodo } from "@/lib/types";
import { uberDay, UBER_FORMULAS } from "@/lib/calc/uber";
import { StorageError } from "@/components/StorageError";
import { pendingPayouts, upcomingCheckIns, villaMonth, VILLA_FORMULAS } from "@/lib/calc/villa";
import { combinedMonth, COMBINED_FORMULA } from "@/lib/calc/combined";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requirePage("any");
  const { denied } = await searchParams;
  let data;
  try {
    data = await repo.all();
  } catch (e) {
    return <StorageError error={e} />;
  }
  const { settings, orders, dailyCosts, fixedCosts, fixedPayments, movements, todos, villa, capital } = data;
  const t = today(settings);
  const month = monthOf(t);
  const input = { orders, dailyCosts, fixedCosts, fixedPayments, settings };

  // Day figures: expected net = sales − food cost − Uber commission.
  const dayFigures = (d: string) => {
    const s = daySummary(d, orders, settings);
    const u = uberDay(d, orders, dailyCosts);
    return { ...s, uberSales: u.sales, uberCommission: u.commission, expectedNet: s.grossProfit - u.commission };
  };
  const day = dayFigures(t);
  const petty = accountBalance("Petty cash", { orders, dailyCosts, fixedCosts, fixedPayments, movements, villa, capital });
  const bank = accountBalance("Bank", { orders, dailyCosts, fixedCosts, fixedPayments, movements, villa, capital });
  const low = isPettyLow(petty.balance, settings);
  const mp = monthProfit(month, input);
  const vm = villaMonth(month, villa, settings);
  const checkIns = upcomingCheckIns(villa, t, 7);
  const pending = pendingPayouts(villa);
  const combined = combinedMonth(month, input, villa);

  const daily = daysInMonth(month).map((d) => {
    const s = daySummary(d, orders, settings);
    const o: any = { day: d.slice(8) };
    for (const m of s.meals) o[m.meal] = m.sales;
    return o;
  });

  // Every day of the month up to today that had orders, newest first.
  const perDay = daysInMonth(month)
    .filter((d) => d <= t)
    .map((d) => dayFigures(d))
    .filter((d) => d.orders > 0)
    .reverse();

  const from = settings.opening_month < month ? settings.opening_month : month;
  const to = addMonths(month, 0) < addMonths(from, 11) ? addMonths(from, 11) : month;
  const chartMonths = profitTable(from, to, input).map((r) => ({
    month: monthLabel(r.month).replace(" 20", " '"),
    actual: r.netProfit,
    planned: r.plannedNetProfit,
    closed: r.closed,
  }));

  const nextTodos = activeTodos(user.owner ? todos : todos.filter((td) => !isVillaTodo(td))).slice(0, 5);
  const unpaid = unpaidFixedCosts(month, fixedCosts, fixedPayments, settings);
  const isPartner = user.role === "partner";
  // Villa figures and cash balances are for the owner only. Partner shares are on the Profit page (monthly).
  const isOwner = user.owner;

  return (
    <div className="stack">
      {denied && <div className="errors">That page is not available for your account.</div>}
      <div className="spread">
        <h1 style={{ margin: 0 }}>Today · {t}</h1>
        <Link href="/order" className="btn primary">+ New order</Link>
      </div>

      {isOwner && (
        <>
          <h2 className="home-section">📊 MO total · {monthLabel(month)}</h2>
          <div className="grid cols-3">
            <div className="card stat">
              <div className="label">Total profit · {monthLabel(month)} <Tip text={COMBINED_FORMULA} /></div>
              <div className={`value ${combined.total < 0 ? "neg" : ""}`}>{rs(combined.total)}</div>
              <div className="sub">Cafe {rs(combined.cafe)} + Villa {rs(combined.villa)}</div>
            </div>
          <div className={`card stat ${low ? "warn" : ""}`}>
            <div className="label">Petty cash <Tip text={CASH_FORMULAS.petty} /></div>
            <div className="value">{rs(petty.balance)}</div>
            <div className="sub">{low ? <b className="neg">⚠ Low – below {rs(settings.petty_low_threshold)}</b> : `Warn below ${rs(settings.petty_low_threshold)}`}</div>
          </div>
          <div className="card stat">
            <div className="label">Bank <Tip text={CASH_FORMULAS.bank} /></div>
            <div className="value">{rs(bank.balance)}</div>
            <div className="sub">All time</div>
          </div>
          </div>
        </>
      )}

      <h2 className="home-section" id="cafe">☕ MO Cafe</h2>
      <div className="grid cols-4">
        <div className="card stat">
          <div className="label">Today&apos;s sales <Tip text={FORMULAS.sales.replace("month", "day")} /></div>
          <div className="value">{rs(day.sales)}</div>
          <div className="sub">
            {day.target ? (
              <span className={day.vsTarget >= 0 ? "pos" : "neg"}>
                {day.vsTarget >= 0 ? "▲" : "▼"} {rs(Math.abs(day.vsTarget))} vs target {rs(day.target)}
              </span>
            ) : (
              "No daily target set"
            )}
          </div>
        </div>
        <div className="card stat">
          <div className="label">Expected cafe net profit · today <Tip text={FORMULAS.dayNetProfit} /></div>
          <div className={`value ${day.expectedNet < 0 ? "neg" : ""}`}>{rs(day.expectedNet)}</div>
          <div className="sub">
            Food cost {rs(day.foodCost)} ({pct(day.foodCost, day.sales)}){day.uberCommission ? ` · Uber commission ${rs(day.uberCommission)}` : ""} ·{" "}
            <span className={day.foodCostPct !== null && day.foodCostPct * 100 > settings.food_cost_target_pct ? "neg" : ""}>target ≤ {settings.food_cost_target_pct}%</span>
          </div>
        </div>
        <div className="card stat">
          <div className="label">🛵 Uber · today <Tip text={`${UBER_FORMULAS.price(settings)}. ${UBER_FORMULAS.commission(settings)}`} /></div>
          <div className="value">{rs(day.uberSales)}</div>
          <div className="sub">
            Commission {rs(day.uberCommission)} · <Link href="/order?channel=uber">+ Uber order</Link>
          </div>
        </div>
        {isPartner && (
          <>
            <div className="card stat">
              <div className="label">Cafe net profit · {monthLabel(month)} <Tip text={`${FORMULAS.netProfit}. ${FORMULAS.vsPlan}`} /></div>
              <div className={`value ${mp.netProfit < 0 ? "neg" : ""}`}>{rs(mp.netProfit)}</div>
              <div className="sub">
                {mp.closed ? "Closed month" : mp.plannedNetProfit ? (
                  <span className={mp.profitVsPlan >= 0 ? "pos" : "neg"}>{mp.profitVsPlan >= 0 ? "▲" : "▼"} {rs(Math.abs(mp.profitVsPlan))} vs plan {rs(mp.plannedNetProfit)}</span>
                ) : "No plan for this month"}
              </div>
            </div>
          </>
        )}
      </div>

      <div className={`grid ${isPartner ? "md-2" : ""}`}>
        <div className="card">
          <div className="spread"><b>Daily sales · {monthLabel(month)}</b><Link className="small" href="/sales">Details →</Link></div>
          <DailyMealChart data={daily} />
          <table className="small" style={{ marginTop: 6 }}>
            <tbody>
              <tr>
                {MEALS.map((m) => (
                  <td key={m}>{m}: <b>{rs(daily.reduce((t2, d) => t2 + d[m], 0))}</b></td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        {isPartner && (
          <div className="card">
            <div className="spread"><b>Monthly net profit vs plan</b><Link className="small" href="/profit">Details →</Link></div>
            <ProfitPlanChart data={chartMonths} />
          </div>
        )}
      </div>

      <div className="card">
        <div className="spread"><b>Total sales per day · {monthLabel(month)}</b><Link className="small" href="/sales">Details →</Link></div>
        <div className="table-wrap report-long" style={{ marginTop: 8, maxHeight: 380 }}>
          <table className="small">
            <thead>
              <tr>
                <th>Date</th><th className="num">Orders</th><th className="num">Total sales</th>
                <th className="num">of which Uber</th>
                <th className="num">Food cost <Tip text={FORMULAS.foodCost.replace("month", "day")} /></th><th className="num">Food cost %</th>
                <th className="num">Uber commission <Tip text={UBER_FORMULAS.commission(settings)} /></th>
                <th className="num">Expected net profit <Tip text={FORMULAS.dayNetProfit} /></th>
              </tr>
            </thead>
            <tbody>
              {perDay.length === 0 && <tr><td colSpan={8} className="muted">No sales yet this month</td></tr>}
              {perDay.map((d) => (
                <tr key={d.date}>
                  <td>{d.date === t ? <b>{d.date} (today)</b> : d.date}</td>
                  <td className="num">{d.orders}</td>
                  <td className="num">{rs(d.sales)}</td>
                  <td className="num">{d.uberSales ? rs(d.uberSales) : "-"}</td>
                  <td className="num">{rs(d.foodCost)}</td>
                  <td className="num">{pct(d.foodCost, d.sales)}</td>
                  <td className="num">{d.uberCommission ? rs(d.uberCommission) : "-"}</td>
                  <td className={`num ${d.expectedNet < 0 ? "neg" : ""}`}>{rs(d.expectedNet)}</td>
                </tr>
              ))}
            </tbody>
            {perDay.length > 0 && (
              <tfoot>
                <tr>
                  <th>Month so far</th>
                  <th className="num">{perDay.reduce((a, d) => a + d.orders, 0)}</th>
                  <th className="num">{rs(perDay.reduce((a, d) => a + d.sales, 0))}</th>
                  <th className="num">{rs(perDay.reduce((a, d) => a + d.uberSales, 0))}</th>
                  <th className="num">{rs(perDay.reduce((a, d) => a + d.foodCost, 0))}</th>
                  <th className="num">{pct(perDay.reduce((a, d) => a + d.foodCost, 0), perDay.reduce((a, d) => a + d.sales, 0))}</th>
                  <th className="num">{rs(perDay.reduce((a, d) => a + d.uberCommission, 0))}</th>
                  <th className="num">{rs(perDay.reduce((a, d) => a + d.expectedNet, 0))}</th>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {isOwner && (
        <>
          <h2 className="home-section">🏡 MO Villa</h2>
          <div className="grid cols-4">
          <div className="card stat">
            <div className="label">Villa net profit · {monthLabel(month)} <Tip text={VILLA_FORMULAS.netProfit} /></div>
            <div className={`value ${vm.netProfit < 0 ? "neg" : ""}`}>{rs(vm.netProfit)}</div>
            <div className="sub">Gross {rs(vm.gross)} · <Link href="/villa?view=summary">details</Link></div>
          </div>
          <div className="card stat">
            <div className="label">Villa occupancy · {monthLabel(month)} <Tip text={VILLA_FORMULAS.occupancy} /></div>
            <div className="value">{vm.occupancy === null ? "-" : `${(vm.occupancy * 100).toFixed(0)}%`}</div>
            <div className="sub">{vm.bookedNights} of {settings.villa_rooms.length * vm.days} room-nights</div>
          </div>
          <div className="card stat">
            <div className="label">Check-ins next 7 days</div>
            <div className="value">{checkIns.length}</div>
            <div className="sub">
              {checkIns.slice(0, 3).map((b) => (
                <div key={b.record_id}>{b.check_in.slice(5)} · {b.room_number} · {b.guest_name || b.platform}</div>
              ))}
              {checkIns.length === 0 && "None"}
            </div>
          </div>
          <div className={`card stat ${pending.length ? "warn" : ""}`}>
            <div className="label">Pending payouts <Tip text={VILLA_FORMULAS.payouts} /></div>
            <div className="value">{rs(pending.reduce((a, b) => a + b.net_payout, 0))}</div>
            <div className="sub">{pending.length} booking{pending.length === 1 ? "" : "s"} · <Link href="/villa?view=bookings">view</Link></div>
          </div>
          </div>
        </>
      )}

      <h2 className="home-section">✅ To-dos & bills</h2>
      <div className="grid md-2">
        <div className="card">
          <div className="spread"><b>Next to-dos</b><Link className="small" href="/todo">All →</Link></div>
          <div className="list" style={{ marginTop: 8 }}>
            {nextTodos.length === 0 && <span className="muted small">Nothing open 🎉</span>}
            {nextTodos.map((td) => {
              const u = todoUrgency(td, t, settings);
              return (
                <div key={td.task_id} className={`item ${u}`}>
                  <div className="grow">
                    <div>{td.task}</div>
                    <div className="small muted">{td.owner} · due {td.due_date}</div>
                  </div>
                  {u === "overdue" && <span className="badge bad">Overdue</span>}
                  {u === "soon" && <span className="badge warn">Soon</span>}
                </div>
              );
            })}
          </div>
        </div>
        {isPartner && (
          <div className="card">
            <div className="spread"><b>Unpaid fixed costs · {monthLabel(month)}</b><Link className="small" href="/fixed">Pay →</Link></div>
            <div className="list" style={{ marginTop: 8 }}>
              {unpaid.length === 0 && <span className="muted small">All paid ✓</span>}
              {unpaid.map((u) => (
                <div key={u.fixed_id} className="item">
                  <div className="grow">{u.name}</div>
                  <b className="num">{rs(u.planned)}</b>
                  <span className="badge warn">Not paid</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
