// Single source of truth for tab names and column order.
// The setup script creates the tabs from this; the Sheets store reads/writes by header name,
// so columns may be reordered in the sheet without breaking the app.

export const TABS = {
  menu: "Menu",
  priceHistory: "Menu_Price_History",
  orders: "Orders",
  dailyCosts: "Daily_Costs",
  fixedCosts: "Fixed_Costs",
  fixedPayments: "Fixed_Payments",
  cash: "Cash_Movements",
  todo: "Todo",
  settings: "Settings",
  targets: "Targets",
  users: "Users",
  villa: "MO_Villa",
  capital: "Capital",
} as const;

export type TabKey = keyof typeof TABS;

export const HEADERS: Record<TabKey, string[]> = {
  menu: ["item_id", "category", "sub_category", "item_name", "unit_cost", "selling_price", "active"],
  priceHistory: ["history_id", "item_id", "effective_date", "old_cost", "old_price", "new_cost", "new_price", "changed_by"],
  orders: [
    "order_id", "date", "time", "meal", "item_id", "item_name", "qty", "unit_price", "line_total",
    "unit_cost", "line_cost", "payment_method", "notes", "line_id", "entered_by",
  ],
  dailyCosts: ["cost_id", "date", "category", "description", "amount", "paid_from", "paid_by", "notes", "entered_by"],
  fixedCosts: ["fixed_id", "name", "amount", "frequency", "start_month", "end_month", "month_paid", "paid_from", "notes"],
  fixedPayments: ["payment_id", "fixed_id", "month", "amount", "paid_date", "paid_from", "notes"],
  cash: ["movement_id", "date", "account", "type", "amount", "notes", "moved_by"],
  todo: ["task_id", "task", "owner", "due_date", "priority", "done", "done_date", "booking_id"],
  settings: ["key", "value", "description"],
  targets: [
    "period", "start_month", "end_month", "planned_monthly_sales", "planned_net_profit",
    "daily_target_breakfast", "daily_target_lunch", "daily_target_dinner",
  ],
  users: ["email", "name", "role"],
  villa: [
    "record_id", "record_type", "date_entered",
    "room_number", "room_type",
    "platform", "booking_ref", "guest_name", "guests", "check_in", "check_out", "nights",
    "status", "total_price", "commission_pct", "commission_amount", "booking_costs",
    "net_payout", "payout_status", "payout_date", "received_to",
    "cost_category", "cost_description", "cost_amount", "cost_room", "paid_from",
    "notes",
  ],
  capital: ["capital_id", "date", "partner", "business", "description", "amount", "paid_into", "notes"],
};

/** Primary-key column per tab (first column is used when not listed). */
export const ID_COLUMN: Record<TabKey, string> = {
  menu: "item_id",
  priceHistory: "history_id",
  orders: "line_id",
  dailyCosts: "cost_id",
  fixedCosts: "fixed_id",
  fixedPayments: "payment_id",
  cash: "movement_id",
  todo: "task_id",
  settings: "key",
  targets: "period",
  users: "email",
  villa: "record_id",
  capital: "capital_id",
};

export const NUMBER_COLUMNS = new Set([
  "unit_cost", "selling_price", "old_cost", "old_price", "new_cost", "new_price",
  "qty", "unit_price", "line_total", "line_cost", "amount",
  "planned_monthly_sales", "planned_net_profit",
  "daily_target_breakfast", "daily_target_lunch", "daily_target_dinner",
  "guests", "nights", "total_price", "commission_pct", "commission_amount", "booking_costs", "net_payout", "cost_amount",
]);

/** Columns formatted as plain text in the sheet (dates, months, times, free-form setting values). */
export const TEXT_COLUMNS: Partial<Record<TabKey, string[]>> = {
  priceHistory: ["effective_date"],
  orders: ["date", "time"],
  dailyCosts: ["date"],
  fixedCosts: ["start_month", "end_month", "month_paid"],
  fixedPayments: ["month", "paid_date"],
  cash: ["date"],
  todo: ["due_date", "done_date"],
  settings: ["value"],
  targets: ["start_month", "end_month"],
  villa: ["date_entered", "room_number", "booking_ref", "check_in", "check_out", "payout_date", "cost_room"],
  capital: ["date"],
};

export const BOOLEAN_COLUMNS = new Set(["active", "done"]);
