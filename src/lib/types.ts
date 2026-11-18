// Domain types. These are storage-agnostic: the Supabase store and the demo
// memory store map their rows to and from these shapes.

export type Meal = "Breakfast" | "Lunch" | "Dinner";
export const MEALS: Meal[] = ["Breakfast", "Lunch", "Dinner"];

export type PaymentMethod = "Cash" | "Card" | "Bank transfer" | "Uber";
/** Payment methods for cafe (dine-in / takeaway) orders. */
export const PAYMENT_METHODS: PaymentMethod[] = ["Cash", "Card", "Bank transfer"];
/** Every payment method, including Uber orders (Uber pays out to the bank). */
export const ALL_PAYMENT_METHODS: PaymentMethod[] = [...PAYMENT_METHODS, "Uber"];

/** Where an order came from. */
export type OrderChannel = "Cafe" | "Uber";

/** How the order is served. Dine-in needs a table; Take-away and Uber are packed. */
export type OrderType = "Dine-in" | "Take-away" | "Uber";
export const ORDER_TYPES: OrderType[] = ["Dine-in", "Take-away", "Uber"];
export const ORDER_TYPE_ICON: Record<OrderType, string> = { "Dine-in": "🍽️", "Take-away": "📦", Uber: "🛵" };

/** Orders saved before order types existed: Uber is known from the payment; others are unknown (""). */
export function orderTypeOf(o: { order_type?: string; payment_method: string }): OrderType | "" {
  if (o.order_type && (ORDER_TYPES as string[]).includes(o.order_type)) return o.order_type as OrderType;
  return o.payment_method === "Uber" ? "Uber" : "";
}

/**
 * Order line status. Open = sent to the kitchen, not paid yet (an open bill); Paid = counted in sales and cash;
 * Void = cancelled item (kept for the record, never counted). Lines saved before statuses existed are "" = Paid.
 */
export type OrderStatus = "Open" | "Paid" | "Void";
export const isPaidLine = (l: { status?: string }) => !l.status || l.status === "Paid";
export const VOID_REASONS = ["Customer cancelled", "Wrong item entered", "Kitchen problem", "Other"] as const;

/** Dine-in tables of one area (Settings: dining_tables), e.g. Upstairs → "Upstairs 1" … "Upstairs 5". */
export interface DiningArea {
  name: string;
  tables: string[];
}

/**
 * Money accounts. "Petty cash" is the CAFE's cash box (the stored value stays "Petty cash" so old rows keep working);
 * "Villa petty cash" is the villa's own cash box. The Bank is shared.
 */
export type Account = "Petty cash" | "Villa petty cash" | "Bank";
export const ACCOUNTS: Account[] = ["Petty cash", "Villa petty cash", "Bank"];
/** Accounts the cafe pays from and receives into. */
export const CAFE_ACCOUNTS: Account[] = ["Petty cash", "Bank"];
/** Accounts the villa pays from and receives into. */
export const VILLA_ACCOUNTS: Account[] = ["Villa petty cash", "Bank"];
export const ACCOUNT_LABEL: Record<Account, string> = { "Petty cash": "Cafe petty cash", "Villa petty cash": "Villa petty cash", Bank: "Bank" };
export const accountLabel = (a: string) => ACCOUNT_LABEL[a as Account] ?? a;

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
  /** "" while the bill is open (not paid yet). */
  payment_method: PaymentMethod | "";
  notes: string;
  entered_by: string;
  /** Dine-in / Take-away / Uber ("" on orders saved before this existed). */
  order_type: OrderType | "";
  /** Dine-in table, e.g. "Garden 2" ("" otherwise). */
  table_no: string;
  /** Open (bill not paid yet) / Paid / Void ("" = Paid, saved before statuses existed). */
  status: OrderStatus | "";
  /** Voided lines: who authorised it and why. */
  void_by: string;
  void_reason: string;
  /** Invoice number: YYMMDD_NNN (daily, from 021) for cafe orders; the Uber invoice number (typed in) for Uber. */
  invoice_no: string;
  /** Kitchen note for this item: allergies, more / less spicy, without onions, … */
  item_note: string;
  /** Paid add-ons as JSON (see calc/pricing.ts Addon), and their total (included in line_total). */
  addons: string;
  addons_total: number;
  /** Item discount (% or Rs) on qty × unit_price only (not on add-ons). On the bill-discount line: the bill discount. */
  discount_type: "%" | "Rs" | "";
  discount_value: number;
  discount_amount: number;
  /** Next-day offer printed at the bottom of the invoice ("" = none). */
  offer_text: string;
  /** When the bill was printed for the table ("YYYY-MM-DD HH:mm"; "" = not yet). */
  printed_at: string;
}

/** Who can see a log line: MO Cafe (all partners), MO Villa and Admin (owner only). */
export type LogBusiness = "MO Cafe" | "MO Villa" | "Admin";
export const LOG_BUSINESSES: LogBusiness[] = ["MO Cafe", "MO Villa", "Admin"];

/** One line in MO Activity Logs: what was done, not every step. */
export interface ActivityLog {
  log_id: string;
  /** "YYYY-MM-DD HH:mm" in the cafe's timezone. */
  at: string;
  business: LogBusiness;
  /** Order, Bill, Payment, Void, Discount, Daily cost, Fixed cost, Cash, Menu, To-do, Booking, Villa cost, Capital, Settings, Users. */
  category: string;
  action: string;
  detail: string;
  /** Id of the order / booking / cost it is about. */
  ref: string;
  by_name: string;
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
  | "Cash sales deposit"
  | "Transfer villa petty→bank"
  | "Transfer bank→villa petty";

export const MOVEMENT_TYPES: MovementType[] = [
  "Opening balance",
  "Top-up",
  "Withdrawal",
  "Transfer petty→bank",
  "Transfer bank→petty",
  "Cash sales deposit",
  "Transfer villa petty→bank",
  "Transfer bank→villa petty",
];

/** Fixed-direction movements: [from, to]. ("petty" in the older names is the cafe's petty cash.) */
export const TRANSFERS: Partial<Record<MovementType, [Account, Account]>> = {
  "Transfer petty→bank": ["Petty cash", "Bank"],
  "Transfer bank→petty": ["Bank", "Petty cash"],
  "Cash sales deposit": ["Petty cash", "Bank"],
  "Transfer villa petty→bank": ["Villa petty cash", "Bank"],
  "Transfer bank→villa petty": ["Bank", "Villa petty cash"],
};

const MOVEMENT_LABELS: Partial<Record<MovementType, string>> = {
  "Transfer petty→bank": "Transfer cafe petty → bank",
  "Transfer bank→petty": "Transfer bank → cafe petty",
  "Cash sales deposit": "Cash sales deposit (cafe petty → bank)",
  "Transfer villa petty→bank": "Transfer villa petty → bank",
  "Transfer bank→villa petty": "Transfer bank → villa petty",
};
/** Movement type as shown on screen (the stored names say "petty" for the cafe's petty cash). */
export const movementLabel = (t: string) => MOVEMENT_LABELS[t as MovementType] ?? t;

/** Accounts a movement changes. */
export function movementAccounts(m: Pick<CashMovement, "type" | "account">): Account[] {
  return TRANSFERS[m.type] ?? [m.account];
}

/** Movement types a partner who is not the owner may record (cafe petty cash only). */
export const CAFE_MOVEMENT_TYPES: MovementType[] = ["Opening balance", "Top-up", "Withdrawal", "Transfer petty→bank", "Transfer bank→petty", "Cash sales deposit"];

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
export const CAPITAL_PAID_INTO = ["Bank", "Petty cash", "Villa petty cash", "Paid directly"] as const;
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
  /** MO Villa task: only the owner sees it (also true for any task linked to a booking). */
  villa: boolean;
}

/** Villa tasks are hidden from everyone except the owner. */
export function isVillaTodo(t: Pick<Todo, "villa" | "booking_id">): boolean {
  return Boolean(t.villa) || Boolean(t.booking_id);
}

export interface UserRow {
  email: string;
  name: string;
  role: Role;
  /** Optional sign-in name for username + password login (lower case). */
  username: string;
  /** scrypt hash (src/lib/password.ts); empty = no password, Google sign-in only. Never sent to the browser. */
  password_hash: string;
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
  /** Food cost % at or below which a menu item is shown green. */
  food_cost_good_pct: number;
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
  uber_markup_pct: number;
  uber_commission_pct: number;
  /** Dine-in tables by area, in display order (first area blue, second green). */
  dining_areas: DiningArea[];
  /** Menu category whose items are add-ons (extra cheese, extra egg, …), not shown as dishes. */
  addon_category: string;
  /** Quick kitchen notes on the order screen (Allergies, More spicy, …). */
  addon_notes: string[];
  /** Default text for the next-day offer on invoices ("" = none). */
  next_day_offer: string;
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
