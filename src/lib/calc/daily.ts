import type { ISODate, Meal, MenuItem, OrderLine, Settings, Todo } from "../types";
import { MEALS } from "../types";
import { daysBetween, monthOf } from "./dates";
import { ratio, sum } from "./money";
import { targetFor } from "../settings";

export interface MealSummary {
  meal: Meal;
  sales: number;
  foodCost: number;
  grossProfit: number;
  foodCostPct: number | null;
  target: number;
}

export interface DaySummary {
  date: ISODate;
  meals: MealSummary[];
  sales: number;
  foodCost: number;
  grossProfit: number;
  foodCostPct: number | null;
  target: number;
  vsTarget: number;
  orders: number;
}

function mealTarget(meal: Meal, date: ISODate, settings: Pick<Settings, "targets" | "closed_months">): number {
  const t = targetFor(monthOf(date), settings.targets);
  if (!t) return 0;
  if (meal === "Breakfast") return t.daily_target_breakfast;
  if (meal === "Lunch") return t.daily_target_lunch;
  return t.daily_target_dinner;
}

export function daySummary(date: ISODate, orders: OrderLine[], settings: Pick<Settings, "targets" | "closed_months">): DaySummary {
  const day = orders.filter((o) => o.date === date);
  const meals = MEALS.map((meal) => {
    const rows = day.filter((o) => o.meal === meal);
    const sales = sum(rows, (r) => r.line_total);
    const foodCost = sum(rows, (r) => r.line_cost);
    return { meal, sales, foodCost, grossProfit: sales - foodCost, foodCostPct: ratio(foodCost, sales), target: mealTarget(meal, date, settings) };
  });
  const sales = sum(meals, (m) => m.sales);
  const foodCost = sum(meals, (m) => m.foodCost);
  const target = sum(meals, (m) => m.target);
  return {
    date,
    meals,
    sales,
    foodCost,
    grossProfit: sales - foodCost,
    foodCostPct: ratio(foodCost, sales),
    target,
    vsTarget: sales - target,
    orders: new Set(day.map((o) => o.order_id)).size,
  };
}

// ---------- Menu ----------

export interface MenuStats {
  profit: number;
  foodCostPct: number | null;
  aboveTarget: boolean;
}

export function menuStats(item: Pick<MenuItem, "unit_cost" | "selling_price">, settings: Pick<Settings, "food_cost_target_pct">): MenuStats {
  const r = ratio(item.unit_cost, item.selling_price);
  return {
    profit: item.selling_price - item.unit_cost,
    foodCostPct: r,
    aboveTarget: r !== null && r * 100 > settings.food_cost_target_pct,
  };
}

// ---------- To-do ----------

export type TodoUrgency = "overdue" | "soon" | "normal" | "done";

export function todoUrgency(t: Todo, today: ISODate, settings: Pick<Settings, "todo_amber_days">): TodoUrgency {
  if (t.done) return "done";
  if (!t.due_date) return "normal";
  const d = daysBetween(today, t.due_date);
  if (d < 0) return "overdue";
  if (d <= settings.todo_amber_days) return "soon";
  return "normal";
}

/** Open tasks sorted by due date (tasks without a due date last). */
export function activeTodos(todos: Todo[]): Todo[] {
  return todos
    .filter((t) => !t.done)
    .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999") || a.task.localeCompare(b.task));
}

export function doneTodos(todos: Todo[]): Todo[] {
  return todos.filter((t) => t.done).sort((a, b) => (b.done_date || "").localeCompare(a.done_date || ""));
}
