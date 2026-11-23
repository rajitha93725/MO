import type { DiningArea, MenuCategory, Partner, Settings, SettingRow, TargetPeriod, VillaPlatform, VillaRoom } from "./types";

/**
 * Default Settings rows. These are written to the Settings tab by the setup script
 * and are only used as a fallback if a key is missing from the Settings table.
 * Calculations always receive a parsed Settings object — never these constants directly.
 */
export const DEFAULT_SETTING_ROWS: SettingRow[] = [
  { key: "opening_month", value: "2026-12", description: "First trading month (YYYY-MM)" },
  { key: "closed_months", value: "6,7,8,9,10", description: "Month numbers the cafe is closed (1=Jan … 12=Dec)" },
  { key: "food_cost_target_pct", value: "40", description: "Food cost % limit: menu items above it are red" },
  { key: "food_cost_good_pct", value: "33", description: "Good food cost %: menu items at or below it are green (between this and the limit: no colour)" },
  { key: "partners", value: "Rajitha:50,Janith:50", description: "Profit split, Name:percent, comma separated (must total 100)" },
  { key: "petty_low_threshold", value: "20000", description: "Warn when petty cash falls below this (Rs)" },
  { key: "one_time_allocation", value: "full", description: "One-time fixed costs: full = all in month paid, spread = over N open months" },
  { key: "one_time_spread_months", value: "6", description: "N months used when one_time_allocation = spread" },
  { key: "fixed_profit_basis", value: "actual_when_paid", description: "planned = always use plan amount; actual_when_paid = use the recorded payment when one exists" },
  {
    key: "cost_categories",
    value: "Fresh: Vegetables, Fruits, Herbs; Meat: Chicken, Prawns, Cuttlefish, Fish, Crab, Beef, Other; Dairy: Fresh milk, Mozzarella, Parmesan, Ice cream, Curd, Yoghurt; Dry food: Rice, Kottu, Penne, Spaghetti, Spices, Chocolate, Sauces, Oil, Other; Bread: Sandwich bread, Baguette, Burger bun; Frozen: Chips, Tortilla, Ice cube, Bacon, Sausage, Other; Admin: Transport, Staff, Packing, Maintain, Donation, Other expenses",
    description: "Daily cost categories with sub-categories: Category: sub, sub, sub; next category… (a plain comma list = categories without sub-categories)",
  },
  { key: "food_check_categories", value: "Fresh,Meat,Dairy,Dry food,Bread,Frozen,Food & ingredients,Drinks & beverages", description: "Daily cost categories that are food & drink buys (compared to the menu-based food cost; swapped for it in the expected profit). Old names can stay so earlier costs still count" },
  { key: "todo_amber_days", value: "3", description: "Tasks due within this many days are shown amber" },
  { key: "timezone", value: "Asia/Colombo", description: "Timezone used for 'today'" },
  {
    key: "villa_rooms",
    value: "Tide:Double:0,Breeze:Double:0,Nest:Double:0,Cove:Double:0",
    description: "MO Villa rooms as room_number:room_type:base_price_per_night (0 = no base price), comma separated",
  },
  {
    key: "villa_platforms",
    value: "Airbnb:15,Booking.com:15:later,Agoda:18,Direct:0,Other:0",
    description: "Booking platforms with default commission %, Name:percent, comma separated. Add :later when the guest pays you and the commission is paid later (e.g. Booking.com:15:later)",
  },
  {
    key: "villa_cost_categories",
    value: "Bedsheets & linen,Toiletries (shampoo, soap),Cleaning supplies,Repairs & maintenance,Utilities,Other",
    description: "Villa cost categories. Separate with ; when a name contains a comma",
  },
  { key: "villa_allocation", value: "nights", description: "nights = split revenue across months by nights stayed; check_in = count it all in the check-in month" },
  { key: "villa_season_months", value: "12,1,2,3,4,5", description: "Villa season months (1-12, comma separated). The Recovery tab estimates how long it takes to earn back capital + costs using these months" },
  { key: "villa_partners", value: "Rajitha:100", description: "Villa profit split, Name:percent (must total 100). Cafe profit uses 'partners'" },
  { key: "menu_categories", value: "Brunch:B,All Day Menu:A,Beverage:D", description: "Menu categories in display order as Name:ID letter (new items get IDs like B12). The first one opens by default at breakfast" },
  { key: "receipt_name", value: "MO Cafe", description: "Receipt: name printed at the top" },
  { key: "receipt_address", value: "", description: "Receipt: address / phone line under the name (optional)" },
  { key: "receipt_footer", value: "Thank you! Come again", description: "Receipt: line printed at the bottom" },
  { key: "receipt_width_mm", value: "80", description: "Receipt paper width in mm: the width of the paper roll or label (80 or 58 for receipt printers; Xprinter XP-246B: up to 108)" },
  { key: "receipt_font_px", value: "11", description: "Receipt text size when printing, in px (9-16; headings scale with it). Smaller = more fits on a line: 11 ≈ 42 characters on 80 mm paper" },
  { key: "receipt_max_page_mm", value: "150", description: "Roll paper: page length in mm. Every page is this long whatever the bill's length, so the text is always the same size (match the paper length in the printer driver). A longer bill continues on the next page" },
  { key: "receipt_left_mm", value: "11", description: "Blank space on the left of the receipt in mm (raise it if the printer cuts off the left edge; the other sides get 3 mm)" },
  { key: "receipt_height_mm", value: "0", description: "Receipt paper length in mm: 0 = as long as the receipt (roll / continuous paper); for labels, the label height (e.g. 150 for 100×150 labels)" },
  { key: "uber_markup_pct", value: "33.4", description: "Uber orders: % added to the menu price (rounded up to the next Rs 10)" },
  { key: "addon_category", value: "Add-ons", description: "Menu category for paid extras (Extra cheese, Extra egg, …). Its items are picked as add-ons on an item, not as dishes, and are not on the public menu" },
  { key: "addon_notes", value: "Allergies,More spicy,Less spicy,Without onions", description: "Quick kitchen notes for an item on the order screen (comma separated); any other note can be typed" },
  { key: "next_day_offer", value: "", description: "Default next-day offer text printed at the bottom of an invoice when ticked at payment (e.g. 'Show this bill tomorrow: 10% off breakfast')" },
  { key: "dining_tables", value: "Upstairs:5,Garden:5", description: "Dine-in tables as Area:number of tables (tables are named like 'Upstairs 1'). On the order screen the first area is blue, the second green" },
  { key: "uber_commission_pct", value: "25", description: "Uber orders: % of the Uber total that Uber keeps. Saved automatically as a Daily cost 'Uber commission' (Bank, Business)" },
];

/** Appends the add-on category (ID letter X, or the first free letter) when Settings does not list it. */
export function withAddonCategory(cats: MenuCategory[], name: string): MenuCategory[] {
  if (cats.some((c) => c.name.toLowerCase() === name.toLowerCase())) return cats;
  const used = new Set(cats.map((c) => c.prefix));
  const prefix = ["X", ..."ZYWVUTSRQPONMLKJIHGFEDCBA"].find((l) => !used.has(l)) ?? "X";
  return [...cats, { name, prefix }];
}

/** "Upstairs:5,Garden:5" -> [{ name: "Upstairs", tables: ["Upstairs 1", …] }, …]. */
export function parseDiningTables(s: string): DiningArea[] {
  const out = list(s).map((part) => {
    const [name, n] = part.split(":").map((x) => (x ?? "").trim());
    const count = Number(n);
    if (!name || !Number.isInteger(count) || count < 1 || count > 50) throw new Error(`dining_tables: "${part}" must look like Area:number (e.g. Garden:5)`);
    return { name, tables: Array.from({ length: count }, (_, i) => `${name} ${i + 1}`) };
  });
  if (new Set(out.map((a) => a.name.toLowerCase())).size !== out.length) throw new Error("dining_tables: area names must be unique");
  return out;
}

/** "Brunch:B,All Day Menu:A" -> [{ name: "Brunch", prefix: "B" }, …]. Names may not contain ":" or ",". */
export function parseMenuCategories(s: string): MenuCategory[] {
  const out = list(s).map((part) => {
    const [name, prefix] = part.split(":").map((x) => (x ?? "").trim());
    if (!name || !/^[A-Za-z]$/.test(prefix ?? "")) throw new Error(`menu_categories: "${part}" must look like Name:Letter (e.g. Brunch:B)`);
    return { name, prefix: prefix.toUpperCase() };
  });
  if (!out.length) throw new Error("menu_categories: add at least one category");
  if (new Set(out.map((c) => c.prefix)).size !== out.length) throw new Error("menu_categories: each category needs its own letter");
  if (new Set(out.map((c) => c.name.toLowerCase())).size !== out.length) throw new Error("menu_categories: category names must be unique");
  return out;
}

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

/**
 * Daily cost categories. "Fresh: Vegetables, Fruits; Meat: Chicken, Fish" gives categories with sub-categories
 * (categories split by ";" or new lines). A plain comma list gives categories without sub-categories.
 */
export function parseCostCategories(v: string): { categories: string[]; subs: Record<string, string[]> } {
  const subs: Record<string, string[]> = {};
  if (!v.includes(":")) {
    const categories = list(v);
    for (const c of categories) subs[c] = [];
    return { categories, subs };
  }
  const categories: string[] = [];
  for (const part of v.split(/[;\n]/).map((x) => x.trim()).filter(Boolean)) {
    const i = part.indexOf(":");
    const name = (i < 0 ? part : part.slice(0, i)).trim();
    if (!name) continue;
    if (subs[name]) throw new Error(`cost_categories: "${name}" is listed twice`);
    categories.push(name);
    subs[name] = i < 0 ? [] : Array.from(new Set(list(part.slice(i + 1))));
  }
  if (!categories.length) throw new Error("cost_categories: add at least one category");
  return { categories, subs };
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
  return list(v).map((raw) => {
    const later = /:\s*later\s*$/i.test(raw);
    const p = later ? raw.replace(/:\s*later\s*$/i, "") : raw;
    const i = p.lastIndexOf(":");
    if (i < 0) return { name: p.trim(), commission_pct: 0, commission_later: later };
    return { name: p.slice(0, i).trim(), commission_pct: toNum(p.slice(i + 1).trim() || "0", "villa_platforms"), commission_later: later };
  });
}

export function parseSeasonMonths(v: string): number[] {
  const months = list(v).map((m) => Math.round(toNum(m, "villa_season_months")));
  for (const m of months) if (m < 1 || m > 12) throw new Error(`villa_season_months: ${m} is not a month (1-12)`);
  return Array.from(new Set(months));
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
  const costCats = parseCostCategories(g("cost_categories"));
  const basis = g("fixed_profit_basis") === "planned" ? "planned" : "actual_when_paid";

  return {
    opening_month: g("opening_month"),
    closed_months: list(g("closed_months")).map((m) => toNum(m, "closed_months")),
    food_cost_target_pct: toNum(g("food_cost_target_pct"), "food_cost_target_pct"),
    food_cost_good_pct: toNum(g("food_cost_good_pct") || "33", "food_cost_good_pct"),
    partners,
    petty_low_threshold: toNum(g("petty_low_threshold"), "petty_low_threshold"),
    one_time_allocation: alloc,
    one_time_spread_months: Math.max(1, Math.round(toNum(g("one_time_spread_months"), "one_time_spread_months"))),
    fixed_profit_basis: basis,
    // "Uber commission" is always available: Uber orders record it automatically.
    cost_categories: [...costCats.categories.filter((c) => c !== "Uber commission"), "Uber commission"],
    cost_subcategories: { ...costCats.subs, "Uber commission": [] },
    food_check_categories: list(g("food_check_categories")),
    todo_amber_days: toNum(g("todo_amber_days"), "todo_amber_days"),
    timezone: g("timezone") || "UTC",
    targets: [...targets].sort((a, b) => a.start_month.localeCompare(b.start_month)),
    villa_rooms: parseRooms(g("villa_rooms")),
    villa_platforms: parsePlatforms(g("villa_platforms")),
    villa_cost_categories: parseCategoryList(g("villa_cost_categories")),
    villa_allocation: g("villa_allocation") === "check_in" ? "check_in" : "nights",
    villa_partners: villaPartners,
    villa_season_months: parseSeasonMonths(g("villa_season_months")),
    // The add-on category is always there (with a free ID letter), so add-ons can be added in the Menu editor.
    menu_categories: withAddonCategory(parseMenuCategories(g("menu_categories")), g("addon_category") || "Add-ons"),
    receipt_name: g("receipt_name"),
    receipt_address: g("receipt_address"),
    receipt_footer: g("receipt_footer"),
    receipt_width_mm: Math.min(210, Math.max(40, toNum(g("receipt_width_mm"), "receipt_width_mm"))),
    receipt_font_px: Math.min(16, Math.max(9, toNum(g("receipt_font_px") || "11", "receipt_font_px"))),
    receipt_max_page_mm: Math.min(2000, Math.max(50, toNum(g("receipt_max_page_mm") || "150", "receipt_max_page_mm"))),
    receipt_left_mm: Math.min(30, Math.max(0, toNum(g("receipt_left_mm") || "11", "receipt_left_mm"))),
    receipt_height_mm: Math.min(1000, Math.max(0, toNum(g("receipt_height_mm") || "0", "receipt_height_mm"))),
    uber_markup_pct: pctSetting(g("uber_markup_pct"), "uber_markup_pct"),
    uber_commission_pct: pctSetting(g("uber_commission_pct"), "uber_commission_pct"),
    dining_areas: parseDiningTables(g("dining_tables")),
    addon_category: g("addon_category") || "Add-ons",
    addon_notes: list(g("addon_notes")),
    next_day_offer: g("next_day_offer"),
  };
}

function pctSetting(v: string, key: string): number {
  const n = toNum(v, key);
  if (n < 0 || n >= 100) throw new Error(`${key} must be between 0 and 99.9`);
  return n;
}

/** Target period containing a month, if any. */
export function targetFor(month: string, targets: TargetPeriod[]): TargetPeriod | undefined {
  return targets.find((t) => t.start_month <= month && month <= t.end_month);
}
