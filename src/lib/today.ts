import { timeIn, todayIn } from "./calc/dates";
import type { Settings } from "./types";

/** "Today" in the cafe's timezone. DEMO_TODAY (YYYY-MM-DD) overrides it for demos/tests only. */
export function today(settings: Pick<Settings, "timezone">): string {
  return process.env.DEMO_TODAY || todayIn(settings.timezone);
}

export function nowTime(settings: Pick<Settings, "timezone">): string {
  return timeIn(settings.timezone);
}
