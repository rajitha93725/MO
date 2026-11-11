// Sample (fake) operating data for the local in-memory demo mode only (DATA_BACKEND=memory).
// Never written to the Google Sheet.
import type { CashMovement, DailyCost, FixedPayment, MenuItem, OrderLine, Todo, FixedCost, Meal, PaymentMethod } from "../types";
import { addDays } from "../calc/dates";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export interface SampleData {
  orders: OrderLine[];
  dailyCosts: DailyCost[];
  fixedPayments: FixedPayment[];
  fixedCosts: FixedCost[];
  movements: CashMovement[];
  todos: Todo[];
}

export function buildSample(menu: MenuItem[], monthlyFixed: FixedCost[], from = "2026-12-01", to = "2027-01-20"): SampleData {
  const r = rng(42);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const byCat = (c: string) => menu.filter((m) => m.category === c);
  const breakfast = byCat("Breakfast");
  const food = byCat("All day dining");
  const drinks = byCat("Drinks");

  const orders: OrderLine[] = [];
  const dailyCosts: DailyCost[] = [];
  let orderNo = 0;
  let costNo = 0;

  const meals: [Meal, string, number, MenuItem[]][] = [
    ["Breakfast", "08:30", 5, breakfast],
    ["Lunch", "13:00", 6, food],
    ["Dinner", "19:30", 9, food],
  ];

  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const [meal, time, avgOrders, mains] of meals) {
      const n = Math.max(1, Math.round(avgOrders * (0.6 + r() * 0.8)));
      for (let i = 0; i < n; i++) {
        orderNo++;
        const order_id = `ORD-${d.replace(/-/g, "")}-${String(orderNo).padStart(4, "0")}`;
        const pay: PaymentMethod = r() < 0.55 ? "Cash" : r() < 0.85 ? "Card" : "Bank transfer";
        const items: [MenuItem, number][] = [[pick(mains), 1 + (r() < 0.3 ? 1 : 0)], [pick(drinks), 1 + (r() < 0.4 ? 1 : 0)]];
        items.forEach(([m, qty], li) =>
          orders.push({
            line_id: `${order_id}-${li + 1}`,
            order_id,
            date: d,
            time,
            meal,
            item_id: m.item_id,
            item_name: m.item_name,
            qty,
            unit_price: m.selling_price,
            line_total: qty * m.selling_price,
            unit_cost: m.unit_cost,
            line_cost: qty * m.unit_cost,
            payment_method: pay,
            notes: "",
            entered_by: "sample",
          }),
        );
      }
    }
    const cost = (category: string, description: string, amount: number, paid_from: DailyCost["paid_from"] = "Petty cash", paid_by: DailyCost["paid_by"] = "Business") =>
      dailyCosts.push({ cost_id: `C-${String(++costNo).padStart(5, "0")}`, date: d, category, description, amount, paid_from, paid_by, notes: "", entered_by: "sample" });
    cost("Food & ingredients", "Market – vegetables, fish", Math.round((24000 + r() * 12000) / 100) * 100);
    cost("Drinks & beverages", "Fruit, milk, coffee", Math.round((7000 + r() * 5000) / 100) * 100);
    if (r() < 0.25) cost("Gas & fuel", "Gas cylinder", 4500);
    if (r() < 0.2) cost("Cleaning", "Cleaning supplies", 1800);
    if (r() < 0.1) cost("Transport", "Tuk-tuk to market", 1500, "Petty cash", r() < 0.5 ? "Rajitha" : "Janith");
    if (r() < 0.05) cost("Repairs & maintenance", "Plumber", 6500, "Bank");
  }

  const fixedPayments: FixedPayment[] = [];
  let payNo = 0;
  for (const month of ["2026-12", "2027-01"]) {
    for (const f of monthlyFixed) {
      if (month === "2027-01" && (f.name === "Marketing" || f.name === "Promotions")) continue; // leave some unpaid
      const amount = f.name === "Utility bills" ? f.amount + (month === "2026-12" ? 3500 : -1200) : f.amount;
      fixedPayments.push({
        payment_id: `P-${String(++payNo).padStart(4, "0")}`,
        fixed_id: f.fixed_id,
        month,
        amount,
        paid_date: `${month}-05`,
        paid_from: f.name === "Staff salary" ? "Petty cash" : "Bank",
        notes: "",
      });
    }
  }

  const fixedCosts: FixedCost[] = [
    { fixed_id: "F90", name: "Chest freezer", amount: 145_000, frequency: "One-time", start_month: "", end_month: "", month_paid: "2027-01", paid_from: "Bank", notes: "sample" },
  ];

  const movements: CashMovement[] = [
    { movement_id: "M-0001", date: "2026-11-30", account: "Petty cash", type: "Opening balance", amount: 50_000, notes: "Float", moved_by: "Rajitha" },
    { movement_id: "M-0003", date: "2026-12-15", account: "Petty cash", type: "Cash sales deposit", amount: 250_000, notes: "Deposit to bank", moved_by: "Janith" },
    { movement_id: "M-0004", date: "2026-12-31", account: "Petty cash", type: "Cash sales deposit", amount: 300_000, notes: "Deposit to bank", moved_by: "Janith" },
    { movement_id: "M-0005", date: "2027-01-10", account: "Bank", type: "Transfer bank→petty", amount: 40_000, notes: "Change float", moved_by: "Rajitha" },
    { movement_id: "M-0006", date: "2027-01-15", account: "Petty cash", type: "Cash sales deposit", amount: 420_000, notes: "Deposit to bank", moved_by: "Janith" },
  ];

  const todos: Todo[] = [
    { task_id: "T-001", task: "Renew trade licence", owner: "Rajitha", due_date: "2027-01-12", priority: "High", done: false, done_date: "", booking_id: "" },
    { task_id: "T-002", task: "Service coffee machine", owner: "Staff", due_date: "2027-01-21", priority: "Medium", done: false, done_date: "", booking_id: "" },
    { task_id: "T-003", task: "Print new menu cards", owner: "Janith", due_date: "2027-01-22", priority: "Medium", done: false, done_date: "", booking_id: "" },
    { task_id: "T-004", task: "Order gas cylinders (x4)", owner: "Staff", due_date: "2027-01-30", priority: "Low", done: false, done_date: "", booking_id: "" },
    { task_id: "T-005", task: "Instagram post – sunset menu", owner: "Janith", due_date: "2027-02-05", priority: "Low", done: false, done_date: "", booking_id: "" },
    { task_id: "T-006", task: "Fix villa room 2 shower", owner: "Rajitha", due_date: "2027-02-10", priority: "High", done: false, done_date: "", booking_id: "" },
    { task_id: "T-007", task: "Opening day flyers", owner: "Janith", due_date: "2026-11-28", priority: "High", done: true, done_date: "2026-11-27", booking_id: "" },
  ];

  return { orders, dailyCosts, fixedPayments, fixedCosts, movements, todos };
}
