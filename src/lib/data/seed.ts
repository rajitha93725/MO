import type { FixedCost, MenuItem, UserRow } from "../types";
import { DEFAULT_SETTING_ROWS, DEFAULT_TARGETS } from "../settings";
import type { Row } from "./store";

// Current menu, imported from the "Menu with Prices" tab of the MO planning sheet.
// [category, sub_category, item_name, unit_cost, selling_price]
const MENU: [string, string, string, number, number][] = [
  ["Breakfast", "English Platter", "English Platter", 550, 1250],
  ["Breakfast", "Crepes", "Plain", 450, 1100],
  ["Breakfast", "Crepes", "Nutella", 650, 1350],
  ["Breakfast", "Crepes", "Avocado", 650, 1350],
  ["Breakfast", "Waffle", "Waffle", 750, 1550],
  ["Breakfast", "French Toast", "French Toast", 600, 1350],
  ["Breakfast", "Fruit Platter", "Fruit Platter", 550, 1450],
  ["All day dining", "Pasta", "Cheesy Pasta", 550, 1800],
  ["All day dining", "Pasta", "Baked Pasta", 850, 2100],
  ["All day dining", "Pasta", "Spaghetti", 950, 2450],
  ["All day dining", "Fried Rice", "Chicken", 450, 1450],
  ["All day dining", "Fried Rice", "Mongolian", 850, 2100],
  ["All day dining", "Fried Rice", "Nasi Goreng", 650, 1850],
  ["All day dining", "Kottu", "Kottu", 450, 1450],
  ["All day dining", "Kottu", "Cheesy Kottu", 550, 1850],
  ["All day dining", "Seafood", "Prawn", 850, 2450],
  ["All day dining", "Seafood", "Calamari", 850, 2450],
  ["All day dining", "Seafood", "Full Fish", 1200, 3200],
  ["All day dining", "Seafood", "Crab", 1800, 4500],
  ["All day dining", "Snack", "Burger", 900, 2100],
  ["All day dining", "Snack", "Burritos", 650, 1850],
  ["All day dining", "Snack", "Fish Finger", 950, 1950],
  ["All day dining", "Snack", "Sandwich", 850, 2100],
  ["All day dining", "Main", "Fish & Chips", 1100, 2250],
  ["All day dining", "Main", "Grilled Chicken", 1200, 2450],
  ["All day dining", "Main", "Kebab", 1400, 2850],
  ["Drinks", "Juice", "Papaya", 150, 650],
  ["Drinks", "Juice", "Watermelon", 150, 650],
  ["Drinks", "Juice", "Pineapple", 200, 850],
  ["Drinks", "Juice", "Mixed", 200, 850],
  ["Drinks", "Juice", "Lime", 400, 1100],
  ["Drinks", "Juice", "Avocado", 250, 1100],
  ["Drinks", "Juice", "Mango", 200, 850],
  ["Drinks", "Mocktails", "Lime Mojito", 350, 1100],
  ["Drinks", "Mocktails", "Passion Mojito", 450, 1250],
  ["Drinks", "Mocktails", "Watermelon Mojito", 400, 1250],
  ["Drinks", "Mocktails", "Pina Colada", 500, 1350],
  ["Drinks", "Mocktails", "Moscow Mule", 450, 1350],
  ["Drinks", "Mocktails", "Iced Tea", 250, 1100],
  ["Drinks", "Milkshakes", "Vanilla", 550, 1400],
  ["Drinks", "Milkshakes", "Chocolate", 650, 1450],
  ["Drinks", "Milkshakes", "Brownie Shake", 750, 1550],
  ["Drinks", "Milkshakes", "Coffee Shake", 650, 1450],
  ["Drinks", "Milkshakes", "Crunchy Shake", 650, 1450],
  ["Drinks", "Coffee", "Espresso", 200, 650],
  ["Drinks", "Coffee", "Doppio", 250, 700],
  ["Drinks", "Coffee", "Latte", 400, 950],
  ["Drinks", "Coffee", "Cappuccino", 400, 1100],
  ["Drinks", "Coffee", "Mocha Latte", 550, 1250],
  ["Drinks", "Coffee", "Caramel Macchiato", 650, 1350],
  ["Drinks", "Tea", "Tea Pot", 250, 650],
  ["Drinks", "Tea", "Coffee Pot", 350, 800],
  ["Drinks", "Tea", "Samahan Tea", 200, 650],
  ["Drinks", "Tea", "Herbal Tea", 250, 750],
];

const PREFIX: Record<string, string> = { Breakfast: "B", "All day dining": "A", Drinks: "D" };

export function seedMenu(): MenuItem[] {
  const counters: Record<string, number> = {};
  return MENU.map(([category, sub_category, item_name, unit_cost, selling_price]) => {
    const p = PREFIX[category];
    counters[p] = (counters[p] ?? 0) + 1;
    return { item_id: `${p}${String(counters[p]).padStart(2, "0")}`, category, sub_category, item_name, unit_cost, selling_price, active: true };
  });
}

/** Monthly fixed costs from the Target Sales plan (Rs 370,000 / month from opening). */
export function seedFixedCosts(): FixedCost[] {
  const items: [string, number][] = [
    ["Rent", 100_000],
    ["Utility bills", 20_000],
    ["Staff salary", 160_000],
    ["Marketing", 50_000],
    ["Promotions", 20_000],
    ["Other", 20_000],
  ];
  return items.map(([name, amount], i) => ({
    fixed_id: `F${String(i + 1).padStart(2, "0")}`,
    name,
    amount,
    frequency: "Monthly",
    start_month: "2026-12",
    end_month: "",
    month_paid: "",
    paid_from: "Bank",
    notes: "From Target Sales plan",
  }));
}

/** Janith and staff emails are added later in the Users tab. */
export function seedUsers(): UserRow[] {
  return [{ email: "rajitha93725@gmail.com", name: "Rajitha", role: "partner" }];
}

export function seedSettingsRows(): Row[] {
  return DEFAULT_SETTING_ROWS.map((r) => ({ ...r }));
}

export function seedTargets(): Row[] {
  return DEFAULT_TARGETS.map((t) => ({ ...t }));
}
