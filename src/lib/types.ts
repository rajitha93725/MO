// Domain types. These are storage-agnostic: the Google Sheets store and any
// future store (Supabase / Firebase) map their rows to and from these shapes.

export type Meal = "Breakfast" | "Lunch" | "Dinner";
export const MEALS: Meal[] = ["Breakfast", "Lunch", "Dinner"];

export type PaymentMethod = "Cash" | "Card" | "Bank transfer";
export const PAYMENT_METHODS: PaymentMethod[] = ["Cash", "Card", "Bank transfer"];

export type Account = "Petty cash" | "Bank";
export const ACCOUNTS: Account[] = ["Petty cash", "Bank"];

export type PaidBy = "Business" | "Rajitha" | "Janith";
export const PAID_BY: PaidBy[] = ["Business", "Rajitha", "Janith"];

export type Role = "partner" | "staff";

/** YYYY-MM-DD */
export type ISODate = string;
/** YYYY-MM */
export type MonthKey = string;

export interface MenuItem {
  item_id: string;
  category: string; // Breakfast / All day dining / Drinks
  sub_category: string;
  item_name: string;
  unit_cost: number;
  selling_price: number;
  active: boolean;
  /** Shown on the menu page (optional). */
  description: string;
}

/** A menu category and the letter used for its item IDs (Settings: menu_categories). */
export interface MenuCategory {
  name: string;
  prefix: string;
}

export interface PriceHistory {
  history_id: string;
  item_id: string;
  effective_date: ISODate;
  old_cost: number;
  old_price: number;
  new_cost: number;
  new_price: number;
  changed_by: string;
}

/** One row per order line. Lines of the same order share order_id. */
export interface OrderLine {
  line_id: string;
  order_id: string;
  date: ISODate;
  time: string; // HH:mm
  meal: Meal;
  item_id: string;
  item_name: string;
  qty: number;
  unit_price: number; // snapshot at save time
  line_total: number;
  unit_cost: number; // snapshot at save time
  line_cost: number;
  payment_method: PaymentMethod;
  notes: string;
  entered_by: string;
}

export interface DailyCost {
  cost_id: string;
  date: ISODate;
  category: string;
  description: string;
  amount: number;
  paid_from: Account;
  paid_by: PaidBy;
  notes: string;
  entered_by: string;
}

export type Frequency = "Monthly" | "One-time";

export interface FixedCost {
  fixed_id: string;
  name: string;
  amount: number;
  frequency: Frequency;
  start_month: MonthKey; // Monthly
  end_month: MonthKey; // Monthly, optional ("" = open-ended)
  month_paid: MonthKey; // One-time
  paid_from: Account;
  notes: string;
}

/** Actual payment of a monthly fixed cost for one month (planned vs actual). */
export interface FixedPayment {
  payment_id: string;
  fixed_id: string;
  month: MonthKey;
  amount: number;
  paid_date: ISODate;
  paid_from: Account;
  notes: string;
}

export type MovementType =
  | "Opening balance"
  | "Top-up"
  | "Withdrawal"
  | "Transfer petty→bank"
  | "Transfer bank→petty"
  | "Cash sales deposit";

export const MOVEMENT_TYPES: MovementType[] = [
  "Opening balance",
  "Top-up",
  "Withdrawal",
  "Transfer petty→bank",
  "Transfer bank→petty",
  "Cash sales deposit",
];

export const MOVED_BY = ["Rajitha", "Janith", "Staff"] as const;
export type MovedBy = (typeof MOVED_BY)[number];

export interface CashMovement {
  movement_id: string;
  date: ISODate;
  account: Account; // used by Opening balance / Top-up / Withdrawal
  type: MovementType;
  amount: number;
  notes: string;
  moved_by: MovedBy | ""; // who physically moved the money
}

// ---------------- Partner capital (opening budget) ----------------

export const CAPITAL_BUSINESSES = ["MO Cafe", "MO Villa", "Both"] as const;
export type CapitalBusiness = (typeof CAPITAL_BUSINESSES)[number];
export const CAPITAL_PAID_INTO = ["Bank", "Petty cash", "Paid directly"] as const;
export type CapitalPaidInto = (typeof CAPITAL_PAID_INTO)[number];

/** Money a partner put into the business. Tracked only: it does not change the profit split. */
export interface CapitalContribution {
  capital_id: string;
  date: ISODate;
  partner: string; // a partner name from Settings
  business: CapitalBusiness;
  description: string;
  amount: number;
  paid_into: CapitalPaidInto; // Bank / Petty cash raise that balance; Paid directly (to a supplier) does not
  notes: string;
}

export type Priority = "High" | "Medium" | "Low";
export const PRIORITIES: Priority[] = ["High", "Medium", "Low"];

export interface Todo {
  task_id: string;
  task: string;
  owner: string; // Rajitha / Janith / Staff
  due_date: ISODate;
  priority: Priority;
  done: boolean;
  done_date: ISODate; // "" when open
  booking_id: string; // optional link to a MO_Villa booking record_id
}

export interface UserRow {
  email: string;
  name: string;
  role: Role;
}

/** A planned-target period (from the Targets tab). */
export interface TargetPeriod {
  period: string;
  start_month: MonthKey;
  end_month: MonthKey;
  planned_monthly_sales: number;
  planned_net_profit: number;
  daily_target_breakfast: number;
  daily_target_lunch: number;
  daily_target_dinner: number;
}

export interface Partner {
  name: string;
  pct: number; // 0-100
}

export type OneTimeAllocation = "full" | "spread";
export type FixedProfitBasis = "planned" | "actual_when_paid";

/** Parsed Settings tab. Every number used in a calculation comes from here. */
export interface Settings {
  opening_month: MonthKey;
  closed_months: number[]; // 1-12
  food_cost_target_pct: number;
  partners: Partner[];
  petty_low_threshold: number;
  one_time_allocation: OneTimeAllocation;
  one_time_spread_months: number;
  fixed_profit_basis: FixedProfitBasis;
  cost_categories: string[];
  food_check_categories: string[];
  todo_amber_days: number;
  timezone: string;
  targets: TargetPeriod[];
  villa_rooms: VillaRoom[];
  villa_platforms: VillaPlatform[];
  villa_cost_categories: string[];
  villa_allocation: VillaAllocation;
  /** Who shares villa profit (cafe profit uses `partners`). */
  villa_partners: Partner[];
  /** Menu categories in display order, with their item ID prefix. */
  menu_categories: MenuCategory[];
  /** Receipt header and footer lines. */
  receipt_name: string;
  receipt_address: string;
  receipt_footer: string;
  receipt_width_mm: number;
}

/** Raw key/value row of the Settings tab. */
export interface SettingRow {
  key: string;
  value: string;
  description: string;
}

// ---------------- MO Villa ----------------

export type VillaRecordType = "Booking" | "Cost";
export type BookingStatus = "Confirmed" | "Completed" | "Cancelled";
export const BOOKING_STATUSES: BookingStatus[] = ["Confirmed", "Completed", "Cancelled"];
export type PayoutStatus = "Pending" | "Received";
export const PAYOUT_STATUSES: PayoutStatus[] = ["Pending", "Received"];
export const ALL_ROOMS = "All rooms";

/** One row of the MO_Villa tab. Booking rows use the booking columns, Cost rows the cost columns. */
export interface VillaRecord {
  record_id: string;
  record_type: VillaRecordType;
  date_entered: ISODate; // for Cost rows this is the cost date
  room_number: string;
  room_type: string;
  platform: string;
  booking_ref: string;
  guest_name: string;
  guests: number;
  check_in: ISODate;
  check_out: ISODate;
  nights: number;
  status: BookingStatus | "";
  total_price: number;
  commission_pct: number;
  commission_amount: number;
  booking_costs: number;
  net_payout: number;
  payout_status: PayoutStatus | "";
  payout_date: ISODate;
  received_to: Account | "";
  cost_category: string;
  cost_description: string;
  cost_amount: number;
  cost_room: string; // a room_number or "All rooms"
  paid_from: Account | "";
  notes: string;
}

export interface VillaRoom {
  room_number: string;
  room_type: string;
  base_price: number; // 0 = not set
}

export interface VillaPlatform {
  name: string;
  commission_pct: number;
}

export type VillaAllocation = "nights" | "check_in";
