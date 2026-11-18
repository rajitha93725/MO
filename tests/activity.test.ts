import { describe, expect, it } from "vitest";
import { businessOf, filterLogs, visibleLogs } from "../src/lib/activity";
import type { ActivityLog } from "../src/lib/types";

const l = (p: Partial<ActivityLog>): ActivityLog => ({ log_id: Math.random().toString(36), at: "2026-11-19 12:00", business: "MO Cafe", category: "Order", action: "Order opened (kitchen)", detail: "", ref: "", by_name: "Kasun", ...p });
const logs = [
  l({ at: "2026-11-19 12:10", category: "Payment", action: "Bill paid", detail: "Garden 2 · 261119_021 · Rs 5,400 · Card" }),
  l({ at: "2026-11-19 09:05", business: "MO Villa", category: "Booking", action: "Booking added", detail: "Room 2 · Anna" }),
  l({ at: "2026-11-18 20:00", business: "Admin", category: "Settings", action: "Settings saved", by_name: "Rajitha" }),
  l({ at: "2026-11-17 08:00", category: "Daily cost", action: "Cost added", detail: "Milk · Rs 5,000" }),
];

describe("activity logs", () => {
  it("other partners see MO Cafe only; the owner sees all", () => {
    expect(visibleLogs(logs, false).map((x) => x.business)).toEqual(["MO Cafe", "MO Cafe"]);
    expect(visibleLogs(logs, true)).toHaveLength(4);
  });
  it("filters by business, category, dates and text, newest first", () => {
    expect(filterLogs(logs, {}).map((x) => x.at)).toEqual(["2026-11-19 12:10", "2026-11-19 09:05", "2026-11-18 20:00", "2026-11-17 08:00"]);
    expect(filterLogs(logs, { business: "MO Villa" }).map((x) => x.action)).toEqual(["Booking added"]);
    expect(filterLogs(logs, { category: "Daily cost" })).toHaveLength(1);
    expect(filterLogs(logs, { from: "2026-11-18", to: "2026-11-18" }).map((x) => x.action)).toEqual(["Settings saved"]);
    expect(filterLogs(logs, { q: "garden 2" }).map((x) => x.action)).toEqual(["Bill paid"]);
    expect(filterLogs(logs, { q: "rajitha" }).map((x) => x.action)).toEqual(["Settings saved"]);
  });
  it("business labels", () => {
    expect([businessOf("cafe"), businessOf("villa"), businessOf("admin")]).toEqual(["MO Cafe", "MO Villa", "Admin"]);
  });
});
