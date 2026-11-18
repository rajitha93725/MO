// Supabase (Postgres) storage, through Supabase's REST API with the project's secret key.
// Tables and columns come from schema.ts (see supabaseSql.ts / supabase/schema.sql).
// No cache: every read is fresh from the database.

import { BOOLEAN_COLUMNS, HEADERS, ID_COLUMN, NUMBER_COLUMNS, TABS, type TabKey } from "./schema";
import { tableName } from "./supabaseSql";
import type { DataStore, Row } from "./store";

/** Supabase returns at most 1000 rows per request, so reads are paged. */
export const PAGE = 1000;
const INSERT_CHUNK = 500;

/** Database value -> the app's type for that column. */
export function fromDb(col: string, v: unknown): string | number | boolean {
  if (BOOLEAN_COLUMNS.has(col)) return v === true || v === "true";
  if (NUMBER_COLUMNS.has(col)) {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  }
  return v === undefined || v === null ? "" : String(v);
}

/** App value -> database value (only the tab's known columns are sent). */
export function toDb(tab: TabKey, r: Row): Record<string, string | number | boolean> {
  const o: Record<string, string | number | boolean> = {};
  for (const col of HEADERS[tab]) {
    if (!(col in r)) continue;
    const v = r[col];
    if (BOOLEAN_COLUMNS.has(col)) o[col] = typeof v === "string" ? ["yes", "true", "1", "y", "done"].includes(v.trim().toLowerCase()) : Boolean(v);
    else if (NUMBER_COLUMNS.has(col)) {
      const n = Number(String(v ?? "").replace(/[, ]/g, "") || 0);
      o[col] = Number.isFinite(n) ? n : 0;
    } else o[col] = v === undefined || v === null ? "" : String(v);
  }
  return o;
}

export class SupabaseStore implements DataStore {
  private base: string;

  constructor(url: string, private key: string, private fetchFn: typeof fetch = fetch) {
    // Accept the project URL or the "Data API" URL (…/rest/v1/).
    this.base = url.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "") + "/rest/v1";
  }

  private async req(path: string, init: RequestInit & { prefer?: string } = {}): Promise<any> {
    const { prefer, ...rest } = init;
    const res = await this.fetchFn(`${this.base}${path}`, {
      ...rest,
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        ...(prefer ? { Prefer: prefer } : {}),
      },
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text;
      try {
        const j = JSON.parse(text);
        msg = [j.message, j.details, j.hint].filter(Boolean).join(" – ");
      } catch {}
      throw new Error(`Supabase ${res.status}: ${msg}`);
    }
    return text ? JSON.parse(text) : null;
  }

  private convert(tab: TabKey, rows: any[]): Row[] {
    return rows.map((r) => {
      const o: Row = {};
      for (const col of HEADERS[tab]) o[col] = fromDb(col, r[col]);
      return o;
    });
  }

  private idFilter(tab: TabKey, id: string) {
    return `${encodeURIComponent(ID_COLUMN[tab])}=eq.${encodeURIComponent(id)}`;
  }

  async list(tab: TabKey): Promise<Row[]> {
    const select = HEADERS[tab].join(",");
    const out: Row[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const rows: any[] = await this.req(`/${tableName(tab)}?select=${select}&order=seq.asc&limit=${PAGE}&offset=${offset}`);
      out.push(...this.convert(tab, rows));
      if (rows.length < PAGE) break;
    }
    return out;
  }

  /** Every read is already fresh. */
  listFresh(tab: TabKey): Promise<Row[]> {
    return this.list(tab);
  }

  async insert(tab: TabKey, rows: Row[], opts: { ignoreDuplicates?: boolean } = {}): Promise<void> {
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const body = rows.slice(i, i + INSERT_CHUNK).map((r) => toDb(tab, r));
      const conflict = opts.ignoreDuplicates ? `?on_conflict=${encodeURIComponent(ID_COLUMN[tab])}` : "";
      await this.req(`/${tableName(tab)}${conflict}`, {
        method: "POST",
        body: JSON.stringify(body),
        prefer: opts.ignoreDuplicates ? "return=minimal,resolution=ignore-duplicates" : "return=minimal",
      });
    }
  }

  async update(tab: TabKey, id: string, patch: Row): Promise<void> {
    const done: any[] = await this.req(`/${tableName(tab)}?${this.idFilter(tab, id)}`, {
      method: "PATCH",
      body: JSON.stringify(toDb(tab, patch)),
      prefer: "return=representation",
    });
    if (!done.length) throw new Error(`${TABS[tab]}: no row with ${ID_COLUMN[tab]} = ${id}`);
  }

  async remove(tab: TabKey, id: string): Promise<void> {
    const done: any[] = await this.req(`/${tableName(tab)}?${this.idFilter(tab, id)}`, { method: "DELETE", prefer: "return=representation" });
    if (!done.length) throw new Error(`${TABS[tab]}: no row with ${ID_COLUMN[tab]} = ${id}`);
  }

  /** Delete + insert in one database transaction, so a failure never leaves the table empty. */
  async replaceAll(tab: TabKey, rows: Row[]): Promise<void> {
    await this.req(`/rpc/mo_replace_all`, {
      method: "POST",
      body: JSON.stringify({ tbl: tableName(tab), rows: rows.map((r) => toDb(tab, r)) }),
    });
  }
}
