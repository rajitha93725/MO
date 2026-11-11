import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { today } from "@/lib/today";
import { addMonths, daysInMonth, monthLabel, monthOf } from "@/lib/calc/dates";
import { calendarGrid, isBooking, isCost, revenueWeights, VILLA_FORMULAS, villaMonth, villaTable } from "@/lib/calc/villa";
import { num, pct, rs } from "@/lib/calc/money";
import { CsvButton, Tip } from "@/components/ui";
import { StorageError } from "@/components/StorageError";
import { HEADERS } from "@/lib/data/schema";
import { BarSeriesChart } from "@/components/Charts";
import { ALL_ROOMS, type Settings, type VillaRecord } from "@/lib/types";
import { BookingForm, CostForm, PayoutButton, DeleteVillaButton } from "./VillaForms";

type View = "bookings" | "costs" | "summary" | "calendar";
const VIEWS: [View, string][] = [["bookings", "Bookings"], ["costs", "Costs"], ["summary", "Summary"], ["calendar", "Calendar"]];

/** Fixed platform → colour slot order (colour follows the platform, never its rank). */
const PLATFORM_SLOTS = ["--series-1", "--series-2", "--series-3", "--series-4", "--series-5"];

type SP = { view?: string; month?: string; room?: string; platform?: string; status?: string; edit?: string; cost?: string };

export default async function VillaPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("owner");
  let records: VillaRecord[], settings: Settings;
  try {
    [records, settings] = await Promise.all([repo.villa(), repo.settings()]);
  } catch (e) {
    return <StorageError error={e} />;
  }
  const sp = await searchParams;
  const view: View = (VIEWS.find(([v]) => v === sp.view)?.[0] ?? "bookings") as View;
  const t = today(settings);
  const month = sp.month || monthOf(t);
  const rooms = settings.villa_rooms.map((r) => r.room_number);
  const platforms = settings.villa_platforms.map((p) => p.name);
  const colorOf = (platform: string) => {
    const i = platforms.indexOf(platform);
    return `var(${PLATFORM_SLOTS[i >= 0 && i < PLATFORM_SLOTS.length ? i : PLATFORM_SLOTS.length - 1]})`;
  };
  const q = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ view, month, ...(sp.room ? { room: sp.room } : {}), ...(sp.platform ? { platform: sp.platform } : {}), ...(sp.status ? { status: sp.status } : {}), ...extra });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `?${p.toString()}`;
  };

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>MO Villa</h1>
        <CsvButton filename="mo-villa" headers={HEADERS.villa} rows={records.map((r) => HEADERS.villa.map((h) => (r as any)[h]))} />
      </div>
      <div className="seg" role="tablist">
        {VIEWS.map(([v, label]) => (
          <Link key={v} href={`?view=${v}&month=${month}`} className={`btn ${view === v ? "primary" : ""}`} role="tab" aria-selected={view === v}>
            {label}
          </Link>
        ))}
      </div>

      {view === "bookings" && <Bookings />}
      {view === "costs" && <Costs />}
      {view === "summary" && <Summary />}
      {view === "calendar" && <Calendar />}
    </div>
  );

  // ---------- Bookings ----------
  function Bookings() {
    const editing = sp.edit ? records.find((r) => r.record_id === sp.edit && isBooking(r)) : undefined;
    const list = records
      .filter(isBooking)
      // a booking "touches" the month when it has a night in it, or (cancelled) its check-in is in it
      .filter((b) => revenueWeights(b, { villa_allocation: "nights" }).has(month) || monthOf(b.check_in) === month)
      .filter((b) => !sp.room || b.room_number === sp.room)
      .filter((b) => !sp.platform || b.platform === sp.platform)
      .filter((b) => !sp.status || b.status === sp.status)
      .sort((a, b) => a.check_in.localeCompare(b.check_in) || a.room_number.localeCompare(b.room_number));
    return (
      <>
        <BookingForm
          key={editing?.record_id ?? "new"}
          editing={editing ?? null}
          rooms={settings.villa_rooms}
          platforms={settings.villa_platforms}
          today={t}
          cancelHref={q({ edit: "" })}
        />
        <form className="card form-grid" method="get">
          <input type="hidden" name="view" value="bookings" />
          <label className="field"><span>Month</span><input type="month" name="month" defaultValue={month} /></label>
          <label className="field"><span>Room</span>
            <select name="room" defaultValue={sp.room ?? ""}><option value="">All rooms</option>{rooms.map((r) => <option key={r}>{r}</option>)}</select>
          </label>
          <label className="field"><span>Platform</span>
            <select name="platform" defaultValue={sp.platform ?? ""}><option value="">All</option>{platforms.map((p) => <option key={p}>{p}</option>)}</select>
          </label>
          <label className="field"><span>Status</span>
            <select name="status" defaultValue={sp.status ?? ""}><option value="">All</option><option>Confirmed</option><option>Completed</option><option>Cancelled</option></select>
          </label>
          <div className="row full"><button className="small">Filter</button><a className="btn small" href={`?view=bookings&month=${month}`}>Clear</a></div>
        </form>
        <div className="spread"><b>{list.length} booking{list.length === 1 ? "" : "s"} touching {monthLabel(month)}</b></div>
        <div className="list">
          {list.length === 0 && <span className="muted">No bookings.</span>}
          {list.map((b) => (
            <div key={b.record_id} className="item" style={{ alignItems: "flex-start", opacity: b.status === "Cancelled" ? 0.7 : 1 }}>
              <span aria-hidden style={{ width: 6, alignSelf: "stretch", borderRadius: 3, background: colorOf(b.platform) }} />
              <div className="grow">
                <div className="spread">
                  <b>{b.room_number} · {b.guest_name || "Guest"}{b.guests ? ` (${b.guests})` : ""}</b>
                  <b className="num">{rs(b.total_price)}</b>
                </div>
                <div className="small muted">
                  {b.check_in} → {b.check_out} · {b.nights} night{b.nights === 1 ? "" : "s"} · {b.platform}{b.booking_ref ? ` ${b.booking_ref}` : ""}
                </div>
                <div className="small row" style={{ marginTop: 4 }}>
                  <span className={`badge ${b.status === "Cancelled" ? "bad" : b.status === "Completed" ? "good" : ""}`}>{b.status}</span>
                  <span>Commission {num(b.commission_amount)} · costs {num(b.booking_costs)} · <b>net {num(b.net_payout)}</b></span>
                  <span className={`badge ${b.payout_status === "Received" ? "good" : "warn"}`}>
                    {b.payout_status === "Received" ? `Received → ${b.received_to}` : "Payout pending"}
                  </span>
                </div>
                <div className="row" style={{ marginTop: 6 }}>
                  <a className="btn small" href={q({ edit: b.record_id })}>Edit</a>
                  {b.payout_status !== "Received" && b.net_payout > 0 && <PayoutButton id={b.record_id} today={t} defaultTo={b.platform === "Direct" ? "Petty cash" : "Bank"} />}
                  <DeleteVillaButton id={b.record_id} label="booking" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  // ---------- Costs ----------
  function Costs() {
    const editing = sp.cost ? records.find((r) => r.record_id === sp.cost && isCost(r)) : undefined;
    const list = records.filter((r) => isCost(r) && monthOf(r.date_entered) === month).sort((a, b) => b.date_entered.localeCompare(a.date_entered));
    const total = list.reduce((s, c) => s + c.cost_amount, 0);
    return (
      <>
        <CostForm key={editing?.record_id ?? "new"} editing={editing ?? null} categories={settings.villa_cost_categories} rooms={rooms} today={t} cancelHref={`?view=costs&month=${month}`} />
        <div className="spread">
          <form className="row" method="get">
            <input type="hidden" name="view" value="costs" />
            <input type="month" name="month" defaultValue={month} style={{ width: 170 }} aria-label="Month" />
            <button className="small">Show</button>
          </form>
          <b>Total {monthLabel(month)}: {rs(total)}</b>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Room</th><th className="num">Amount</th><th>Paid from</th><th></th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.record_id}>
                  <td>{c.date_entered.slice(5)}</td><td>{c.cost_category}</td><td>{c.cost_description}</td><td>{c.cost_room}</td>
                  <td className="num">{num(c.cost_amount)}</td><td>{c.paid_from}</td>
                  <td style={{ whiteSpace: "nowrap" }}><a className="btn small" href={`?view=costs&month=${month}&cost=${c.record_id}`}>Edit</a> <DeleteVillaButton id={c.record_id} label="cost" /></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={7} className="muted">No villa costs this month.</td></tr>}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  // ---------- Monthly summary ----------
  function Summary() {
    const from = settings.opening_month < month ? settings.opening_month : month;
    const to = addMonths(from, 11) > monthOf(t) ? addMonths(from, 11) : monthOf(t);
    const rows = villaTable(from, to, records, settings);
    const m = villaMonth(month, records, settings);
    const H = ({ l, tip }: { l: string; tip?: string }) => (
      <th className="num"><span className="row" style={{ justifyContent: "flex-end", gap: 2, flexWrap: "nowrap" }}>{l}{tip && <Tip text={tip} />}</span></th>
    );
    const total = (f: (r: (typeof rows)[number]) => number) => rows.filter((r) => r.month <= monthOf(t)).reduce((s, r) => s + f(r), 0);
    return (
      <>
        <p className="small muted" style={{ margin: 0 }}>
          {settings.villa_allocation === "nights" ? "Revenue is split across months by nights stayed." : "Revenue is counted in the check-in month."} <Tip text={VILLA_FORMULAS.allocation} />
        </p>
        <div className="grid cols-4">
          <div className="card stat"><div className="label">Net profit · {monthLabel(month)} <Tip text={VILLA_FORMULAS.netProfit} /></div><div className={`value ${m.netProfit < 0 ? "neg" : ""}`}>{rs(m.netProfit)}</div><div className="sub">Gross {rs(m.gross)}</div></div>
          <div className="card stat"><div className="label">Occupancy <Tip text={VILLA_FORMULAS.occupancy} /></div><div className="value">{m.occupancy === null ? "-" : pct(m.bookedNights, rooms.length * m.days, 0)}</div><div className="sub">{m.bookedNights} of {rooms.length * m.days} room-nights</div></div>
          <div className="card stat"><div className="label">Avg price / night <Tip text={VILLA_FORMULAS.avgRate} /></div><div className="value">{m.avgPricePerNight === null ? "-" : rs(m.avgPricePerNight)}</div></div>
          <div className="card stat"><div className="label">Bookings</div><div className="value">{m.bookings}</div><div className="sub">counted this month</div></div>
        </div>

        <div className="card">
          <b>Monthly net profit</b>
          <BarSeriesChart data={rows.map((r) => ({ label: monthLabel(r.month).replace(" 20", " '"), value: r.netProfit }))} name="Net profit" />
        </div>

        <div className="spread">
          <h2>Month by month</h2>
          <CsvButton filename="villa-monthly" headers={["month", "gross", "commission", "booking_costs", "villa_costs", "net_profit", "booked_nights", "occupancy_pct", "avg_price_per_night"]}
            rows={rows.map((r) => [r.month, r.gross, r.commission, r.bookingCosts, r.villaCosts, r.netProfit, r.bookedNights, r.occupancy === null ? "-" : (r.occupancy * 100).toFixed(1), r.avgPricePerNight ?? "-"])} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <H l="Gross bookings" tip={VILLA_FORMULAS.gross} />
                <H l="Commission" tip={VILLA_FORMULAS.commission} />
                <H l="Booking costs" />
                <H l="Villa costs" tip={VILLA_FORMULAS.villaCosts} />
                <H l="Net profit" tip={VILLA_FORMULAS.netProfit} />
                <H l="Nights" />
                <H l="Occupancy" tip={VILLA_FORMULAS.occupancy} />
                {rooms.map((r) => <H key={r} l={r} tip={`Occupancy of ${r}: its booked nights ÷ days in month`} />)}
                <H l="Avg / night" tip={VILLA_FORMULAS.avgRate} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month} style={r.month === month ? { outline: "2px solid var(--brand)", outlineOffset: -2 } : undefined}>
                  <td style={{ whiteSpace: "nowrap" }}><a href={`?view=summary&month=${r.month}`}>{monthLabel(r.month)}</a></td>
                  <td className="num">{num(r.gross)}</td><td className="num">{num(r.commission)}</td><td className="num">{num(r.bookingCosts)}</td>
                  <td className="num">{num(r.villaCosts)}</td>
                  <td className={`num ${r.netProfit < 0 ? "neg" : ""}`}><b>{num(r.netProfit)}</b></td>
                  <td className="num">{r.bookedNights}</td>
                  <td className="num">{r.occupancy === null ? "-" : `${(r.occupancy * 100).toFixed(0)}%`}</td>
                  {r.roomOccupancy.map((o) => <td key={o.room} className="num">{o.occupancy === null ? "-" : `${(o.occupancy * 100).toFixed(0)}%`}</td>)}
                  <td className="num">{r.avgPricePerNight === null ? "-" : num(r.avgPricePerNight)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>To date</td>
                <td className="num">{num(total((r) => r.gross))}</td><td className="num">{num(total((r) => r.commission))}</td>
                <td className="num">{num(total((r) => r.bookingCosts))}</td><td className="num">{num(total((r) => r.villaCosts))}</td>
                <td className="num">{num(total((r) => r.netProfit))}</td><td className="num">{total((r) => r.bookedNights)}</td>
                <td colSpan={rooms.length + 2}></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="grid md-2">
          <div className="card">
            <b>Occupancy by room · {monthLabel(month)}</b>
            <div className="stack" style={{ marginTop: 10 }}>
              {m.roomOccupancy.map((o) => (
                <div key={o.room}>
                  <div className="spread small"><span>{o.room}</span><span>{o.nights}/{m.days} nights · <b>{o.occupancy === null ? "-" : `${(o.occupancy * 100).toFixed(0)}%`}</b></span></div>
                  <div style={{ height: 10, background: "var(--surface-2)", borderRadius: 5, overflow: "hidden" }} role="img" aria-label={`${o.room} ${((o.occupancy ?? 0) * 100).toFixed(0)}%`}>
                    <div style={{ width: `${Math.min(100, (o.occupancy ?? 0) * 100)}%`, height: "100%", background: "var(--series-1)", borderRadius: 5 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <b>By platform · {monthLabel(month)}</b>
            <table className="small" style={{ marginTop: 8 }}>
              <thead><tr><th>Platform</th><th className="num">Bookings</th><th className="num">Revenue</th></tr></thead>
              <tbody>
                {m.byPlatform.map((p) => (
                  <tr key={p.platform}>
                    <td><i aria-hidden style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: colorOf(p.platform), marginRight: 6 }} />{p.platform}</td>
                    <td className="num">{p.bookings}</td><td className="num">{num(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <b>Net profit per room · {monthLabel(month)} <Tip text={VILLA_FORMULAS.perRoom} /></b>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table>
              <thead><tr><th>Room</th><th className="num">Gross</th><th className="num">Commission</th><th className="num">Booking costs</th><th className="num">Own costs</th><th className="num">Share of {ALL_ROOMS}</th><th className="num">Net profit</th></tr></thead>
              <tbody>
                {m.perRoom.map((r) => (
                  <tr key={r.room}>
                    <td>{r.room}</td><td className="num">{num(r.gross)}</td><td className="num">{num(r.commission)}</td><td className="num">{num(r.bookingCosts)}</td>
                    <td className="num">{num(r.ownCosts)}</td><td className="num">{num(r.sharedCosts)}</td>
                    <td className={`num ${r.netProfit < 0 ? "neg" : ""}`}><b>{num(r.netProfit)}</b></td>
                  </tr>
                ))}
                <tr className="total"><td>Total</td><td className="num">{num(m.gross)}</td><td className="num">{num(m.commission)}</td><td className="num">{num(m.bookingCosts)}</td><td className="num" colSpan={2}>{num(m.villaCosts)}</td><td className="num">{num(m.netProfit)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  }

  // ---------- Calendar ----------
  function Calendar() {
    const days = daysInMonth(month);
    const grid = calendarGrid(month, records, rooms);
    return (
      <>
        <div className="spread">
          <div className="row">
            <a className="btn small" href={`?view=calendar&month=${addMonths(month, -1)}`} aria-label="Previous month">‹</a>
            <b>{monthLabel(month)}</b>
            <a className="btn small" href={`?view=calendar&month=${addMonths(month, 1)}`} aria-label="Next month">›</a>
          </div>
          <div className="legend" style={{ margin: 0 }}>
            {platforms.map((p) => <span key={p}><i style={{ background: colorOf(p) }} />{p}</span>)}
          </div>
        </div>
        <div className="table-wrap">
          <table className="cal">
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, zIndex: 2 }}>Room</th>
                {days.map((d) => {
                  const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
                  return <th key={d} className={d === t ? "today" : ""} style={{ textAlign: "center", padding: "6px 0", minWidth: 30 }}>{Number(d.slice(8))}<div className="small muted" style={{ fontWeight: 400 }}>{"SMTWTFS"[wd]}</div></th>;
                })}
              </tr>
            </thead>
            <tbody>
              {grid.map((row) => (
                <tr key={row.room}>
                  <td style={{ position: "sticky", left: 0, background: "var(--surface)", whiteSpace: "nowrap", zIndex: 1 }}><b>{row.room}</b></td>
                  {row.cells.map((b, i) => {
                    if (!b) return <td key={i} className="cal-free" />;
                    const starts = b.check_in === days[i] || i === 0;
                    return (
                      <td key={i} className="cal-booked" style={{ background: colorOf(b.platform) }}>
                        <a href={`?view=bookings&month=${month}&edit=${b.record_id}`} title={`${b.guest_name || "Guest"} · ${b.platform} · ${b.check_in} → ${b.check_out} · ${rs(b.total_price)}`}>
                          {starts ? b.platform.slice(0, 1) : ""}
                        </a>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Coloured cells are booked nights (the letter marks the platform on the first night). Tap a booking to edit it. Cancelled bookings are not shown.</p>
      </>
    );
  }
}
