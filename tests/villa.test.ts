import { describe, expect, it } from "vitest";
import {
  bookingShareForMonth, calendarGrid, commissionFor, countsAsRevenue, defaultCommissionPct, findOverlaps, netPayoutFor,
  nightsBetween, nightsByMonth, pendingPayouts, splitAmount, upcomingCheckIns, villaMonth,
  amountDue, calendarRows, commissionDue, expectedIn, paidAmount, paymentState, roomTotals, stillOpen, villaRecovery,
} from "../src/lib/calc/villa";
import { accountBalance } from "../src/lib/calc/cash";
import { combinedMonth, profitPartners } from "../src/lib/calc/combined";
import { parseCategoryList, parsePlatforms, parseSeasonMonths } from "../src/lib/settings";
import { order, settings } from "./fixtures";
import type { VillaRecord } from "../src/lib/types";

const blank: VillaRecord = {
  record_id: "", record_type: "Booking", date_entered: "2027-01-01", room_number: "Tide", room_type: "Double", platform: "Airbnb",
  booking_ref: "", guest_name: "", guests: 2, check_in: "", check_out: "", nights: 0, status: "Confirmed", total_price: 0,
  commission_pct: 15, commission_amount: 0, booking_costs: 0, net_payout: 0, payout_status: "Pending", payout_date: "",
  received_to: "", cost_category: "", cost_description: "", cost_amount: 0, cost_room: "", paid_from: "", notes: "",
  breakfast: false, commission_later: false, amount_paid: 0, closed_platforms: "", booking_id: "",
};
let n = 0;
const bk = (p: Partial<VillaRecord>): VillaRecord => {
  const b = { ...blank, record_id: `B${++n}`, ...p };
  b.nights = nightsBetween(b.check_in, b.check_out);
  if (p.commission_amount === undefined) b.commission_amount = commissionFor(b.total_price, b.commission_pct);
  b.net_payout = netPayoutFor(b.total_price, b.commission_amount, b.booking_costs);
  return b;
};
const cost = (p: Partial<VillaRecord>): VillaRecord => ({ ...blank, record_id: `C${++n}`, record_type: "Cost", status: "", payout_status: "", ...p });

describe("nights", () => {
  it("nights = check_out − check_in", () => {
    expect(nightsBetween("2027-01-30", "2027-02-02")).toBe(3);
    expect(nightsBetween("2027-12-31", "2028-01-01")).toBe(1);
    expect(nightsBetween("2028-02-28", "2028-03-01")).toBe(2); // leap year
  });
  it("is 0 for missing or reversed dates", () => {
    expect(nightsBetween("", "2027-01-02")).toBe(0);
    expect(nightsBetween("2027-01-05", "2027-01-02")).toBe(0);
  });
});

describe("commission and net payout", () => {
  it("commission = total × pct, rounded to whole rupees", () => {
    expect(commissionFor(75_000, 15)).toBe(11_250);
    expect(commissionFor(33_333, 15)).toBe(5_000);
    expect(commissionFor(10_000, 0)).toBe(0);
  });
  it("net payout = total − commission − booking costs", () => {
    expect(netPayoutFor(75_000, 11_250, 2_500)).toBe(61_250);
  });
  it("default commission % comes from the platform in Settings", () => {
    const s = settings({ villa_platforms: "Airbnb:15,Booking.com:17.5,Direct:0" });
    expect(defaultCommissionPct("Booking.com", s)).toBe(17.5);
    expect(defaultCommissionPct("Unknown", s)).toBe(0);
  });
});

describe("splitting a stay across months", () => {
  it("30 Jan → 2 Feb counts 2 nights in January and 1 in February", () => {
    expect([...nightsByMonth("2027-01-30", "2027-02-02").entries()]).toEqual([["2027-01", 2], ["2027-02", 1]]);
  });
  it("splits amounts by nights in whole rupees that add up exactly", () => {
    const parts = splitAmount(100_000, nightsByMonth("2027-01-30", "2027-02-02"));
    expect([...parts.entries()]).toEqual([["2027-01", 66_667], ["2027-02", 33_333]]);
    expect(splitAmount(1, new Map([["a", 1], ["b", 1], ["c", 1]])).get("a")).toBe(1);
  });
  it("allocates gross, commission and booking costs by nights", () => {
    const b = bk({ check_in: "2027-01-30", check_out: "2027-02-02", total_price: 30_000, booking_costs: 3_000 });
    const s = settings();
    expect(bookingShareForMonth(b, "2027-01", s)).toEqual({ gross: 20_000, commission: 3_000, bookingCosts: 2_000 });
    expect(bookingShareForMonth(b, "2027-02", s)).toEqual({ gross: 10_000, commission: 1_500, bookingCosts: 1_000 });
  });
  it("check_in setting counts everything in the check-in month", () => {
    const b = bk({ check_in: "2027-01-30", check_out: "2027-02-02", total_price: 30_000 });
    const s = settings({ villa_allocation: "check_in" });
    expect(bookingShareForMonth(b, "2027-01", s).gross).toBe(30_000);
    expect(bookingShareForMonth(b, "2027-02", s).gross).toBe(0);
  });
});

describe("cancelled bookings", () => {
  it("are excluded from revenue unless a cancellation fee is entered", () => {
    expect(countsAsRevenue(bk({ status: "Cancelled", total_price: 0 }))).toBe(false);
    expect(countsAsRevenue(bk({ status: "Cancelled", total_price: 5_000 }))).toBe(true);
  });
  it("count the fee in the check-in month and occupy no nights", () => {
    const b = bk({ status: "Cancelled", check_in: "2027-01-30", check_out: "2027-02-05", total_price: 5_000, commission_pct: 0 });
    const m = villaMonth("2027-01", [b], settings());
    expect(m.gross).toBe(5_000);
    expect(m.bookedNights).toBe(0);
    expect(villaMonth("2027-02", [b], settings()).gross).toBe(0);
  });
});

describe("double-booking check", () => {
  const existing = bk({ record_id: "X", room_number: "Breeze", check_in: "2027-01-10", check_out: "2027-01-15", status: "Confirmed" });
  const others = [existing, bk({ room_number: "Breeze", check_in: "2027-01-20", check_out: "2027-01-22", status: "Cancelled" })];
  const c = (p: Partial<VillaRecord>) => ({ record_id: "NEW", room_number: "Breeze", check_in: "2027-01-12", check_out: "2027-01-14", status: "Confirmed" as const, ...p });

  it("blocks an overlapping stay in the same room", () => expect(findOverlaps(c({}), others)).toHaveLength(1));
  it("allows check-in on the day of the previous check-out", () => expect(findOverlaps(c({ check_in: "2027-01-15", check_out: "2027-01-17" }), others)).toHaveLength(0));
  it("allows the same dates in another room", () => expect(findOverlaps(c({ room_number: "Nest" }), others)).toHaveLength(0));
  it("ignores cancelled bookings", () => expect(findOverlaps(c({ check_in: "2027-01-20", check_out: "2027-01-21" }), others)).toHaveLength(0));
  it("does not clash with itself when editing", () => expect(findOverlaps(c({ record_id: "X" }), others)).toHaveLength(0));
  it("a cancelled candidate never clashes", () => expect(findOverlaps(c({ status: "Cancelled" }), others)).toHaveLength(0));
  it("blocks a stay that surrounds an existing one", () => expect(findOverlaps(c({ check_in: "2027-01-09", check_out: "2027-01-16" }), others)).toHaveLength(1));
});

describe("monthly villa profit", () => {
  const s = settings();
  const records = [
    bk({ room_number: "Tide", platform: "Airbnb", check_in: "2027-01-01", check_out: "2027-01-11", total_price: 100_000, booking_costs: 4_000 }), // 10 nights
    bk({ room_number: "Breeze", platform: "Direct", commission_pct: 0, check_in: "2027-01-30", check_out: "2027-02-02", total_price: 30_000 }), // 2 Jan + 1 Feb
    bk({ room_number: "Nest", platform: "Booking.com", check_in: "2027-01-05", check_out: "2027-01-07", total_price: 20_000, commission_amount: 3_500 }), // overridden commission
    cost({ date_entered: "2027-01-03", cost_amount: 8_000, cost_room: "All rooms" }),
    cost({ date_entered: "2027-01-09", cost_amount: 1_500, cost_room: "Tide" }),
    cost({ date_entered: "2027-02-01", cost_amount: 9_999, cost_room: "Tide" }), // other month
  ];
  const m = villaMonth("2027-01", records, s);

  it("gross, commission, booking costs, villa costs and net profit", () => {
    expect(m.gross).toBe(100_000 + 20_000 + 20_000);
    expect(m.commission).toBe(15_000 + 0 + 3_500);
    expect(m.bookingCosts).toBe(4_000);
    expect(m.villaCosts).toBe(9_500);
    expect(m.netProfit).toBe(140_000 - 18_500 - 4_000 - 9_500);
  });
  it("booked nights, occupancy per room and overall", () => {
    expect(m.bookedNights).toBe(14);
    expect(m.occupancy).toBeCloseTo(14 / (4 * 31));
    expect(m.roomOccupancy.map((r) => r.nights)).toEqual([10, 2, 2, 0]);
    expect(m.roomOccupancy[0].occupancy).toBeCloseTo(10 / 31);
  });
  it("average price per night", () => expect(m.avgPricePerNight).toBe(Math.round(140_000 / 14)));
  it("bookings and revenue by platform", () => {
    const by = Object.fromEntries(m.byPlatform.map((p) => [p.platform, [p.bookings, p.revenue]]));
    expect(by["Airbnb"]).toEqual([1, 100_000]);
    expect(by["Direct"]).toEqual([1, 20_000]);
    expect(by["Booking.com"]).toEqual([1, 20_000]);
    expect(by["Agoda"]).toEqual([0, 0]);
  });
  it("net profit per room splits 'All rooms' costs evenly and adds up to the total", () => {
    const r1 = m.perRoom.find((r) => r.room === "Tide")!;
    expect(r1.sharedCosts).toBe(2_000);
    expect(r1.ownCosts).toBe(1_500);
    expect(r1.netProfit).toBe(100_000 - 15_000 - 4_000 - 1_500 - 2_000);
    expect(m.perRoom.reduce((t, r) => t + r.netProfit, 0)).toBe(m.netProfit);
  });
  it("months with no activity have no occupancy and no average price", () => {
    const empty = villaMonth("2027-07", records, s);
    expect(empty.netProfit).toBe(0);
    expect(empty.occupancy).toBe(0);
    expect(empty.avgPricePerNight).toBeNull();
  });
});

describe("links to the rest of the app", () => {
  const recs = [
    bk({ check_in: "2027-01-01", check_out: "2027-01-03", total_price: 20_000, payout_status: "Received", received_to: "Bank", payout_date: "2027-01-05" }), // net 17,000
    bk({ room_number: "Breeze", check_in: "2027-01-02", check_out: "2027-01-04", total_price: 10_000, payout_status: "Pending" }),
    cost({ date_entered: "2027-01-02", cost_amount: 3_000, paid_from: "Petty cash", cost_room: "All rooms" }),
  ];
  const cash = { orders: [], dailyCosts: [], fixedCosts: [], fixedPayments: [], movements: [], villa: recs };

  it("received payouts add to the receiving account; pending ones don't", () => {
    expect(accountBalance("Bank", cash).villaPayouts).toBe(17_000);
    expect(accountBalance("Bank", cash, "2027-01-04").villaPayouts).toBe(0);
  });
  it("villa costs reduce the account they were paid from", () => {
    expect(accountBalance("Petty cash", cash).villaCostsPaid).toBe(3_000);
    expect(accountBalance("Petty cash", cash).balance).toBe(-3_000);
  });
  it("pending payouts list", () => expect(pendingPayouts(recs).map((r) => r.total_price)).toEqual([10_000]));
  it("upcoming check-ins within 7 days", () => {
    expect(upcomingCheckIns(recs, "2026-12-28").length).toBe(2);
    expect(upcomingCheckIns(recs, "2027-01-02").length).toBe(1);
  });
  it("combined profit = cafe + villa; villa profit goes to villa_partners (default Rajitha 100%)", () => {
    const s = settings();
    const c = combinedMonth("2027-01", { orders: [], dailyCosts: [], fixedCosts: [], fixedPayments: [], settings: s }, recs);
    expect(c.cafe).toBe(0);
    expect(c.villa).toBe(30_000 - 4_500 - 3_000);
    expect(c.total).toBe(c.villa);
    expect(c.shares.map((x) => [x.name, x.amount])).toEqual([["Rajitha", 22_500], ["Janith", 0]]);
  });
  it("each partner gets cafe % of cafe profit + villa % of villa profit, summing to the total", () => {
    const s = settings({ villa_partners: "Rajitha:70,Janith:30" });
    const cafe = { orders: [order({ date: "2027-01-05", qty: 1, unit_price: 10_001, unit_cost: 0 })], dailyCosts: [], fixedCosts: [], fixedPayments: [], settings: s };
    const c = combinedMonth("2027-01", cafe, recs);
    expect(c.cafe).toBe(10_001);
    const r = c.shares.find((x) => x.name === "Rajitha")!, j = c.shares.find((x) => x.name === "Janith")!;
    expect(r.villa + j.villa).toBe(22_500);
    expect([r.villa, j.villa]).toEqual([15_750, 6_750]);
    expect(r.cafe + j.cafe).toBe(10_001);
    expect(r.amount + j.amount).toBe(c.total);
  });
  it("a villa-only partner is listed after the cafe partners", () => {
    const s = settings({ villa_partners: "Rajitha:60,Amal:40" });
    expect(profitPartners(s).map((p) => [p.name, p.cafePct, p.villaPct])).toEqual([["Rajitha", 50, 60], ["Janith", 50, 0], ["Amal", 0, 40]]);
  });
  it("villa_partners must total 100%", () => {
    expect(() => settings({ villa_partners: "Rajitha:90" })).toThrow(/villa_partners/);
  });
  it("calendar grid marks booked nights only", () => {
    const g = calendarGrid("2027-01", recs, ["Tide", "Breeze"]);
    expect(g[0].cells.slice(0, 3).map((c) => c?.room_number ?? null)).toEqual(["Tide", "Tide", null]);
  });
});

describe("settings parsing", () => {
  it("keeps commas inside parentheses in category names", () => {
    expect(parseCategoryList("Bedsheets & linen,Toiletries (shampoo, soap),Other")).toEqual(["Bedsheets & linen", "Toiletries (shampoo, soap)", "Other"]);
  });
  it("reads the 4 rooms", () => expect(settings().villa_rooms.map((r) => r.room_number)).toEqual(["Tide", "Breeze", "Nest", "Cove"]));
});

describe("booking payments", () => {
  const b = bk({ check_in: "2027-01-01", check_out: "2027-01-03", total_price: 40_000, booking_costs: 2_000 }); // 15% → 6,000
  it("to receive = net payout when the platform keeps the commission", () => expect(expectedIn(b)).toBe(32_000));
  it("to receive adds the commission back when it is paid later", () => expect(expectedIn({ ...b, commission_later: true })).toBe(38_000));
  it("not paid / part paid / paid", () => {
    expect(paymentState(b)).toBe("Not paid");
    expect(paymentState({ ...b, amount_paid: 10_000 })).toBe("Part paid");
    expect(amountDue({ ...b, amount_paid: 10_000 })).toBe(22_000);
    expect(paymentState({ ...b, amount_paid: 32_000, payout_status: "Received" })).toBe("Paid");
  });
  it("old rows marked Received without an amount count as fully paid", () => {
    expect(paidAmount({ ...b, payout_status: "Received" })).toBe(32_000);
    expect(amountDue({ ...b, payout_status: "Received" })).toBe(0);
  });
  it("part payments reach the account they went to; owner accounts are not business balances", () => {
    const recs = [{ ...b, amount_paid: 10_000, received_to: "Villa petty cash" as const, payout_date: "2027-01-02" }, { ...b, record_id: "Z", amount_paid: 5_000, received_to: "Owner Bank" as const }];
    const cash = { orders: [], dailyCosts: [], fixedCosts: [], fixedPayments: [], movements: [], villa: recs };
    expect(accountBalance("Villa petty cash", cash).villaPayouts).toBe(10_000);
    expect(accountBalance("Bank", cash).villaPayouts).toBe(0);
  });
});

describe("commission paid later", () => {
  const b = bk({ record_id: "BL", platform: "Booking.com", commission_later: true, check_in: "2027-01-01", check_out: "2027-01-03", total_price: 40_000 });
  const paid = cost({ cost_category: "Platform commission", cost_amount: 6_000, booking_id: "BL", date_entered: "2027-02-03", paid_from: "Villa petty cash" });
  it("is due until a Platform commission cost is linked to the booking", () => {
    expect(commissionDue(b, [b])).toBe(6_000);
    expect(commissionDue(b, [b, paid])).toBe(0);
  });
  it("is not counted twice in profit but does reduce the account", () => {
    const m = villaMonth("2027-02", [b, paid], settings());
    expect(m.villaCosts).toBe(0);
    expect(villaMonth("2027-01", [b, paid], settings()).commission).toBe(6_000);
    expect(accountBalance("Villa petty cash", { orders: [], dailyCosts: [], fixedCosts: [], fixedPayments: [], movements: [], villa: [paid] }).villaCostsPaid).toBe(6_000);
  });
  it("Settings: Name:pct:later marks the platform", () => {
    expect(parsePlatforms("Airbnb:15,Booking.com:15:later")).toEqual([
      { name: "Airbnb", commission_pct: 15, commission_later: false },
      { name: "Booking.com", commission_pct: 15, commission_later: true },
    ]);
    expect(settings().villa_platforms.find((p) => p.name === "Booking.com")?.commission_later).toBe(true);
  });
});

describe("closing other platforms", () => {
  const s = settings();
  const b = bk({ platform: "Airbnb", status: "Confirmed", check_in: "2027-01-10", check_out: "2027-01-12" });
  it("lists the other platforms (not Direct / Other) until ticked", () => {
    expect(stillOpen(b, s, "2027-01-01")).toEqual(["Booking.com", "Agoda"]);
    expect(stillOpen({ ...b, closed_platforms: "Agoda" }, s, "2027-01-01")).toEqual(["Booking.com"]);
    expect(stillOpen({ ...b, closed_platforms: "Booking.com,Agoda" }, s, "2027-01-01")).toEqual([]);
  });
  it("is not asked after check-out or for cancelled bookings", () => {
    expect(stillOpen(b, s, "2027-01-13")).toEqual([]);
    expect(stillOpen({ ...b, status: "Cancelled" }, s, "2027-01-01")).toEqual([]);
  });
});

describe("per room average price and net profit", () => {
  const s = settings();
  const recs = [
    bk({ room_number: "Tide", check_in: "2027-01-01", check_out: "2027-01-05", total_price: 40_000 }), // 4 nights → 10,000
    bk({ room_number: "Tide", check_in: "2027-02-01", check_out: "2027-02-03", total_price: 30_000 }), // 2 nights → 15,000
    bk({ room_number: "Breeze", check_in: "2027-01-10", check_out: "2027-01-12", total_price: 16_000 }), // 2 nights → 8,000
  ];
  const months = [villaMonth("2027-01", recs, s), villaMonth("2027-02", recs, s)];
  it("average per room for a month", () => {
    expect(months[0].perRoom.find((r) => r.room === "Tide")!.avgPricePerNight).toBe(10_000);
    expect(months[0].perRoom.find((r) => r.room === "Nest")!.avgPricePerNight).toBeNull();
  });
  it("totals over months, per room and all rooms", () => {
    const t = roomTotals(months, ["Tide", "Breeze", "Nest", "Cove"]);
    expect(t.rooms[0].nights).toBe(6);
    expect(t.rooms[0].avgPricePerNight).toBe(Math.round(70_000 / 6));
    expect(t.total.avgPricePerNight).toBe(Math.round(86_000 / 8));
    expect(t.total.netProfit).toBe(months[0].netProfit + months[1].netProfit);
  });
});

describe("recovery (re-earn)", () => {
  const s = settings({ opening_month: "2027-01", villa_season_months: "12,1,2,3,4,5" });
  const cap = [{ capital_id: "C", date: "2026-12-01", partner: "Rajitha", business: "MO Villa" as const, description: "", amount: 1_000_000, paid_into: "Paid directly" as const, notes: "" }];
  const recs = [
    bk({ commission_pct: 0, check_in: "2027-01-01", check_out: "2027-01-11", total_price: 100_000 }),
    bk({ commission_pct: 0, check_in: "2027-02-01", check_out: "2027-02-11", total_price: 100_000 }),
    cost({ date_entered: "2027-01-15", cost_amount: 20_000, paid_from: "Owner Bank" }),
    cost({ date_entered: "2027-02-15", cost_amount: 20_000 }),
  ];
  const r = villaRecovery(recs, cap, s, "2027-03-10");
  it("total to recover = capital + costs; still to recover = total − earned", () => {
    expect(r.capital).toBe(1_000_000);
    expect(r.costs).toBe(40_000);
    expect(r.ownerPaidCosts).toBe(20_000);
    expect(r.earned).toBe(200_000);
    expect(r.remaining).toBe(840_000);
    expect(r.rows.at(-1)!.remaining).toBe(840_000);
  });
  it("estimates from the season pattern (finished months only)", () => {
    // Jan & Feb finished: 80,000 net each; March (this month) is not used yet.
    expect(r.seasonAvg).toBe(80_000);
    expect(r.offSeasonAvg).toBeNull();
    // 840,000 / 80,000 = 10.5 → 11 season months: Apr–May 2027 (2), Dec 2027–May 2028 (6), Dec 2028–Feb 2029 (3).
    expect(r.seasonMonthsToGo).toBe(11);
    expect(r.recoveredBy).toBe("2029-02");
  });
  it("season months come from Settings", () => {
    expect(parseSeasonMonths("12,1,2")).toEqual([12, 1, 2]);
    expect(() => parseSeasonMonths("13")).toThrow(/villa_season_months/);
  });
});

describe("calendar rows", () => {
  it("joins a stay into one cell spanning its nights", () => {
    const recs = [bk({ check_in: "2027-01-02", check_out: "2027-01-05", total_price: 1 })];
    const row = calendarRows("2027-01", recs, ["Tide"])[0];
    expect(row.cells.slice(0, 3).map((c) => [c.start, c.span, Boolean(c.booking)])).toEqual([[0, 1, false], [1, 3, true], [4, 1, false]]);
    expect(row.cells.reduce((t, c) => t + c.span, 0)).toBe(31);
  });
  it("marks a stay that started in the previous month", () => {
    const recs = [bk({ check_in: "2026-12-30", check_out: "2027-01-02", total_price: 1 })];
    expect(calendarRows("2027-01", recs, ["Tide"])[0].cells[0]).toMatchObject({ start: 0, span: 1, continues: true });
  });
});
