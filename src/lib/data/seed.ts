import type { FixedCost, MenuItem, UserRow } from "../types";
import { DEFAULT_SETTING_ROWS, DEFAULT_TARGETS, parseMenuCategories } from "../settings";
import type { Row } from "./store";

// Current menu (new menu, Nov 2026): Brunch, All Day Menu and Beverage.
// [category, sub_category, item_name, unit_cost, selling_price, description]
type MenuSeed = [string, string, string, number, number, string];
const BRUNCH = "Brunch", ALL_DAY = "All Day Menu", BEV = "Beverage";
const MENU: MenuSeed[] = [
  // ---- Brunch ----
  [BRUNCH, "SweetMO", "Mo special Crepes", 520, 1850, "Special sweet crepe stuffed with your choice of chocolate or nutella with banana, served with ice cream, banana, sweet sauce with treacle & nuts"],
  [BRUNCH, "SweetMO", "Richy waffle", 610, 1850, "Crunchy vanilla waffle served with banana, nuts, chocolate, sweet sauce, treacle and ice cream"],
  [BRUNCH, "SweetMO", "Sweety cinnamon french toast", 640, 1850, "Cinnamon infused sweet french toasts served with banana, chocolate, sweet sauce and ice cream"],
  [BRUNCH, "SweetMO", "FluffyMO Pancakes", 640, 1850, "Fluffy baked pancakes served with banana, chocolate, sweet sauce, treacle, nuts with ice cream"],
  [BRUNCH, "SweetMO", "Stuffed Crossaints", 900, 1950, "Crunchy croissant pastry stuffed with banana, nutella, chocolate and served with sweet sauce and ice cream"],
  [BRUNCH, "SavoryMo", "English breakfast Platter", 900, 2100, "Eggs on your choice as omelette, fried, poached or scrambled served on toasted bread slices with sausage, bacon, grilled tomato along side with butter & jam"],
  [BRUNCH, "SavoryMo", "Shakshuka", 1180, 2950, "Baked eggs in a tomato pepper basil based shakshuka sauce served with toasted garlic bread slice"],
  [BRUNCH, "Healthy & lite", "Frozen Smoothie bowl", 800, 1950, "Fruity creamy smoothie made with banana, avocado, watermelon & mango served with nuts, dates, banana, strawberry and coconut with treacle on top"],
  [BRUNCH, "Healthy & lite", "Local curd bowl", 700, 1850, "Healthy buffalo curd mixed with fruit, nuts, oats and treacle on top"],
  [BRUNCH, "Healthy & lite", "Strawberry yoghurt bowl", 600, 1850, "Freshly crushed strawberries mixed with yoghurt and mint served with banana, strawberry, nuts and treacle on top"],
  [BRUNCH, "Healthy & lite", "Fresh fruit platter", 550, 1550, "Freshly cut local garden and tropical fruit selection served with lime and curd"],
  // ---- All Day Menu ----
  [ALL_DAY, "MO to Start", "Chicken Caesar salad", 750, 1950, "Crunchy iceberg, grilled chicken, parmesan cheese served with caesar dressing with garlic croutons on top"],
  [ALL_DAY, "MO to Start", "Shrimp Hawaii salad", 700, 2100, "Classic hawaiian style salad of cucumber, tomato, onion, lettuce, pineapple mixed with mayonnaise served with pan fried shrimps"],
  [ALL_DAY, "MO to Start", "Cheese Toasts", 500, 1550, "Bread toasts baked with vegetable, egg and melted mozzarella"],
  [ALL_DAY, "MO to Start", "French fries", 520, 1450, "Herb infused classic french fries served with mayonnaise and tomato sauce"],
  [ALL_DAY, "Soup for Appetite", "Creamy Chicken Soup", 430, 1450, "Rich chicken & veg soup, finished with fresh cream, served with garlic toast"],
  [ALL_DAY, "Soup for Appetite", "Sweet corn Egg drop Soup", 260, 1550, "Chinese style egg-drop soup finished with sweet corn served with garlic toast"],
  [ALL_DAY, "Soup for Appetite", "Tom-Yum Soup (Prawn)", 800, 2100, "Thai authentic spicy tom-yum with prawn, served with garlic toast"],
  [ALL_DAY, "Main Deal", "BBQ Chicken Leg", 950, 3100, "Grilled & bbq chicken whole leg served with steamed rice, BBQ sauce, fresh side salad and mango chutney"],
  [ALL_DAY, "Main Deal", "Garlic Jumbo Prawns", 1450, 3850, "Garlic infused pan fried jumbo prawns served with steamed rice, lemon butter sauce, fresh side salad and lime"],
  [ALL_DAY, "Main Deal", "Grilled calamari rings", 1450, 3850, "Pan fried lemon calamari rings, served with steamed rice, lemon butter sauce, fresh side salad and lime"],
  [ALL_DAY, "Ciao ciao Italiano", "Cheesy penne Pasta", 570, 1850, "Boiled penne pasta mixed with garlic infused white sauce and melted mozzarella with chopped herbs on top"],
  [ALL_DAY, "Ciao ciao Italiano", "Spaghetti alla bolognese", 980, 2450, "Plain boiled spaghetti with authentic italian beef bolognese served with garlic toast on top"],
  [ALL_DAY, "Ciao ciao Italiano", "Spaghetti alla Carbonara (Chicken)", 710, 2250, "Italian carbonara spaghetti mixed with chicken, served with garlic toast & chopped herbs on top"],
  [ALL_DAY, "Ciao ciao Italiano", "Seafood Penne Au gratin", 990, 2550, "Seafood marinara sauce mixed with boiled penne and baked with bechamel & mozzarella on top"],
  [ALL_DAY, "Classic Snacks", "Classic Beef burger", 910, 2550, "History classic homemade beef burger served with caramelized onion, gherkin pickles, onion, tomato with cheese"],
  [ALL_DAY, "Classic Snacks", "Crispy chicken Burger", 830, 2250, "Homemade crispy chicken served with cheese, lettuce, tomato, onion with special burger sauce"],
  [ALL_DAY, "Classic Snacks", "Cheesy vegetable Burrito", 640, 2150, "Cheesy, juicy vegetable mix, wrapped with tortilla and served grilled"],
  [ALL_DAY, "Classic Snacks", "MO special club sandwich", 970, 2850, "MO special chicken club sandwich with layers of chicken, egg, vegetable, bacon & cheese"],
  [ALL_DAY, "Ceylon Street", "Fried Rice", 760, 1850, "Chinese style seafood fried rice served with bullseye egg, fried sausage, chillie paste & mango chutney"],
  [ALL_DAY, "Ceylon Street", "Kottu", 670, 1850, "Most famous Sri Lankan street style chicken kottu served with bullseye egg, fried sausage, gravy and chillie paste"],
  [ALL_DAY, "Ceylon Street", "Cheesy Kottu", 720, 1950, "Cheese kottu made with fresh cream and mozzarella served with bullseye egg, fried sausage, tomato ketchup and chillie paste"],
  [ALL_DAY, "The Sweet End", "Chocolate brownie", 600, 1450, "Rich & warm chocolate brownie served with vanilla ice cream, sweet sauce and nuts"],
  [ALL_DAY, "The Sweet End", "Crispy Banana fitters", 380, 1200, "Sweet and crispy fried banana fritters served with fresh banana, vanilla ice cream, sweet sauce and nuts"],
  [ALL_DAY, "The Sweet End", "Ice cream bowl", 350, 950, "Double scooped ice cream of your choice served with sweet sauces, banana and nuts"],
  // ---- Beverage ---- (names include the drink type so receipts and reports are clear: "Watermelon juice" vs "Watermelon mojito")
  [BEV, "Fresh Juice", "Papaya juice", 100, 650, ""],
  [BEV, "Fresh Juice", "Watermelon juice", 100, 650, ""],
  [BEV, "Fresh Juice", "Pineapple juice", 300, 850, ""],
  [BEV, "Fresh Juice", "Mango juice", 300, 850, ""],
  [BEV, "Fresh Juice", "Mixed juice", 200, 750, ""],
  [BEV, "Fresh Juice", "Avocado juice", 300, 950, ""],
  [BEV, "Fresh Juice", "Woodapple juice", 100, 850, ""],
  [BEV, "Fresh Juice", "Lime juice", 400, 1100, ""],
  [BEV, "Mojito", "Lime & Mint mojito", 300, 950, ""],
  [BEV, "Mojito", "Passionfruit mojito", 400, 1100, ""],
  [BEV, "Mojito", "Strawberry mojito", 400, 1200, ""],
  [BEV, "Mojito", "Watermelon mojito", 200, 950, ""],
  [BEV, "Iced Tea", "Lime & Mint iced tea", 250, 950, ""],
  [BEV, "Iced Tea", "Cinnamon iced tea", 300, 950, ""],
  [BEV, "Iced Tea", "Samahan iced tea", 350, 1100, ""],
  [BEV, "Milkshake", "Vanilla crunch", 490, 1450, ""],
  [BEV, "Milkshake", "Strawberry shake", 550, 1550, ""],
  [BEV, "Milkshake", "Chocolate Crushed", 550, 1550, ""],
  [BEV, "Milkshake", "Brownie shake", 750, 1950, ""],
  [BEV, "Milkshake", "Milo shake", 600, 1650, ""],
  [BEV, "Milkshake", "Banana milkshake", 550, 1450, ""],
  [BEV, "Coffee", "Espresso", 450, 850, ""],
  [BEV, "Coffee", "Espresso doppio", 550, 950, ""],
  [BEV, "Coffee", "Latte", 600, 1200, ""],
  [BEV, "Coffee", "Cappuccino", 600, 1200, ""],
  [BEV, "Coffee", "Mocha latte", 650, 1350, ""],
  [BEV, "Coffee", "Americano", 450, 950, ""],
  [BEV, "Coffee", "Affogato", 550, 1200, ""],
  [BEV, "Coffee", "Iced americano", 550, 950, ""],
  [BEV, "Coffee", "Iced latte", 650, 1300, ""],
  [BEV, "Coffee", "Iced Milo", 350, 1300, ""],
  [BEV, "Other Hot drinks", "Tea pot", 150, 650, ""],
  [BEV, "Other Hot drinks", "Coffee pot", 200, 750, ""],
  [BEV, "Other Hot drinks", "Hot chocolate mug", 350, 950, ""],
  [BEV, "Other Hot drinks", "Chai masala mug", 300, 950, ""],
  [BEV, "Other Hot drinks", "Herbal tea pot", 200, 750, ""],
];

/** IDs: category prefix (Settings: menu_categories) + 2-digit number in menu order, e.g. B01, A01, D01. */
export function seedMenu(): MenuItem[] {
  const prefixes = new Map(parseMenuCategories(DEFAULT_SETTING_ROWS.find((r) => r.key === "menu_categories")!.value).map((c) => [c.name, c.prefix]));
  const counters: Record<string, number> = {};
  return MENU.map(([category, sub_category, item_name, unit_cost, selling_price, description]) => {
    const p = prefixes.get(category)!;
    counters[p] = (counters[p] ?? 0) + 1;
    return { item_id: `${p}${String(counters[p]).padStart(2, "0")}`, category, sub_category, item_name, unit_cost, selling_price, active: true, description };
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
