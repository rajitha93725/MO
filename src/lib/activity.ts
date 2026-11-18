// MO Activity Logs: one line per action (order opened, bill printed, paid, voided, cost saved, booking changed, …).
// Pure helpers; the server writes lines through logActivity() in actions.ts.

import type { ActivityLog, LogBusiness } from "./types";

/** Lines a user may see: the owner sees everything, other partners MO Cafe only. */
export function visibleLogs(logs: ActivityLog[], owner: boolean): ActivityLog[] {
  return owner ? logs : logs.filter((l) => l.business === "MO Cafe");
}

export interface LogFilter {
  business?: string;
  category?: string;
  from?: string;
  to?: string;
  q?: string;
}

/** Newest first, filtered by business, category, date range (YYYY-MM-DD) and free text. */
export function filterLogs(logs: ActivityLog[], f: LogFilter): ActivityLog[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return logs
    .filter((l) => !f.business || l.business === f.business)
    .filter((l) => !f.category || l.category === f.category)
    .filter((l) => !f.from || l.at.slice(0, 10) >= f.from)
    .filter((l) => !f.to || l.at.slice(0, 10) <= f.to)
    .filter((l) => !q || `${l.action} ${l.detail} ${l.ref} ${l.by_name}`.toLowerCase().includes(q))
    .sort((a, b) => b.at.localeCompare(a.at) || b.log_id.localeCompare(a.log_id));
}

/** Business of a villa / cafe / shared item, for logs. Shared ("Both") money is owner-only (Admin). */
export function businessOf(kind: "cafe" | "villa" | "admin"): LogBusiness {
  return kind === "villa" ? "MO Villa" : kind === "admin" ? "Admin" : "MO Cafe";
}
