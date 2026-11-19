// Sample MO Villa bookings and costs for the local in-memory demo mode only. Never written to the Google Sheet.
import type { VillaRecord } from "../types";
import { commissionFor, netPayoutFor, nightsBetween } from "../calc/villa";

const blank: VillaRecord = {
  record_id: "", record_type: "Booking", date_entered: "", room_number: "", room_type: "Double", platform: "", booking_ref: "",
  guest_name: "", guests: 2, check_in: "", check_out: "", nights: 0, status: "Completed", total_price: 0, commission_pct: 0,
  commission_amount: 0, booking_costs: 0, net_payout: 0, payout_status: "Received", payout_date: "", received_to: "Bank",
  cost_category: "", cost_description: "", cost_amount: 0, cost_room: "", paid_from: "", notes: "",
  breakfast: false, commission_later: false, amount_paid: 0, closed_platforms: "", booking_id: "",
};

const PCT: Record<string, number> = { Airbnb: 15, "Booking.com": 15, Agoda: 18, Direct: 0, Other: 0 };

function booking(
  id: string, room: string, platform: string, guest: string, check_in: string, check_out: string, total: number,
  extra: Partial<VillaRecord> = {},
): VillaRecord {
  const commission_pct = extra.commission_pct ?? PCT[platform] ?? 0;
  const commission_amount = extra.commission_amount ?? commissionFor(total, commission_pct);
  const booking_costs = extra.booking_costs ?? 2500;
  return {
    ...blank,
    record_id: id, date_entered: "2026-11-20", room_number: room, platform, booking_ref: `${platform.slice(0, 2).toUpperCase()}-${id}`,
    guest_name: guest, check_in, check_out, nights: nightsBetween(check_in, check_out), total_price: total,
    commission_pct, commission_amount, booking_costs, net_payout: netPayoutFor(total, commission_amount, booking_costs),
    payout_date: check_out, received_to: platform === "Direct" ? "Petty cash" : "Bank",
    commission_later: platform === "Booking.com",
    ...extra,
  };
}

function cost(id: string, date: string, category: string, description: string, amount: number, room: string, paid_from: "Bank" | "Petty cash" | "Owner Bank"): VillaRecord {
  return { ...blank, record_id: id, record_type: "Cost", date_entered: date, status: "", payout_status: "", received_to: "", guests: 0,
    cost_category: category, cost_description: description, cost_amount: amount, cost_room: room, paid_from };
}

export function buildVillaSample(): VillaRecord[] {
  return [
    booking("VB-01", "Tide", "Airbnb", "Emma W.", "2026-12-01", "2026-12-06", 75_000),
    booking("VB-02", "Breeze", "Booking.com", "Lukas M.", "2026-12-03", "2026-12-10", 98_000),
    booking("VB-03", "Nest", "Direct", "Nimal P.", "2026-12-12", "2026-12-15", 39_000, { booking_costs: 1500, breakfast: true }),
    booking("VB-04", "Cove", "Agoda", "Sofia R.", "2026-12-20", "2026-12-27", 112_000),
    booking("VB-05", "Tide", "Airbnb", "Tom H.", "2026-12-28", "2027-01-04", 119_000), // crosses into January
    booking("VB-06", "Breeze", "Booking.com", "Anna K.", "2026-12-30", "2027-01-02", 45_000), // 2 nights Dec, 1 Jan
    booking("VB-07", "Nest", "Airbnb", "James L.", "2027-01-05", "2027-01-12", 98_000),
    booking("VB-08", "Cove", "Direct", "Kasun D.", "2027-01-08", "2027-01-10", 30_000, { booking_costs: 1000 }),
    booking("VB-09", "Breeze", "Agoda", "Marie C.", "2027-01-14", "2027-01-19", 70_000, { status: "Cancelled", total_price: 15_000, commission_amount: 2_700, booking_costs: 0, net_payout: 12_300, notes: "Cancellation fee" }),
    booking("VB-10", "Tide", "Booking.com", "Oliver S.", "2027-01-18", "2027-01-24", 90_000, { status: "Confirmed", payout_status: "Pending", payout_date: "", received_to: "", breakfast: true, closed_platforms: "Airbnb" }),
    booking("VB-11", "Breeze", "Airbnb", "Chen Y.", "2027-01-21", "2027-01-25", 60_000, { status: "Confirmed", payout_status: "Pending", payout_date: "", received_to: "" }),
    booking("VB-12", "Cove", "Direct", "Ravi S.", "2027-01-23", "2027-01-27", 52_000, { status: "Confirmed", payout_status: "Pending", amount_paid: 20_000, payout_date: "2027-01-10", received_to: "Owner Bank", notes: "Deposit paid" }),
    cost("VC-01", "2026-12-02", "Bedsheets & linen", "New sheet sets x8", 48_000, "All rooms", "Bank"),
    cost("VC-02", "2026-12-05", "Toiletries (shampoo, soap)", "Monthly stock", 12_500, "All rooms", "Petty cash"),
    cost("VC-03", "2026-12-18", "Repairs & maintenance", "AC service", 9_500, "Nest", "Petty cash"),
    cost("VC-04", "2026-12-31", "Utilities", "Electricity – villa", 22_000, "All rooms", "Bank"),
    cost("VC-05", "2027-01-06", "Cleaning supplies", "Detergent, mops", 6_800, "All rooms", "Petty cash"),
    cost("VC-06", "2027-01-15", "Repairs & maintenance", "Shower mixer", 14_000, "Breeze", "Owner Bank"),
    { ...cost("VC-07", "2027-01-05", "Platform commission", "Booking.com commission · Lukas M. · 2026-12-03", 14_700, "Breeze", "Owner Bank"), booking_id: "VB-02" },
  ];
}
