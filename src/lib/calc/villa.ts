import type { CapitalContribution, ISODate, MonthKey, Settings, VillaRecord } from "../types";
import { ALL_ROOMS, COMMISSION_COST_CATEGORY } from "../types";
import { addDays, addMonths, daysBetween, daysInMonth, monthNumber, monthOf, monthRange } from "./dates";
import { ratio, sum } from "./money";

type VillaSettings = Pick<Settings, "villa_rooms" | "villa_platforms" | "villa_allocation">;

export const VILLA_FORMULAS = {
  nights: "Nights = check_out − check_in",
  commission: "Commission = total_price × commission_pct (can be overridden per booking)",
  netPayout: "Net payout = total_price − commission_amount − booking_costs",
  gross: "Gross bookings = sum of total_price (Cancelled bookings only count when a cancellation fee is entered in total_price)",
  villaCosts: `Villa costs = sum of cost_amount for Cost rows dated in the month, except "${COMMISSION_COST_CATEGORY}" (that commission is already taken off in the booking)`,
  netProfit: "Villa net profit = Gross bookings − Commission − Booking costs − Villa costs",
  occupancy: "Occupancy = booked nights ÷ (rooms × days in month). Cancelled bookings don't occupy nights",
  avgRate: "Average price per night = revenue of the nights stayed in the month ÷ booked nights",
  allocation:
    "Settings: villa_allocation = nights → revenue, commission and booking costs are split across months by nights stayed; check_in → all counted in the check-in month",
  perRoom: "Room net profit = room's bookings net − room's own costs − an equal share of \"All rooms\" costs",
  roomAvg: "Room average price per night = room's revenue of the nights stayed ÷ room's booked nights. Total = all rooms' revenue ÷ all booked nights",
  payouts: "Money received for a booking (full or part) is added to the received_to account on payout_date (or check-out date when blank). Owner Bank / Owner Cash are the owner's own money and don't change business balances",
  toReceive: "To receive = Total price − Booking costs − Commission (only when the platform takes it from the payout). When commission is paid later the guest pays the full price and the commission is paid as a villa Cost",
  payment: "Payment: Not paid (nothing received), Part paid (some received), Paid (all of 'To receive' received)",
  commissionLater: `Commission paid later: the guest pays us, the platform invoices its commission. Pay it with "Pay commission": it is saved as a villa Cost (${COMMISSION_COST_CATEGORY}) so the account balance goes down, but it is not counted twice in profit`,
  closePlatforms: "Tick each other platform once you've blocked these dates there by hand, so the room can't be double-booked",
  recovery:
    "Total to recover = Villa capital + Villa costs (all costs, including those paid by the owner). Earned = Gross bookings − Commission − Booking costs. Still to recover = Total to recover − Earned",
  recoveryPace:
    "Estimate: average net (Earned − Villa costs) per season month and per off-season month, from finished months so far. The remaining amount is taken off month by month from next month (season months from Settings: villa_season_months). Rough guide only",
} as const;

// ---------- booking payment ----------

/** Money the villa should receive for a booking: commission is only taken off when the platform keeps it. */
export function expectedIn(b: Pick<VillaRecord, "net_payout" | "commission_amount" | "commission_later">): number {
  return b.net_payout + (b.commission_later ? b.commission_amount : 0);
}

/** Money received so far. Old rows marked Received without an amount count as fully received. */
export function paidAmount(b: Pick<VillaRecord, "amount_paid" | "payout_status" | "net_payout" | "commission_amount" | "commission_later">): number {
  if (b.amount_paid > 0) return b.amount_paid;
  return b.payout_status === "Received" ? expectedIn(b) : 0;
}

export function amountDue(b: VillaRecord): number {
  if (!countsAsRevenue(b)) return 0;
  return Math.max(0, expectedIn(b) - paidAmount(b));
}

export type PaymentState = "Paid" | "Part paid" | "Not paid";

export function paymentState(b: VillaRecord): PaymentState {
  const paid = paidAmount(b);
  if (paid <= 0) return expectedIn(b) <= 0 ? "Paid" : "Not paid";
  return paid >= expectedIn(b) ? "Paid" : "Part paid";
}

/** The Cost row that paid this booking's commission, if any. */
export function commissionPayment(b: VillaRecord, records: VillaRecord[]): VillaRecord | undefined {
  return records.find((r) => r.record_type === "Cost" && r.booking_id === b.record_id && r.cost_category === COMMISSION_COST_CATEGORY);
}

/** Commission still to pay to the platform (only for "paid later" bookings). */
export function commissionDue(b: VillaRecord, records: VillaRecord[]): number {
  if (!b.commission_later || !countsAsRevenue(b) || b.commission_amount <= 0) return 0;
  return commissionPayment(b, records) ? 0 : b.commission_amount;
}

/** Profit counts every villa cost except platform commission paid later (already taken off in the booking). */
export function countsInProfit(c: VillaRecord): boolean {
  return c.cost_category !== COMMISSION_COST_CATEGORY;
}

// ---------- closing other platforms ----------

/** Other platforms where the dates should be closed by hand (not the booking's own, not Direct / Other). */
export function platformsToClose(b: VillaRecord, settings: Pick<Settings, "villa_platforms">): string[] {
  return settings.villa_platforms.map((p) => p.name).filter((p) => p !== b.platform && p !== "Direct" && p !== "Other");
}

export function closedList(b: Pick<VillaRecord, "closed_platforms">): string[] {
  return (b.closed_platforms || "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Platforms still open for a live booking (Confirmed, not checked out yet). */
export function stillOpen(b: VillaRecord, settings: Pick<Settings, "villa_platforms">, today: ISODate): string[] {
  if (b.record_type !== "Booking" || b.status !== "Confirmed" || b.check_out < today) return [];
  const done = closedList(b);
  return platformsToClose(b, settings).filter((p) => !done.includes(p));
}

// ---------- single booking ----------

export function nightsBetween(check_in: ISODate, check_out: ISODate): number {
  if (!check_in || !check_out) return 0;
  return Math.max(0, daysBetween(check_in, check_out));
}

export function commissionFor(total_price: number, commission_pct: number): number {
  return Math.round((total_price * commission_pct) / 100);
}

export function netPayoutFor(total_price: number, commission_amount: number, booking_costs: number): number {
  return total_price - commission_amount - booking_costs;
}

export function defaultCommissionPct(platform: string, settings: Pick<Settings, "villa_platforms">): number {
  return settings.villa_platforms.find((p) => p.name === platform)?.commission_pct ?? 0;
}

export const isBooking = (r: VillaRecord) => r.record_type === "Booking";
export const isCost = (r: VillaRecord) => r.record_type === "Cost";

/** Cancelled bookings count only when a cancellation fee is entered in total_price. */
export function countsAsRevenue(b: VillaRecord): boolean {
  return b.status !== "Cancelled" || b.total_price > 0;
}

/** Bookings that physically occupy the room (block other bookings, count for occupancy). */
export function occupiesRoom(b: VillaRecord): boolean {
  return b.status === "Confirmed" || b.status === "Completed";
}

// ---------- splitting a stay across months ----------

/** Nights stayed per month: a stay 30 Jan → 2 Feb gives { Jan: 2, Feb: 1 }. */
export function nightsByMonth(check_in: ISODate, check_out: ISODate): Map<MonthKey, number> {
  const out = new Map<MonthKey, number>();
  const n = nightsBetween(check_in, check_out);
  for (let i = 0; i < n; i++) {
    const m = monthOf(addDays(check_in, i));
    out.set(m, (out.get(m) ?? 0) + 1);
  }
  return out;
}

/**
 * Split a whole-rupee amount over months in proportion to weights.
 * Uses the largest-remainder method, so the parts are whole rupees and always add up exactly.
 */
export function splitAmount(amount: number, weights: Map<MonthKey, number>): Map<MonthKey, number> {
  const out = new Map<MonthKey, number>();
  const total = sum([...weights.values()], (w) => w);
  if (!total) return out;
  const parts = [...weights.entries()].map(([m, w]) => {
    const exact = (amount * w) / total;
    return { m, exact, base: Math.floor(exact) };
  });
  for (const p of parts) out.set(p.m, p.base);
  // hand out the leftover rupees to the largest fractional parts (ties: earliest month)
  let remainder = amount - sum(parts, (p) => p.base);
  const byFraction = [...parts].sort((a, b) => b.exact - b.base - (a.exact - a.base) || a.m.localeCompare(b.m));
  for (const p of byFraction) {
    if (remainder <= 0) break;
    out.set(p.m, out.get(p.m)! + 1);
    remainder--;
  }
  return out;
}

/** Months a booking's money is counted in, with the weight of each month. */
export function revenueWeights(b: VillaRecord, settings: Pick<Settings, "villa_allocation">): Map<MonthKey, number> {
  // Cancellation fees and check-in allocation: everything in the check-in month.
  if (b.status === "Cancelled" || settings.villa_allocation === "check_in" || nightsBetween(b.check_in, b.check_out) === 0) {
    return b.check_in ? new Map([[monthOf(b.check_in), 1]]) : new Map();
  }
  return nightsByMonth(b.check_in, b.check_out);
}

export interface BookingMonthShare {
  gross: number;
  commission: number;
  bookingCosts: number;
}

/** A booking's gross, commission and booking costs counted in one month. */
export function bookingShareForMonth(b: VillaRecord, month: MonthKey, settings: Pick<Settings, "villa_allocation">): BookingMonthShare {
  if (!countsAsRevenue(b)) return { gross: 0, commission: 0, bookingCosts: 0 };
  const w = revenueWeights(b, settings);
  if (!w.has(month)) return { gross: 0, commission: 0, bookingCosts: 0 };
  return {
    gross: splitAmount(b.total_price, w).get(month) ?? 0,
    commission: splitAmount(b.commission_amount, w).get(month) ?? 0,
    bookingCosts: splitAmount(b.booking_costs, w).get(month) ?? 0,
  };
}

// ---------- double booking ----------

/** Existing Confirmed/Completed bookings for the same room whose dates overlap (check-out day = next check-in day is fine). */
export function findOverlaps(candidate: Pick<VillaRecord, "record_id" | "room_number" | "check_in" | "check_out" | "status">, records: VillaRecord[]): VillaRecord[] {
  if (candidate.status === "Cancelled") return [];
  return records.filter(
    (r) =>
      isBooking(r) &&
      occupiesRoom(r) &&
      r.record_id !== candidate.record_id &&
      r.room_number === candidate.room_number &&
      candidate.check_in < r.check_out &&
      r.check_in < candidate.check_out,
  );
}

// ---------- monthly profit ----------

export interface VillaMonth {
  month: MonthKey;
  days: number;
  gross: number;
  commission: number;
  bookingCosts: number;
  villaCosts: number;
  netProfit: number;
  bookedNights: number;
  occupancy: number | null; // overall
  roomOccupancy: { room: string; nights: number; occupancy: number | null }[];
  avgPricePerNight: number | null;
  bookings: number; // bookings with revenue counted in the month
  byPlatform: { platform: string; bookings: number; revenue: number }[];
  perRoom: RoomFigures[];
}

export interface RoomFigures {
  room: string;
  gross: number;
  commission: number;
  bookingCosts: number;
  ownCosts: number;
  sharedCosts: number;
  netProfit: number;
  /** Booked nights in the month (physical stays). */
  nights: number;
  /** Revenue of those nights (for the average price). */
  stayRevenue: number;
  avgPricePerNight: number | null;
}

export function villaMonth(month: MonthKey, records: VillaRecord[], settings: VillaSettings): VillaMonth {
  const bookings = records.filter(isBooking);
  const costs = records.filter((r) => isCost(r) && monthOf(r.date_entered) === month && countsInProfit(r));
  const rooms = settings.villa_rooms.map((r) => r.room_number);
  const days = daysInMonth(month).length;

  // money
  const shares = bookings.map((b) => ({ b, s: bookingShareForMonth(b, month, settings) }));
  const counted = shares.filter(({ b }) => countsAsRevenue(b) && revenueWeights(b, settings).has(month));
  const gross = sum(shares, (x) => x.s.gross);
  const commission = sum(shares, (x) => x.s.commission);
  const bookingCosts = sum(shares, (x) => x.s.bookingCosts);
  const villaCosts = sum(costs, (c) => c.cost_amount);

  // nights (physical stays only, always by night regardless of allocation setting)
  const stays = bookings.filter(occupiesRoom);
  const nightsIn = (b: VillaRecord) => nightsByMonth(b.check_in, b.check_out).get(month) ?? 0;
  const bookedNights = sum(stays, nightsIn);
  const stayRevenueOf = (b: VillaRecord) => splitAmount(b.total_price, nightsByMonth(b.check_in, b.check_out)).get(month) ?? 0;
  const stayRevenueThisMonth = sum(stays, stayRevenueOf);

  const roomOccupancy = rooms.map((room) => {
    const nights = sum(stays.filter((b) => b.room_number === room), nightsIn);
    return { room, nights, occupancy: ratio(nights, days) };
  });

  const platforms = Array.from(new Set([...settings.villa_platforms.map((p) => p.name), ...counted.map(({ b }) => b.platform)]));
  const byPlatform = platforms
    .map((platform) => {
      const rows = counted.filter(({ b }) => b.platform === platform);
      return { platform, bookings: rows.length, revenue: sum(rows, (x) => x.s.gross) };
    })
    .filter((p) => p.bookings > 0 || settings.villa_platforms.some((x) => x.name === p.platform));

  // per room: "All rooms" costs split evenly (whole rupees, remainder to the first rooms)
  const shared = sum(costs.filter((c) => c.cost_room === ALL_ROOMS || !c.cost_room), (c) => c.cost_amount);
  const sharedSplit = splitEvenly(shared, rooms);
  const perRoom = rooms.map((room) => {
    const mine = shares.filter(({ b }) => b.room_number === room);
    const g = sum(mine, (x) => x.s.gross);
    const c = sum(mine, (x) => x.s.commission);
    const bc = sum(mine, (x) => x.s.bookingCosts);
    const own = sum(costs.filter((x) => x.cost_room === room), (x) => x.cost_amount);
    const sh = sharedSplit.get(room) ?? 0;
    const roomStays = stays.filter((b) => b.room_number === room);
    const nights = sum(roomStays, nightsIn);
    const stayRevenue = sum(roomStays, stayRevenueOf);
    return {
      room, gross: g, commission: c, bookingCosts: bc, ownCosts: own, sharedCosts: sh, netProfit: g - c - bc - own - sh,
      nights, stayRevenue, avgPricePerNight: nights ? Math.round(stayRevenue / nights) : null,
    };
  });

  return {
    month,
    days,
    gross,
    commission,
    bookingCosts,
    villaCosts,
    netProfit: gross - commission - bookingCosts - villaCosts,
    bookedNights,
    occupancy: rooms.length ? ratio(bookedNights, rooms.length * days) : null,
    roomOccupancy,
    avgPricePerNight: bookedNights ? Math.round(stayRevenueThisMonth / bookedNights) : null,
    bookings: counted.length,
    byPlatform,
    perRoom,
  };
}

/** Split an amount evenly over keys in order; remainder rupees go to the first keys. */
export function splitEvenly(amount: number, keys: string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (!keys.length) return out;
  const base = Math.floor(amount / keys.length);
  let rem = amount - base * keys.length;
  for (const k of keys) {
    out.set(k, base + (rem > 0 ? 1 : 0));
    if (rem > 0) rem--;
  }
  return out;
}

export function villaTable(from: MonthKey, to: MonthKey, records: VillaRecord[], settings: VillaSettings): VillaMonth[] {
  return monthRange(from, to).map((m) => villaMonth(m, records, settings));
}

// ---------- dashboard helpers ----------

export function upcomingCheckIns(records: VillaRecord[], today: ISODate, days = 7): VillaRecord[] {
  const until = addDays(today, days);
  return records
    .filter((r) => isBooking(r) && r.status === "Confirmed" && r.check_in >= today && r.check_in <= until)
    .sort((a, b) => a.check_in.localeCompare(b.check_in) || a.room_number.localeCompare(b.room_number));
}

/** Bookings with money still to receive. */
export function pendingPayouts(records: VillaRecord[]): VillaRecord[] {
  return records.filter((r) => isBooking(r) && amountDue(r) > 0);
}

/** Per-room figures added up over several months (e.g. since opening), with a Total row. */
export function roomTotals(months: VillaMonth[], rooms: string[]): { rooms: RoomFigures[]; total: RoomFigures } {
  const add = (list: RoomFigures[], room: string): RoomFigures => {
    const s = (f: (r: RoomFigures) => number) => sum(list, f);
    const nights = s((r) => r.nights);
    const stayRevenue = s((r) => r.stayRevenue);
    return {
      room,
      gross: s((r) => r.gross), commission: s((r) => r.commission), bookingCosts: s((r) => r.bookingCosts),
      ownCosts: s((r) => r.ownCosts), sharedCosts: s((r) => r.sharedCosts), netProfit: s((r) => r.netProfit),
      nights, stayRevenue, avgPricePerNight: nights ? Math.round(stayRevenue / nights) : null,
    };
  };
  const per = rooms.map((room) => add(months.flatMap((m) => m.perRoom.filter((r) => r.room === room)), room));
  return { rooms: per, total: add(per, "Total") };
}

// ---------- recovery (earning back capital + costs) ----------

export interface RecoveryMonth {
  month: MonthKey;
  season: boolean;
  earned: number;
  costs: number;
  net: number;
  /** Still to recover at the end of the month. */
  remaining: number;
}

export interface VillaRecovery {
  capital: number;
  costs: number;
  /** Part of `costs` paid from Owner Bank / Owner Cash. */
  ownerPaidCosts: number;
  totalToRecover: number;
  earned: number;
  remaining: number;
  recoveredPct: number | null;
  seasonAvg: number | null;
  offSeasonAvg: number | null;
  seasonMonthsUsed: number;
  offMonthsUsed: number;
  /** Months from next month until recovered (null = can't estimate). */
  monthsToGo: number | null;
  seasonMonthsToGo: number | null;
  recoveredBy: MonthKey | null;
  rows: RecoveryMonth[];
}

export function isSeasonMonth(month: MonthKey, seasonMonths: number[]): boolean {
  return seasonMonths.includes(monthNumber(month));
}

export function villaRecovery(
  records: VillaRecord[],
  capital: CapitalContribution[],
  settings: VillaSettings & Pick<Settings, "opening_month" | "villa_season_months">,
  today: ISODate,
): VillaRecovery {
  const thisMonth = monthOf(today);
  const villaCapital = capital.filter((c) => c.business === "MO Villa" && c.date <= today);
  const capitalTotal = sum(villaCapital, (c) => c.amount);

  // From the earliest villa money (or the opening month) to this month.
  const firsts = [
    settings.opening_month,
    ...records.filter(isCost).map((r) => monthOf(r.date_entered)),
    ...records.filter(isBooking).map((r) => monthOf(r.check_in)),
  ].filter(Boolean);
  const from = firsts.reduce((a, b) => (b < a ? b : a), thisMonth);
  const months = from <= thisMonth ? villaTable(from, thisMonth, records, settings) : [];

  let remaining = capitalTotal;
  const rows: RecoveryMonth[] = months.map((m) => {
    const earned = m.gross - m.commission - m.bookingCosts;
    const net = earned - m.villaCosts;
    remaining -= net;
    return { month: m.month, season: isSeasonMonth(m.month, settings.villa_season_months), earned, costs: m.villaCosts, net, remaining };
  });

  const costs = sum(rows, (r) => r.costs);
  const earned = sum(rows, (r) => r.earned);
  const totalToRecover = capitalTotal + costs;
  const ownerPaidCosts = sum(
    records.filter((r) => isCost(r) && countsInProfit(r) && monthOf(r.date_entered) <= thisMonth && (r.paid_from === "Owner Bank" || r.paid_from === "Owner Cash")),
    (r) => r.cost_amount,
  );
  const left = totalToRecover - earned;

  // Pace from finished months (this month too when it's the only one).
  const finished = rows.filter((r) => r.month < thisMonth);
  const basis = finished.length ? finished : rows;
  const seasonRows = basis.filter((r) => r.season);
  const offRows = basis.filter((r) => !r.season);
  const avg = (list: RecoveryMonth[]) => (list.length ? Math.round(sum(list, (r) => r.net) / list.length) : null);
  const seasonAvg = avg(seasonRows);
  const offSeasonAvg = avg(offRows);

  let monthsToGo: number | null = null;
  let seasonMonthsToGo: number | null = null;
  let recoveredBy: MonthKey | null = null;
  if (left <= 0) {
    monthsToGo = 0;
    seasonMonthsToGo = 0;
    recoveredBy = rows.find((r) => r.remaining <= 0)?.month ?? thisMonth;
  } else if (seasonAvg !== null && seasonAvg > 0) {
    const seasonLen = settings.villa_season_months.length;
    const off = offSeasonAvg ?? 0;
    // Only estimate when a full year still earns money overall.
    if (seasonAvg * seasonLen + off * (12 - seasonLen) > 0) {
      let r = left;
      let m = thisMonth;
      let n = 0;
      let s = 0;
      while (r > 0 && n < 600) {
        m = addMonths(m, 1);
        n++;
        const season = isSeasonMonth(m, settings.villa_season_months);
        if (season) s++;
        r -= season ? seasonAvg : off;
      }
      if (r <= 0) {
        monthsToGo = n;
        seasonMonthsToGo = s;
        recoveredBy = m;
      }
    }
  }

  return {
    capital: capitalTotal,
    costs,
    ownerPaidCosts,
    totalToRecover,
    earned,
    remaining: left,
    recoveredPct: totalToRecover > 0 ? Math.min(1, Math.max(0, earned / totalToRecover)) : null,
    seasonAvg,
    offSeasonAvg,
    seasonMonthsUsed: seasonRows.length,
    offMonthsUsed: offRows.length,
    monthsToGo,
    seasonMonthsToGo,
    recoveredBy,
    rows,
  };
}

// ---------- calendar ----------

export interface CalendarCell {
  /** Day index in the month where this cell starts. */
  start: number;
  span: number;
  booking: VillaRecord | null;
  /** The booking started before this month. */
  continues: boolean;
}

/** One row per room: free days are single cells, a stay is one cell spanning its nights in the month. */
export function calendarRows(month: MonthKey, records: VillaRecord[], rooms: string[]): { room: string; cells: CalendarCell[] }[] {
  return calendarGrid(month, records, rooms).map(({ room, cells }) => {
    const out: CalendarCell[] = [];
    for (let i = 0; i < cells.length; i++) {
      const b = cells[i];
      const last = out[out.length - 1];
      if (b && last?.booking?.record_id === b.record_id) last.span++;
      else out.push({ start: i, span: 1, booking: b, continues: Boolean(b && i === 0 && b.check_in < `${month}-01`) });
    }
    return { room, cells: out };
  });
}

/** Which room each night of a month is booked by (for the calendar). */
export function calendarGrid(month: MonthKey, records: VillaRecord[], rooms: string[]) {
  const days = daysInMonth(month);
  const stays = records.filter((r) => isBooking(r) && occupiesRoom(r));
  return rooms.map((room) => ({
    room,
    cells: days.map((d) => stays.find((b) => b.room_number === room && b.check_in <= d && d < b.check_out) ?? null),
  }));
}
