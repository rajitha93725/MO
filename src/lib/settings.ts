import type { Partner, Settings, SettingRow, TargetPeriod, VillaPlatform, VillaRoom } from "./types";

/**
 * Default Settings rows. These are written to the Settings tab by the setup script
 * and are only used as a fallback if a key is missing from the sheet.
 * Calculations always receive a parsed Settings object — never these constants directly.
 */
export const DEFAULT_SETTING_ROWS: SettingRow[] = [
  { key: "opening_month", value: "2026-12", description: "First trading month (YYYY-MM)" },
  { key: "closed_months", value: "6,7,8,9,10", description: "Month numbers the cafe is closed (1=Jan … 12=Dec)" },
  { key: "food_cost_target_pct", value: "40", description: "Menu items above this food cost % are highlighted" },
  { key: "partners", value: "Rajitha:50,Janith:50", description: "Profit split, Name:percent, comma separated (must total 100)" },
  { key: "petty_low_threshold", value: "20000", description: "Warn when petty cash falls below this (Rs)" },
  { key: "one_time_allocation", value: "full", description: "One-time fixed costs: full = all in month paid, spread = over N open months" },
  { key: "one_time_spread_months", value: "6", description: "N months used when one_time_allocation = spread" },
  { key: "fixed_profit_basis", value: "actual_when_paid", description: "planned = always use plan amount; actual_when_paid = use the recorded payment when one exists" },
  {
    key: "cost_categories",
    value: "Food & ingredients,Drinks & beverages,Gas & fuel,Packaging,Cleaning,Transport,Repairs & maintenance,Other",
    description: "Daily cost categories, comma separated",
  },
  { key: "food_check_categories", value: "Food & ingredients,Drinks & beverages", description: "Daily cost categories compared to menu-based food cost" },
  { key: "todo_amber_days", value: "3", description: "Tasks due within this many days are shown amber" },
  { key: "timezone", value: "Asia/Colombo", description: "Timezone used for 'today'" },
  {
    key: "villa_rooms",
    value: "Room 1:Double:0,Room 2:Double:0,Room 3:Double:0,Room 4:Double:0",
    description: "MO Villa rooms as room_number:room_type:base_price_per_night (0 = no base price), comma separated",
  },
  {
    key: "villa_platforms",
    value: "Airbnb:15,Booking.com:15,Agoda:18,Direct:0,Other:0",
    description: "Booking platforms with default commission %, Name:percent, comma separated",
  },
  {
    key: "villa_cost_categories",
    value: "Bedsheets & linen,Toiletries (shampoo, soap),Cleaning supplies,Repairs & maintenance,Utilities,Other",
    description: "Villa cost categories. Separate with ; when a name contains a comma",
  },
  { key: "villa_allocation", value: "nights", description: "nights = split revenue across months by nights stayed; check_in = count it all in the check-in month" },
  { key: "villa_partners", value: "Rajitha:100", description: "Villa profit split, Name:percent (must total 100). Cafe profit uses 'partners'" },
];

export const DEFAULT_TARGETS: TargetPeriod[] = [
  {
    period: "First 3 months",
    start_month: "2026-12",
    end_month: "2027-02",
    planned_monthly_sales: 1_375_000,
    planned_net_profit: 206_250,
    daily_target_breakfast: 10_000,
    daily_target_lunch: 15_000,
    daily_target_dinner: 30_000,
  },
  {
    period: "Next 3 months",
    start_month: "2027-03",
    end_month: "2027-05",
    planned_monthly_sales: 3_250_000,
    planned_net_profit: 487_500,
    daily_target_breakfast: 25_000,
    daily_target_lunch: 30_000,
    daily_target_dinner: 75_000,
  },
  {
    period: "2028 season (Nov-May)",
    start_month: "2027-11",
    end_month: "2028-05",
    planned_monthly_sales: 5_375_000,
    planned_net_profit: 806_250,
    daily_target_breakfast: 45_000,
    daily_target_lunch: 50_000,
    daily_target_dinner: 120_000,
  },
];

function list(v: string): string[] {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toNum(v: string, key: string): number {
  const n = Number(String(v).replace(/,/g, ""));
  if (!Number.isFinite(n)) throw new Error(`Setting "${key}" must be a number, got "${v}"`);
  return n;
}

export function parsePartners(v: string): Partner[] {
  return list(v).map((p) => {
    const [name, pctStr] = p.split(":").map((s) => s.trim());
    return { name, pct: toNum(pctStr ?? "0", "partners") };
  });
}

export function parseRooms(v: string): VillaRoom[] {
  return list(v).map((r) => {
    const [room_number, room_type = "", price = "0"] = r.split(":").map((x) => x.trim());
    return { room_number, room_type, base_price: toNum(price || "0", "villa_rooms") };
  });
}

export function parsePlatforms(v: string): VillaPlatform[] {
  return list(v).map((p) => {
    const i = p.lastIndexOf(":");
    if (i < 0) return { name: p, commission_pct: 0 };
    return { name: p.slice(0, i).trim(), commission_pct: toNum(p.slice(i + 1).trim() || "0", "villa_platforms") };
  });
}

/** Category list that may contain commas inside names: split on ";" when present, else on commas outside parentheses. */
export function parseCategoryList(v: string): string[] {
  if (v.includes(";")) return v.split(";").map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of v) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

export function parseSettings(rows: SettingRow[], targets: TargetPeriod[]): Settings {
  const map = new Map<string, string>();
  for (const r of DEFAULT_SETTING_ROWS) map.set(r.key, r.value);
  for (const r of rows) if (r.key && r.value !== undefined && String(r.value).trim() !== "") map.set(r.key.trim(), String(r.value).trim());
  const g = (k: string) => map.get(k) ?? "";

  const partners = parsePartners(g("partners"));
  const total = partners.reduce((t, p) => t + p.pct, 0);
  if (Math.abs(total - 100) > 0.001) throw new Error(`Partner split must total 100%, got ${total}%`);
  const villaPartners = parsePartners(g("villa_partners"));
  const villaTotal = villaPartners.reduce((t, p) => t + p.pct, 0);
  if (Math.abs(villaTotal - 100) > 0.001) throw new Error(`Villa partner split (villa_partners) must total 100%, got ${villaTotal}%`);

  const alloc = g("one_time_allocation") === "spread" ? "spread" : "full";
  const basis = g("fixed_profit_basis") === "planned" ? "planned" : "actual_when_paid";

  return {
    opening_month: g("opening_month"),
    closed_months: list(g("closed_months")).map((m) => toNum(m, "closed_months")),
    food_cost_target_pct: toNum(g("food_cost_target_pct"), "food_cost_target_pct"),
    partners,
    petty_low_threshold: toNum(g("petty_low_threshold"), "petty_low_threshold"),
    one_time_allocation: alloc,
    one_time_spread_months: Math.max(1, Math.round(toNum(g("one_time_spread_months"), "one_time_spread_months"))),
    fixed_profit_basis: basis,
    cost_categories: list(g("cost_categories")),
    food_check_categories: list(g("food_check_categories")),
    todo_amber_days: toNum(g("todo_amber_days"), "todo_amber_days"),
    timezone: g("timezone") || "UTC",
    targets: [...targets].sort((a, b) => a.start_month.localeCompare(b.start_month)),
    villa_rooms: parseRooms(g("villa_rooms")),
    villa_platforms: parsePlatforms(g("villa_platforms")),
    villa_cost_categories: parseCategoryList(g("villa_cost_categories")),
    villa_allocation: g("villa_allocation") === "check_in" ? "check_in" : "nights",
    villa_partners: villaPartners,
  };
}

/** Target period containing a month, if any. */
export function targetFor(month: string, targets: TargetPeriod[]): TargetPeriod | undefined {
  return targets.find((t) => t.start_month <= month && month <= t.end_month);
}
