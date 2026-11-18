import type { Meal } from "../types";

/** Meal is logged from the order time (for reports only): Breakfast 00:01–11:30, Lunch 11:31–16:59, Dinner 17:00–00:00. */
export const MEAL_RULE = "Meal is set from the order time: Breakfast 00:01–11:30, Lunch 11:31–16:59, Dinner 17:00–00:00 (midnight).";

export function mealForTime(time: string): Meal {
  const [h, m] = time.split(":").map((x) => Number(x) || 0);
  const min = h * 60 + m;
  if (min >= 1 && min <= 11 * 60 + 30) return "Breakfast";
  if (min > 11 * 60 + 30 && min < 17 * 60) return "Lunch";
  return "Dinner"; // 17:00 – 23:59 and 00:00
}
