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
import { MEALS } from "@/lib/types";
import { StorageError } from "@/components/StorageError";
import { pendingPayouts, upcomingCheckIns, villaMonth, VILLA_FORMULAS } from "@/lib/calc/villa";
import { combinedMonth, combinedTable, combinedTotals, ytdRange, COMBINED_FORMULA } from "@/lib/calc/combined";

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

  const day = daySummary(t, orders, settings);
  const petty = accountBalance("Petty cash", { orders, dailyCosts, fixedCosts, fixedPayments, movements, villa, capital });
  const bank = accountBalance("Bank", { orders, dailyCosts, fixedCosts, fixedPayments, movements, villa, capital });
  const low = isPettyLow(petty.balance, settings);
  const mp = monthProfit(month, input);
  const vm = villaMonth(month, villa, settings);
  const checkIns = upcomingCheckIns(villa, t, 7);
  const pending = pendingPayouts(villa);
  const combined = combinedMonth(month, input, villa);
  const [yFrom, yTo] = ytdRange(month < settings.opening_month ? settings.opening_month : month, settings.opening_month);
  const combinedYtd = combinedTotals(combinedTable(yFrom, yTo, input, villa), settings.partners);

  const daily = daysInMonth(month).map((d) => {
    const s = daySummary(d, orders, settings);
    const o: any = { day: d.slice(8) };
    for (const m of s.meals) o[m.meal] = m.sales;
    return o;
  });

  const from = settings.opening_month < month ? settings.opening_month : month;
  const to = addMonths(month, 0) < addMonths(from, 11) ? addMonths(from, 11) : month;
  const chartMonths = profitTable(from, to, input).map((r) => ({
    month: monthLabel(r.month).replace(" 20", " '"),
    actual: r.netProfit,
    planned: r.plannedNetProfit,
    closed: r.closed,
  }));

  const nextTodos = activeTodos(todos).slice(0, 5);
  const unpaid = unpaidFixedCosts(month, fixedCosts, fixedPayments, settings);
  const isPartner = user.role === "partner";

  return (
    <div className="stack">
      {denied && <div className="errors">That page is for partners only.</div>}
      <div className="spread">
        <h1 style={{ margin: 0 }}>Today · {t}</h1>
        <Link href="/order" className="btn primary">+ New order</Link>
      </div>

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
          <div className="label">Today&apos;s food cost % <Tip text={FORMULAS.foodCostPct} /></div>
          <div className="value">{pct(day.foodCost, day.sales)}</div>
          <div className="sub">Target ≤ {settings.food_cost_target_pct}%</div>
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

      {isPartner && (
        <div className="grid cols-4">
          <div className="card stat">
            <div className="label">Cafe net profit · {monthLabel(month)} <Tip text={`${FORMULAS.netProfit}. ${FORMULAS.vsPlan}`} /></div>
            <div className={`value ${mp.netProfit < 0 ? "neg" : ""}`}>{rs(mp.netProfit)}</div>
            <div className="sub">
              {mp.closed ? "Closed month" : mp.plannedNetProfit ? (
                <span className={mp.profitVsPlan >= 0 ? "pos" : "neg"}>{mp.profitVsPlan >= 0 ? "▲" : "▼"} {rs(Math.abs(mp.profitVsPlan))} vs plan {rs(mp.plannedNetProfit)}</span>
              ) : "No plan for this month"}
            </div>
          </div>
          <div className="card stat">
            <div className="label">Villa net profit · {monthLabel(month)} <Tip text={VILLA_FORMULAS.netProfit} /></div>
            <div className={`value ${vm.netProfit < 0 ? "neg" : ""}`}>{rs(vm.netProfit)}</div>
            <div className="sub">Gross {rs(vm.gross)} · <Link href="/villa?view=summary">details</Link></div>
          </div>
          {combined.shares.map((s) => {
            const y = combinedYtd.shares.find((x) => x.name === s.name)?.amount ?? 0;
            return (
              <div className="card stat" key={s.name}>
                <div className="label">{s.name}&apos;s share ({s.pct}%) <Tip text={COMBINED_FORMULA} /></div>
                <div className={`value ${s.amount < 0 ? "neg" : ""}`}>{rs(s.amount)}</div>
                <div className="sub">of total {rs(combined.total)} · YTD {rs(y)}</div>
              </div>
            );
          })}
        </div>
      )}

      {isPartner && (
        <div className="grid cols-4">
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
          <div className="card stat">
            <div className="label">Total profit · {monthLabel(month)} <Tip text={COMBINED_FORMULA} /></div>
            <div className={`value ${combined.total < 0 ? "neg" : ""}`}>{rs(combined.total)}</div>
            <div className="sub">Cafe {rs(combined.cafe)} + Villa {rs(combined.villa)}</div>
          </div>
        </div>
      )}

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
