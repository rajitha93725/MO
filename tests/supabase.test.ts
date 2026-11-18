import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAGE, SupabaseStore, fromDb, toDb } from "../src/lib/data/supabaseStore";
import { supabaseSchemaSql, tableName } from "../src/lib/data/supabaseSql";
import { HEADERS, TABS, type TabKey } from "../src/lib/data/schema";

type Call = { url: string; method: string; headers: Record<string, string>; body?: any };

function fakeFetch(respond: (c: Call) => unknown, status = 200) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit = {}) => {
    const c: Call = { url, method: init.method ?? "GET", headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    const out = respond(c);
    return new Response(out === undefined ? "" : JSON.stringify(out), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("Supabase schema", () => {
  it("supabase/schema.sql is up to date (run npm run supabase:sql)", () => {
    expect(readFileSync("supabase/schema.sql", "utf-8").replace(/\r\n/g, "\n")).toBe(supabaseSchemaSql());
  });
  it("has a table and every column for each tab, with row level security on", () => {
    const sql = supabaseSchemaSql();
    for (const tab of Object.keys(TABS) as TabKey[]) {
      expect(sql).toContain(`create table if not exists public.${tableName(tab)} (`);
      expect(sql).toContain(`alter table public.${tableName(tab)} enable row level security;`);
      for (const col of HEADERS[tab]) expect(sql).toContain(`"${col}"`);
    }
    expect(tableName("dailyCosts")).toBe("daily_costs");
    expect(sql).toContain(`"qty" numeric not null default 0`);
    expect(sql).toContain(`"villa" boolean not null default false`);
  });
});

describe("SupabaseStore", () => {
  const key = "sb_secret_test";
  it("accepts the Data API url and sends the key", async () => {
    const f = fakeFetch(() => []);
    await new SupabaseStore("https://x.supabase.co/rest/v1/", key, f.fn).list("users");
    expect(f.calls[0].url).toBe("https://x.supabase.co/rest/v1/users?select=email,name,role,username,password_hash&order=seq.asc&limit=1000&offset=0");
    expect(f.calls[0].headers.apikey).toBe(key);
    expect(f.calls[0].headers.Authorization).toBe(`Bearer ${key}`);
  });
  it("reads past the 1000-row limit page by page and converts types", async () => {
    const row = (i: number) => ({ line_id: `L${i}`, qty: "2", line_total: 3900, notes: null });
    const f = fakeFetch((c) => {
      const offset = Number(new URL(c.url).searchParams.get("offset"));
      return offset === 0 ? Array.from({ length: PAGE }, (_, i) => row(i)) : [row(PAGE)];
    });
    const rows = await new SupabaseStore("https://x.supabase.co", key, f.fn).list("orders");
    expect(f.calls).toHaveLength(2);
    expect(rows).toHaveLength(PAGE + 1);
    expect(rows[0]).toMatchObject({ line_id: "L0", qty: 2, line_total: 3900, notes: "", item_name: "" });
  });
  it("update and delete fail clearly when the id does not exist", async () => {
    const s = new SupabaseStore("https://x.supabase.co", key, fakeFetch(() => []).fn);
    await expect(s.update("todo", "T-9", { done: true })).rejects.toThrow("Todo: no row with task_id = T-9");
    await expect(s.remove("orders", "L9")).rejects.toThrow("Orders: no row with line_id = L9");
  });
  it("update sends only known columns, filtered by id", async () => {
    const f = fakeFetch(() => [{}]);
    await new SupabaseStore("https://x.supabase.co", key, f.fn).update("todo", "T 1", { done: "yes", bogus: 1 } as any);
    expect(f.calls[0].method).toBe("PATCH");
    expect(f.calls[0].url).toContain("/todo?task_id=eq.T%201");
    expect(f.calls[0].body).toEqual({ done: true });
  });
  it("replaceAll uses one transaction (rpc)", async () => {
    const f = fakeFetch(() => undefined);
    await new SupabaseStore("https://x.supabase.co", key, f.fn).replaceAll("settings", [{ key: "a", value: 5, description: "" }]);
    expect(f.calls[0].url).toBe("https://x.supabase.co/rest/v1/rpc/mo_replace_all");
    expect(f.calls[0].body).toEqual({ tbl: "settings", rows: [{ key: "a", value: "5", description: "" }] });
  });
  it("shows Supabase's error message", async () => {
    const s = new SupabaseStore("https://x.supabase.co", key, fakeFetch(() => ({ message: "relation missing", hint: "run schema.sql" }), 404).fn);
    await expect(s.list("menu")).rejects.toThrow("Supabase 404: relation missing – run schema.sql");
  });
  it("converts values both ways", () => {
    expect(toDb("menu", { item_id: "A1", selling_price: "1,950", active: "no", unit_cost: "" })).toEqual({ item_id: "A1", selling_price: 1950, active: false, unit_cost: 0 });
    expect(fromDb("active", true)).toBe(true);
    expect(fromDb("amount", "12.5")).toBe(12.5);
    expect(fromDb("date", null)).toBe("");
  });
});
