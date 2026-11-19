import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { today } from "@/lib/today";
import { addDays, addMonths, daysInMonth, monthLabel, monthOf } from "@/lib/calc/dates";
import {
  amountDue, calendarRows, closedList, commissionDue, commissionPayment, countsAsRevenue, expectedIn, isBooking, isCost, paidAmount,
  paymentState, platformsToClose, revenueWeights, roomTotals, stillOpen, VILLA_FORMULAS, villaMonth, villaRecovery, villaTable,
  type RoomFigures,
} from "@/lib/calc/villa";
import { num, pct, rs } from "@/lib/calc/money";
import { CsvButton, Tip } from "@/components/ui";
import { StorageError } from "@/components/StorageError";
import { HEADERS } from "@/lib/data/schema";
import { BarSeriesChart } from "@/components/Charts";
import { ALL_ROOMS, COMMISSION_COST_CATEGORY, villaAccountLabel, type CapitalContribution, type Settings, type VillaRecord } from "@/lib/types";
import { BookingForm, ClosePlatforms, CommissionButton, CostForm, DeleteVillaButton, PaymentButton } from "./VillaForms";

type View = "bookings" | "costs" | "summary" | "calendar" | "recovery";
const VIEWS: [View, string][] = [["bookings", "Bookings"], ["costs", "Costs"], ["summary", "Summary"], ["calendar", "Calendar"], ["recovery", "Re-earn"]];

/** Fixed platform → colour slot order (colour follows the platform, never its rank). */
const PLATFORM_SLOTS = ["--series-1", "--series-2", "--series-3", "--series-4", "--series-5"];

type SP = { view?: string; month?: string; room?: string; platform?: string; status?: string; pay?: string; edit?: string; cost?: string; nroom?: string; nin?: string };

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function VillaPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("owner");
  let records: VillaRecord[], settings: Settings, capital: CapitalContribution[];
  try {
    [records, settings, capital] = await Promise.all([repo.villa(), repo.settings(), repo.capital()]);
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
    const p = new URLSearchParams({
      view, month,
      ...(sp.room ? { room: sp.room } : {}), ...(sp.platform ? { platform: sp.platform } : {}),
      ...(sp.status ? { status: sp.status } : {}), ...(sp.pay ? { pay: sp.pay } : {}),
      ...extra,
    });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `?${p.toString()}`;
  };
  const bookingsAll = records.filter(isBooking);
  const openPlatformAlerts = bookingsAll.filter((b) => stillOpen(b, settings, t).length > 0);

  /** "Paid", "Part paid Rs 10,000 of 40,000" or "Not paid" as a badge. */
  const PayBadge = ({ b }: { b: VillaRecord }) => {
    if (!countsAsRevenue(b)) return null;
    const s = paymentState(b);
    const cls = s === "Paid" ? "good" : s === "Part paid" ? "warn" : "bad";
    return (
      <span className={`badge ${cls}`}>
        {s === "Paid" ? `Paid → ${villaAccountLabel(b.received_to || "-")}` : s === "Part paid" ? `Part paid ${num(paidAmount(b))} of ${num(expectedIn(b))}` : `Not paid · ${num(expectedIn(b))} to receive`}
      </span>
    );
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
      {openPlatformAlerts.length > 0 && view !== "bookings" && (
        <a className="card spread open-bills-banner" href={`?view=bookings&month=${monthOf(openPlatformAlerts[0].check_in)}`} style={{ textDecoration: "none", color: "inherit" }}>
          <span>⚠ <b>{openPlatformAlerts.length} booking{openPlatformAlerts.length === 1 ? "" : "s"}</b> not closed on the other platforms yet <Tip text={VILLA_FORMULAS.closePlatforms} /></span>
          <b>Check →</b>
        </a>
      )}

      {view === "bookings" && <Bookings />}
      {view === "costs" && <Costs />}
      {view === "summary" && <Summary />}
      {view === "calendar" && <Calendar />}
      {view === "recovery" && <Recovery />}
    </div>
  );

  // ---------- Bookings ----------
  function Bookings() {
    const editing = sp.edit ? records.find((r) => r.record_id === sp.edit && isBooking(r)) : undefined;
    const list = bookingsAll
      // a booking "touches" the month when it has a night in it, or (cancelled) its check-in is in it
      .filter((b) => revenueWeights(b, { villa_allocation: "nights" }).has(month) || monthOf(b.check_in) === month)
      .filter((b) => !sp.room || b.room_number === sp.room)
      .filter((b) => !sp.platform || b.platform === sp.platform)
      .filter((b) => !sp.status || b.status === sp.status)
      .filter((b) => !sp.pay || (countsAsRevenue(b) && paymentState(b) === sp.pay))
      .sort((a, b) => a.check_in.localeCompare(b.check_in) || a.room_number.localeCompare(b.room_number));
    const due = list.reduce((s, b) => s + amountDue(b), 0);
    return (
      <>
        <BookingForm
          key={editing?.record_id ?? `new-${sp.nroom ?? ""}-${sp.nin ?? ""}`}
          editing={editing ?? null}
          rooms={settings.villa_rooms}
          platforms={settings.villa_platforms}
          today={t}
          cancelHref={q({ edit: "", nroom: "", nin: "" })}
          startRoom={sp.nroom}
          startCheckIn={sp.nin}
        />
        {openPlatformAlerts.length > 0 && (
          <div className="card warn small">
            ⚠ <b>Close these dates on the other platforms</b> <Tip text={VILLA_FORMULAS.closePlatforms} />:{" "}
            {openPlatformAlerts.map((b) => `${b.room_number} ${b.check_in.slice(5)}→${b.check_out.slice(5)} (${stillOpen(b, settings, t).join(", ")})`).join(" · ")}
          </div>
        )}
        <form className="card filters" method="get">
          <input type="hidden" name="view" value="bookings" />
          <label className="field"><span>Month</span><input type="month" name="month" defaultValue={month} /></label>
          <label className="field"><span>Room</span>
            <select name="room" defaultValue={sp.room ?? ""}><option value="">All</option>{rooms.map((r) => <option key={r}>{r}</option>)}</select>
          </label>
          <label className="field"><span>Platform</span>
            <select name="platform" defaultValue={sp.platform ?? ""}><option value="">All</option>{platforms.map((p) => <option key={p}>{p}</option>)}</select>
          </label>
          <label className="field"><span>Status</span>
            <select name="status" defaultValue={sp.status ?? ""}><option value="">All</option><option>Confirmed</option><option>Completed</option><option>Cancelled</option></select>
          </label>
          <label className="field"><span>Payment</span>
            <select name="pay" defaultValue={sp.pay ?? ""}><option value="">All</option><option>Not paid</option><option>Part paid</option><option>Paid</option></select>
          </label>
          <button className="small primary">Filter</button>
          <a className="btn small" href={`?view=bookings&month=${month}`}>Clear</a>
        </form>
        <div className="spread">
          <b>{list.length} booking{list.length === 1 ? "" : "s"} touching {monthLabel(month)}</b>
          {due > 0 && <span className="small">Still to receive <b>{rs(due)}</b> <Tip text={VILLA_FORMULAS.toReceive} /></span>}
        </div>
        <div className="list">
          {list.length === 0 && <span className="muted">No bookings.</span>}
          {list.map((b) => {
            const toClose = platformsToClose(b, settings);
            const live = b.status === "Confirmed" && b.check_out >= t;
            const cDue = commissionDue(b, records);
            const cPaid = b.commission_later ? commissionPayment(b, records) : undefined;
            const left = amountDue(b);
            return (
              <div key={b.record_id} className="item" style={{ alignItems: "flex-start", opacity: b.status === "Cancelled" ? 0.7 : 1 }}>
                <span aria-hidden style={{ width: 6, alignSelf: "stretch", borderRadius: 3, background: colorOf(b.platform) }} />
                <div className="grow">
                  <div className="spread">
                    <b>{b.room_number} · {b.guest_name || "Guest"}{b.guests ? ` (${b.guests})` : ""}{b.breakfast ? " · 🍳" : ""}</b>
                    <b className="num">{rs(b.total_price)}</b>
                  </div>
                  <div className="small muted">
                    {b.check_in} → {b.check_out} · {b.nights} night{b.nights === 1 ? "" : "s"} · {b.platform}{b.booking_ref ? ` ${b.booking_ref}` : ""}
                    {b.breakfast ? " · Breakfast included" : ""}
                  </div>
                  <div className="small row" style={{ marginTop: 4 }}>
                    <span className={`badge ${b.status === "Cancelled" ? "bad" : b.status === "Completed" ? "good" : ""}`}>{b.status}</span>
                    <span>Commission {num(b.commission_amount)} ({b.commission_pct}%) · costs {num(b.booking_costs)} · <b>net {num(b.net_payout)}</b></span>
                    <PayBadge b={b} />
                    {b.commission_later && b.commission_amount > 0 && countsAsRevenue(b) && (
                      <span className={`badge ${cPaid ? "good" : "warn"}`}>
                        {cPaid ? `Commission paid ${cPaid.date_entered.slice(5)} · ${villaAccountLabel(cPaid.paid_from)}` : "Commission to pay later"} <Tip text={VILLA_FORMULAS.commissionLater} />
                      </span>
                    )}
                  </div>
                  {live && toClose.length > 0 && <ClosePlatforms id={b.record_id} platforms={toClose} closed={closedList(b)} />}
                  <div className="row" style={{ marginTop: 6 }}>
                    <a className="btn small" href={q({ edit: b.record_id })}>Edit</a>
                    {left > 0 && <PaymentButton id={b.record_id} today={t} due={left} defaultTo={b.received_to || (b.platform === "Direct" ? "Villa petty cash" : "Owner Bank")} />}
                    {cDue > 0 && <CommissionButton id={b.record_id} today={t} amount={cDue} />}
                    <DeleteVillaButton id={b.record_id} label="booking" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  // ---------- Costs ----------
  function Costs() {
    const editing = sp.cost ? records.find((r) => r.record_id === sp.cost && isCost(r)) : undefined;
    const list = records.filter((r) => isCost(r) && monthOf(r.date_entered) === month).sort((a, b) => b.date_entered.localeCompare(a.date_entered));
    const total = list.reduce((s, c) => s + c.cost_amount, 0);
    const commissionTotal = list.filter((c) => c.cost_category === COMMISSION_COST_CATEGORY).reduce((s, c) => s + c.cost_amount, 0);
    const toPay = bookingsAll.map((b) => ({ b, due: commissionDue(b, records) })).filter((x) => x.due > 0).sort((a, b) => a.b.check_in.localeCompare(b.b.check_in));
    return (
      <>
        {toPay.length > 0 && (
          <div className="card">
            <div className="spread"><b>Commission to pay <Tip text={VILLA_FORMULAS.commissionLater} /></b><b className="num">{rs(toPay.reduce((s, x) => s + x.due, 0))}</b></div>
            <div className="list" style={{ marginTop: 8 }}>
              {toPay.map(({ b, due }) => (
                <div key={b.record_id} className="item">
                  <div className="grow">
                    <div>{b.platform} · {b.room_number} · {b.guest_name || b.booking_ref || "Guest"}</div>
                    <div className="small muted">{b.check_in} → {b.check_out} · {b.commission_pct}% of {num(b.total_price)}</div>
                  </div>
                  <CommissionButton id={b.record_id} today={t} amount={due} />
                </div>
              ))}
            </div>
          </div>
        )}
        <CostForm key={editing?.record_id ?? "new"} editing={editing ?? null} categories={settings.villa_cost_categories} rooms={rooms} today={t} cancelHref={`?view=costs&month=${month}`} />
        <div className="spread">
          <form className="row" method="get">
            <input type="hidden" name="view" value="costs" />
            <input type="month" name="month" defaultValue={month} style={{ width: 170 }} aria-label="Month" />
            <button className="small">Show</button>
          </form>
          <b>
            Total {monthLabel(month)}: {rs(total)}
            {commissionTotal > 0 && <span className="small muted"> · incl. commission {rs(commissionTotal)} <Tip text={VILLA_FORMULAS.villaCosts} /></span>}
          </b>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Room</th><th className="num">Amount</th><th>Paid from</th><th></th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.record_id}>
                  <td>{c.date_entered.slice(5)}</td><td>{c.cost_category}</td><td>{c.cost_description}</td><td>{c.cost_room}</td>
                  <td className="num">{num(c.cost_amount)}</td><td>{villaAccountLabel(c.paid_from)}</td>
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
    const toDate = rows.filter((r) => r.month <= monthOf(t));
    const roomsMonth = roomTotals([m], rooms);
    const roomsToDate = roomTotals(toDate, rooms);
    const H = ({ l, tip }: { l: string; tip?: string }) => (
      <th className="num"><span className="row" style={{ justifyContent: "flex-end", gap: 2, flexWrap: "nowrap" }}>{l}{tip && <Tip text={tip} />}</span></th>
    );
    const total = (f: (r: (typeof rows)[number]) => number) => toDate.reduce((s, r) => s + f(r), 0);
    const RoomTable = ({ data, days }: { data: { rooms: RoomFigures[]; total: RoomFigures }; days: number | null }) => (
      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table>
          <thead>
            <tr>
              <th>Room</th><H l="Nights" />{days !== null && <H l="Occupancy" tip={VILLA_FORMULAS.occupancy} />}
              <H l="Avg / night" tip={VILLA_FORMULAS.roomAvg} />
              <H l="Gross" /><H l="Commission" /><H l="Booking costs" /><H l="Own costs" /><H l={`Share of ${ALL_ROOMS}`} />
              <H l="Net profit" tip={VILLA_FORMULAS.perRoom} />
            </tr>
          </thead>
          <tbody>
            {[...data.rooms, data.total].map((r) => (
              <tr key={r.room} className={r.room === "Total" ? "total" : ""}>
                <td>{r.room}</td>
                <td className="num">{r.nights}</td>
                {days !== null && <td className="num">{pct(r.nights, (r.room === "Total" ? rooms.length : 1) * days, 0)}</td>}
                <td className="num"><b>{r.avgPricePerNight === null ? "-" : num(r.avgPricePerNight)}</b></td>
                <td className="num">{num(r.gross)}</td><td className="num">{num(r.commission)}</td><td className="num">{num(r.bookingCosts)}</td>
                <td className="num">{num(r.ownCosts)}</td><td className="num">{num(r.sharedCosts)}</td>
                <td className={`num ${r.netProfit < 0 ? "neg" : ""}`}><b>{num(r.netProfit)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    return (
      <>
        <p className="small muted" style={{ margin: 0 }}>
          {settings.villa_allocation === "nights" ? "Revenue is split across months by nights stayed." : "Revenue is counted in the check-in month."} <Tip text={VILLA_FORMULAS.allocation} />
        </p>
        <div className="grid cols-4">
          <div className="card stat"><div className="label">Net profit · {monthLabel(month)} <Tip text={VILLA_FORMULAS.netProfit} /></div><div className={`value ${m.netProfit < 0 ? "neg" : ""}`}>{rs(m.netProfit)}</div><div className="sub">Gross {rs(m.gross)}</div></div>
          <div className="card stat"><div className="label">Occupancy <Tip text={VILLA_FORMULAS.occupancy} /></div><div className="value">{m.occupancy === null ? "-" : pct(m.bookedNights, rooms.length * m.days, 0)}</div><div className="sub">{m.bookedNights} of {rooms.length * m.days} room-nights</div></div>
          <div className="card stat"><div className="label">Avg price / night <Tip text={VILLA_FORMULAS.avgRate} /></div><div className="value">{m.avgPricePerNight === null ? "-" : rs(m.avgPricePerNight)}</div><div className="sub">Since opening {roomsToDate.total.avgPricePerNight === null ? "-" : rs(roomsToDate.total.avgPricePerNight)}</div></div>
          <div className="card stat"><div className="label">Bookings</div><div className="value">{m.bookings}</div><div className="sub">counted this month</div></div>
        </div>

        <div className="card">
          <b>By room · {monthLabel(month)} <Tip text={`${VILLA_FORMULAS.roomAvg}. ${VILLA_FORMULAS.perRoom}`} /></b>
          <RoomTable data={roomsMonth} days={m.days} />
        </div>
        <div className="card">
          <b>By room · since {monthLabel(from)} (to date) <Tip text={`${VILLA_FORMULAS.roomAvg}. ${VILLA_FORMULAS.perRoom}`} /></b>
          <RoomTable data={roomsToDate} days={null} />
        </div>

        <div className="card">
          <b>Monthly net profit</b>
          <BarSeriesChart data={rows.map((r) => ({ label: monthLabel(r.month).replace(" 20", " '"), value: r.netProfit }))} name="Net profit" />
        </div>

        <div className="spread">
          <h2>Month by month</h2>
          <CsvButton filename="villa-monthly" headers={["month", "gross", "commission", "booking_costs", "villa_costs", "net_profit", "booked_nights", "occupancy_pct", "avg_price_per_night", ...rooms.flatMap((r) => [`${r}_avg_per_night`, `${r}_net_profit`])]}
            rows={rows.map((r) => [r.month, r.gross, r.commission, r.bookingCosts, r.villaCosts, r.netProfit, r.bookedNights, r.occupancy === null ? "-" : (r.occupancy * 100).toFixed(1), r.avgPricePerNight ?? "-", ...r.perRoom.flatMap((x) => [x.avgPricePerNight ?? "-", x.netProfit])])} />
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
                <H l="Avg / night" tip={VILLA_FORMULAS.avgRate} />
                {rooms.map((r) => <H key={r} l={`${r} avg / net`} tip={`${r}: average price per night / net profit`} />)}
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
                  <td className="num">{r.avgPricePerNight === null ? "-" : num(r.avgPricePerNight)}</td>
                  {r.perRoom.map((o) => (
                    <td key={o.room} className="num" style={{ whiteSpace: "nowrap" }}>
                      {o.avgPricePerNight === null ? "-" : num(o.avgPricePerNight)} / <span className={o.netProfit < 0 ? "neg" : ""}>{num(o.netProfit)}</span>
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="total">
                <td>To date</td>
                <td className="num">{num(total((r) => r.gross))}</td><td className="num">{num(total((r) => r.commission))}</td>
                <td className="num">{num(total((r) => r.bookingCosts))}</td><td className="num">{num(total((r) => r.villaCosts))}</td>
                <td className="num">{num(total((r) => r.netProfit))}</td><td className="num">{total((r) => r.bookedNights)}</td>
                <td></td>
                <td className="num">{roomsToDate.total.avgPricePerNight === null ? "-" : num(roomsToDate.total.avgPricePerNight)}</td>
                {roomsToDate.rooms.map((o) => (
                  <td key={o.room} className="num" style={{ whiteSpace: "nowrap" }}>{o.avgPricePerNight === null ? "-" : num(o.avgPricePerNight)} / {num(o.netProfit)}</td>
                ))}
              </tr>
            </tbody>
          </table>
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
      </>
    );
  }

  // ---------- Calendar ----------
  function Calendar() {
    const days = daysInMonth(month);
    const grid = calendarRows(month, records, rooms);
    // Rooms in pairs (Tide & Breeze, then Nest & Cove) with a small gap between the pairs.
    const groups: (typeof grid)[] = [];
    for (let i = 0; i < grid.length; i += 2) groups.push(grid.slice(i, i + 2));
    const week = addDays(t, 7);
    const arrivals = bookingsAll.filter((b) => b.status === "Confirmed" && b.check_in >= t && b.check_in <= week).sort((a, b) => a.check_in.localeCompare(b.check_in));
    const departures = bookingsAll.filter((b) => (b.status === "Confirmed" || b.status === "Completed") && b.check_out >= t && b.check_out <= week).sort((a, b) => a.check_out.localeCompare(b.check_out));
    const tip = (b: VillaRecord) => {
      const open = stillOpen(b, settings, t);
      return [
        `${b.guest_name || "Guest"}${b.guests ? ` (${b.guests} guests)` : ""}`,
        `${b.room_number} · ${b.platform}${b.booking_ref ? ` ${b.booking_ref}` : ""}`,
        `${b.check_in} → ${b.check_out} · ${b.nights} night${b.nights === 1 ? "" : "s"}`,
        `Breakfast: ${b.breakfast ? "Included 🍳" : "Not included"}`,
        `Price ${rs(b.total_price)} · ${paymentState(b)}${amountDue(b) ? ` (${rs(amountDue(b))} to receive)` : ""}`,
        b.commission_later ? `Commission ${rs(b.commission_amount)}: ${commissionDue(b, records) ? "to pay later" : "paid"}` : `Commission ${rs(b.commission_amount)}`,
        open.length ? `⚠ Not closed yet on: ${open.join(", ")}` : platformsToClose(b, settings).length ? "Other platforms closed ✓" : "",
        b.notes ? `Notes: ${b.notes}` : "",
      ].filter(Boolean).join("\n");
    };
    return (
      <>
        <div className="spread">
          <div className="row">
            <a className="btn small" href={`?view=calendar&month=${addMonths(month, -1)}`} aria-label="Previous month">‹</a>
            <b>{monthLabel(month)}</b>
            <a className="btn small" href={`?view=calendar&month=${addMonths(month, 1)}`} aria-label="Next month">›</a>
            {month !== monthOf(t) && <a className="btn small" href={`?view=calendar&month=${monthOf(t)}`}>Today</a>}
          </div>
          <div className="legend" style={{ margin: 0 }}>
            {platforms.map((p) => <span key={p}><i style={{ background: colorOf(p) }} />{p}</span>)}
            <span>🍳 breakfast</span><span>💰 not fully paid</span><span>⚠ other platforms open</span>
          </div>
        </div>
        <div className="table-wrap">
          <table className="cal">
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, zIndex: 2, background: "var(--surface)" }}>Room</th>
                {days.map((d) => {
                  const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
                  return <th key={d} className={`${d === t ? "today" : ""} ${wd === 0 || wd === 6 ? "weekend" : ""}`} style={{ textAlign: "center", padding: "6px 0", minWidth: 34 }}>{Number(d.slice(8))}<div className="small muted" style={{ fontWeight: 400 }}>{"SMTWTFS"[wd]}</div></th>;
                })}
              </tr>
            </thead>
            {groups.map((g, gi) => (
              <tbody key={gi} className="cal-group">
                {g.map((row) => (
                  <tr key={row.room}>
                    <td className="cal-room"><b>{row.room}</b></td>
                    {row.cells.map((c) => {
                      if (!c.booking) {
                        const d = days[c.start];
                        return (
                          <td key={c.start} className={`cal-free ${d === t ? "today" : ""} ${d < t ? "past" : ""}`}>
                            {d >= t && <a href={`?view=bookings&month=${monthOf(d)}&nroom=${encodeURIComponent(row.room)}&nin=${d}`} title={`New booking · ${row.room} · from ${d}`} aria-label={`New booking ${row.room} ${d}`}>+</a>}
                          </td>
                        );
                      }
                      const b = c.booking;
                      const unpaid = countsAsRevenue(b) && paymentState(b) !== "Paid";
                      const open = stillOpen(b, settings, t).length > 0;
                      return (
                        <td key={c.start} colSpan={c.span} className="cal-booked" style={{ background: colorOf(b.platform) }}>
                          <a href={`?view=bookings&month=${month}&edit=${b.record_id}`} title={tip(b)}>
                            <span className="cal-name">{c.continues ? "… " : ""}{b.guest_name || b.platform}</span>
                            <span className="cal-icons">{b.breakfast ? "🍳" : ""}{unpaid ? "💰" : ""}{open ? "⚠" : ""}</span>
                          </a>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Hover a booking for guest, breakfast, payment and platform details; tap it to edit. Tap <b>+</b> on a free day to start a booking for that room and date. Cancelled bookings are not shown.
        </p>
        <div className="grid md-2">
          <div className="card">
            <b>Arrivals · next 7 days</b>
            <div className="list" style={{ marginTop: 8 }}>
              {arrivals.length === 0 && <span className="muted small">None</span>}
              {arrivals.map((b) => (
                <a key={b.record_id} className="item" href={`?view=bookings&month=${monthOf(b.check_in)}&edit=${b.record_id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div className="grow">
                    <div><b>{b.check_in.slice(5)}</b> · {b.room_number} · {b.guest_name || b.platform}{b.guests ? ` (${b.guests})` : ""}{b.breakfast ? " · 🍳" : ""}</div>
                    <div className="small muted">{b.nights} night{b.nights === 1 ? "" : "s"} · {b.platform}</div>
                  </div>
                  <PayBadge b={b} />
                  {stillOpen(b, settings, t).length > 0 && <span className="badge warn">⚠ close {stillOpen(b, settings, t).join(", ")}</span>}
                </a>
              ))}
            </div>
          </div>
          <div className="card">
            <b>Departures · next 7 days</b>
            <div className="list" style={{ marginTop: 8 }}>
              {departures.length === 0 && <span className="muted small">None</span>}
              {departures.map((b) => (
                <a key={b.record_id} className="item" href={`?view=bookings&month=${monthOf(b.check_in)}&edit=${b.record_id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div className="grow"><b>{b.check_out.slice(5)}</b> · {b.room_number} · {b.guest_name || b.platform}</div>
                  <PayBadge b={b} />
                </a>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ---------- Re-earn (recovery) ----------
  function Recovery() {
    const r = villaRecovery(records, capital, settings, t);
    const season = settings.villa_season_months.map((m) => MONTH_SHORT[m - 1]).join(", ");
    const years = r.monthsToGo === null ? null : r.monthsToGo / 12;
    return (
      <>
        <p className="small muted" style={{ margin: 0 }}>
          How much of the money put into the villa has been earned back, and roughly how long the rest takes. Season months (Settings: villa_season_months): <b>{season}</b>.
        </p>
        <div className="grid cols-4">
          <div className="card stat">
            <div className="label">Total to recover <Tip text={VILLA_FORMULAS.recovery} /></div>
            <div className="value">{rs(r.totalToRecover)}</div>
            <div className="sub">Capital {rs(r.capital)} + Costs {rs(r.costs)}{r.ownerPaidCosts ? ` (owner paid ${rs(r.ownerPaidCosts)})` : ""}</div>
          </div>
          <div className="card stat">
            <div className="label">Earned so far <Tip text={VILLA_FORMULAS.recovery} /></div>
            <div className="value">{rs(r.earned)}</div>
            <div className="sub">{r.recoveredPct === null ? "-" : `${(r.recoveredPct * 100).toFixed(0)}% recovered`}</div>
          </div>
          <div className={`card stat ${r.remaining > 0 ? "warn" : ""}`}>
            <div className="label">Still to recover</div>
            <div className={`value ${r.remaining > 0 ? "neg" : "pos"}`}>{rs(Math.max(0, r.remaining))}</div>
            <div className="sub">{r.remaining <= 0 ? `Recovered ✓ (${rs(-r.remaining)} ahead)` : "Total to recover − Earned"}</div>
          </div>
          <div className="card stat">
            <div className="label">Rough time to recover <Tip text={VILLA_FORMULAS.recoveryPace} /></div>
            <div className="value">
              {r.remaining <= 0 ? "Done" : r.monthsToGo === null ? "-" : `${years! < 1 ? `${r.monthsToGo} mo` : `≈ ${years!.toFixed(1)} yrs`}`}
            </div>
            <div className="sub">
              {r.remaining <= 0
                ? `in ${monthLabel(r.recoveredBy ?? monthOf(t))}`
                : r.monthsToGo === null
                  ? r.seasonAvg === null ? "Needs at least one season month with bookings" : "Season earnings don't cover the year yet"
                  : `${r.seasonMonthsToGo} more season months · around ${monthLabel(r.recoveredBy!)}`}
            </div>
          </div>
        </div>

        {r.totalToRecover > 0 && (
          <div className="card">
            <div className="spread small"><b>Recovered</b><span>{rs(r.earned)} of {rs(r.totalToRecover)}</span></div>
            <div style={{ height: 14, background: "var(--surface-2)", borderRadius: 7, overflow: "hidden", marginTop: 6 }} role="img" aria-label={`${((r.recoveredPct ?? 0) * 100).toFixed(0)}% recovered`}>
              <div style={{ width: `${(r.recoveredPct ?? 0) * 100}%`, height: "100%", background: "var(--series-1)", borderRadius: 7 }} />
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>
              Pattern used: season month average net <b>{r.seasonAvg === null ? "-" : rs(r.seasonAvg)}</b> ({r.seasonMonthsUsed} month{r.seasonMonthsUsed === 1 ? "" : "s"}) ·
              off-season month average <b>{r.offSeasonAvg === null ? "Rs 0 (no data yet)" : rs(r.offSeasonAvg)}</b> ({r.offMonthsUsed} month{r.offMonthsUsed === 1 ? "" : "s"}).
              {r.seasonAvg !== null && ` One year ≈ ${rs(r.seasonAvg * settings.villa_season_months.length + (r.offSeasonAvg ?? 0) * (12 - settings.villa_season_months.length))}.`}
            </div>
          </div>
        )}

        <div className="card">
          <b>Still to recover after each month</b>
          <BarSeriesChart data={r.rows.map((x) => ({ label: monthLabel(x.month).replace(" 20", " '"), value: Math.max(0, x.remaining) }))} name="Still to recover" />
        </div>

        <div className="spread">
          <h2>Month by month</h2>
          <CsvButton filename="villa-recovery" headers={["month", "season", "earned", "costs", "net", "still_to_recover"]}
            rows={r.rows.map((x) => [x.month, x.season ? "yes" : "no", x.earned, x.costs, x.net, x.remaining])} />
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Month</th><th>Season</th><th className="num">Earned</th><th className="num">Costs</th><th className="num">Net</th><th className="num">Still to recover</th></tr></thead>
            <tbody>
              <tr><td>Start</td><td></td><td></td><td></td><td></td><td className="num">{num(r.capital)} <span className="small muted">capital</span></td></tr>
              {r.rows.map((x) => (
                <tr key={x.month}>
                  <td style={{ whiteSpace: "nowrap" }}>{monthLabel(x.month)}{x.month === monthOf(t) && <span className="small badge" style={{ marginLeft: 6 }}>now</span>}</td>
                  <td>{x.season ? <span className="badge good">Season</span> : <span className="small muted">Off</span>}</td>
                  <td className="num">{num(x.earned)}</td>
                  <td className="num">{num(x.costs)}</td>
                  <td className={`num ${x.net < 0 ? "neg" : ""}`}>{num(x.net)}</td>
                  <td className="num"><b>{x.remaining > 0 ? num(x.remaining) : `✓ ${num(-x.remaining)} ahead`}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Capital counts only contributions for MO Villa (Capital page). If set-up money went into Villa Petty Cash and was then spent as a villa cost, it is counted in both — record set-up spending on the Capital page only.
        </p>
      </>
    );
  }
}
