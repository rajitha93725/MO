import type { ISODate, MonthKey, Settings, VillaRecord } from "../types";
import { ALL_ROOMS } from "../types";
import { addDays, daysBetween, daysInMonth, monthOf, monthRange } from "./dates";
import { ratio, sum } from "./money";

type VillaSettings = Pick<Settings, "villa_rooms" | "villa_platforms" | "villa_allocation">;

export const VILLA_FORMULAS = {
  nights: "Nights = check_out − check_in",
  commission: "Commission = total_price × commission_pct (can be overridden per booking)",
  netPayout: "Net payout = total_price − commission_amount − booking_costs",
  gross: "Gross bookings = sum of total_price (Cancelled bookings only count when a cancellation fee is entered in total_price)",
  villaCosts: "Villa costs = sum of cost_amount for Cost rows dated in the month",
  netProfit: "Villa net profit = Gross bookings − Commission − Booking costs − Villa costs",
  occupancy: "Occupancy = booked nights ÷ (rooms × days in month). Cancelled bookings don't occupy nights",
  avgRate: "Average price per night = revenue of the nights stayed in the month ÷ booked nights",
  allocation:
    "Settings: villa_allocation = nights → revenue, commission and booking costs are split across months by nights stayed; check_in → all counted in the check-in month",
  perRoom: "Room net profit = room's bookings net − room's own costs − an equal share of \"All rooms\" costs",
  payouts: "Received payouts add net_payout to the received_to account on payout_date (or check-out date when blank)",
} as const;

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
  perRoom: { room: string; gross: number; commission: number; bookingCosts: number; ownCosts: number; sharedCosts: number; netProfit: number }[];
}

export function villaMonth(month: MonthKey, records: VillaRecord[], settings: VillaSettings): VillaMonth {
  const bookings = records.filter(isBooking);
  const costs = records.filter((r) => isCost(r) && monthOf(r.date_entered) === month);
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
  const stayRevenueThisMonth = sum(stays, (b) => splitAmount(b.total_price, nightsByMonth(b.check_in, b.check_out)).get(month) ?? 0);

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
    return { room, gross: g, commission: c, bookingCosts: bc, ownCosts: own, sharedCosts: sh, netProfit: g - c - bc - own - sh };
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

export function pendingPayouts(records: VillaRecord[]): VillaRecord[] {
  return records.filter((r) => isBooking(r) && r.payout_status !== "Received" && countsAsRevenue(r) && r.net_payout > 0);
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
