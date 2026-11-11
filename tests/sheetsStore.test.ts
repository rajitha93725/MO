import { afterEach, describe, expect, it, vi } from "vitest";
import { JWT } from "google-auth-library";
import { SheetsStore } from "../src/lib/data/sheetsStore";
import { TABS } from "../src/lib/data/schema";

// Fake Google Sheets API: a Todo tab whose `done` checkbox column is pre-filled with FALSE on every row.
function fakeSheet(grid: unknown[][], rowCount = 1000) {
  const calls: { method: string; url: string; body?: any }[] = [];
  vi.spyOn(JWT.prototype, "getAccessToken").mockResolvedValue({ token: "t" } as any);
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url: decodeURIComponent(url), body });
    const json = (o: unknown) => ({ ok: true, json: async () => o, text: async () => "" });
    if (url.includes("fields=sheets.properties")) return json({ sheets: [{ properties: { sheetId: 7, title: "Todo", gridProperties: { rowCount } } }] });
    if (url.includes("values:batchGet")) return json({ valueRanges: Object.values(TABS).map((t) => ({ values: t === "Todo" ? grid : [] })) });
    if (method === "GET") return json({ values: grid });
    return json({});
  });
  return calls;
}

const header = ["task_id", "task", "owner", "due_date", "priority", "done", "done_date"];
const empty = ["", "", "", "", "", false];

describe("SheetsStore with pre-filled checkbox rows", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("ignores rows without an ID (no phantom to-dos)", async () => {
    fakeSheet([header, ["T-1", "Real task", "Staff", "2026-12-01", "High", false, ""], empty, empty, empty]);
    const store = new SheetsStore("id", "sa@x", "key");
    const rows = await store.list("todo");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ task_id: "T-1", task: "Real task", done: false });
  });

  it("inserts directly below the last row with an ID, not after the checkbox rows", async () => {
    const calls = fakeSheet([header, ["T-1", "a", "Staff", "2026-12-01", "Low", false, ""], ...Array(998).fill(empty)]);
    const store = new SheetsStore("id", "sa@x", "key");
    await store.insert("todo", [{ task_id: "T-2", task: "b", owner: "Staff", due_date: "2026-12-02", priority: "Low", done: false, done_date: "" }]);
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.url).toContain("'Todo'!A3:G3");
    expect(put.body.values[0].slice(0, 2)).toEqual(["T-2", "b"]);
    expect(calls.some((c) => c.url.includes(":append"))).toBe(false);
  });

  it("inserts at row 2 when the tab only has a header", async () => {
    const calls = fakeSheet([header, empty, empty]);
    await new SheetsStore("id", "sa@x", "key").insert("todo", [{ task_id: "T-1", task: "x", owner: "Staff", due_date: "2026-12-02", priority: "Low", done: false, done_date: "" }]);
    expect(calls.find((c) => c.method === "PUT")!.url).toContain("'Todo'!A2:G2");
  });

  it("grows the grid when the sheet is full", async () => {
    const full = [header, ...Array.from({ length: 9 }, (_, i) => [`T-${i}`, "x", "Staff", "2026-12-01", "Low", false, ""])];
    const calls = fakeSheet(full, 10);
    await new SheetsStore("id", "sa@x", "key").insert("todo", [{ task_id: "T-new", task: "x", owner: "Staff", due_date: "2026-12-02", priority: "Low", done: false, done_date: "" }]);
    const grow = calls.find((c) => c.url.includes(":batchUpdate"));
    expect(grow?.body.requests[0].appendDimension).toMatchObject({ sheetId: 7, dimension: "ROWS" });
    expect(calls.find((c) => c.method === "PUT")!.url).toContain("A11:G11");
  });

  it("reads all tabs in one request and serves repeat reads from cache", async () => {
    const calls = fakeSheet([header, ["T-1", "a", "Staff", "2026-12-01", "Low", false, ""]]);
    const store = new SheetsStore("id", "sa@x", "key");
    await Promise.all([store.list("todo"), store.list("menu"), store.list("settings")]);
    await store.list("todo");
    expect(calls.filter((c) => c.method === "GET").length).toBe(1);
    expect(calls[0].url).toContain("values:batchGet");
  });

  it("after a write, the next read fetches fresh data", async () => {
    const calls = fakeSheet([header, ["T-1", "a", "Staff", "2026-12-01", "Low", false, ""]]);
    const store = new SheetsStore("id", "sa@x", "key");
    await store.list("todo");
    await store.insert("todo", [{ task_id: "T-2", task: "b", owner: "Staff", due_date: "2026-12-02", priority: "Low", done: false, done_date: "" }]);
    await store.list("todo");
    expect(calls.filter((c) => c.url.includes("values:batchGet")).length).toBe(2);
  });
});
