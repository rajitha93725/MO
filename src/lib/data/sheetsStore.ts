import { JWT } from "google-auth-library";
import { BOOLEAN_COLUMNS, HEADERS, ID_COLUMN, NUMBER_COLUMNS, TABS, type TabKey } from "./schema";
import type { DataStore, Row } from "./store";

const API = "https://sheets.googleapis.com/v4/spreadsheets";
/** After this, cached data is still served instantly but refreshed in the background. */
const STALE_MS = 20_000;
/** After this (e.g. the app sat idle), wait for fresh data instead of showing old data. */
const MAX_AGE_MS = 5 * 60_000;

type TabData = { headers: string[]; rows: Row[]; lastDataRow: number };

export function colLetter(n: number): string {
  // 1 -> A, 27 -> AA
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Convert a raw cell value to the app's type for that column. */
export function fromCell(col: string, v: unknown): string | number | boolean {
  if (BOOLEAN_COLUMNS.has(col)) {
    if (typeof v === "boolean") return v;
    return ["yes", "true", "1", "y", "done"].includes(String(v ?? "").trim().toLowerCase());
  }
  if (NUMBER_COLUMNS.has(col)) {
    const n = Number(String(v ?? "").replace(/[, ]/g, "").replace(/^Rs/i, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return v === undefined || v === null ? "" : String(v);
}

function toCell(col: string, v: unknown): string | number | boolean {
  if (col === "active") return v ? "yes" : "no";
  if (BOOLEAN_COLUMNS.has(col)) return Boolean(v);
  if (v === undefined || v === null) return "";
  return v as string | number;
}

export class SheetsStore implements DataStore {
  private auth: JWT;
  /** All tabs, read together in one batchGet call. */
  private snapshot?: { at: number; gen: number; tabs: Map<TabKey, TabData> };
  private refreshing?: Promise<void>;
  /** Bumped on every write; a snapshot from an older generation is never served. */
  private writeGen = 0;

  constructor(private spreadsheetId: string, clientEmail: string, privateKey: string) {
    this.auth = new JWT({
      email: clientEmail,
      key: privateKey.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  }

  private async req(path: string, init: RequestInit = {}): Promise<any> {
    const { token } = await this.auth.getAccessToken();
    const res = await fetch(`${API}/${this.spreadsheetId}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Google Sheets ${res.status}: ${await res.text()}`);
    return res.json();
  }

  private range(tab: TabKey, a1 = "") {
    return encodeURIComponent(`'${TABS[tab]}'${a1 ? "!" + a1 : ""}`);
  }

  /** Read every tab in ONE request (~0.4 s instead of one request per tab). Concurrent callers share it. */
  private refreshAll(): Promise<void> {
    if (!this.refreshing) {
      const gen = this.writeGen;
      const keys = Object.keys(TABS) as TabKey[];
      const ranges = keys.map((k) => `ranges=${this.range(k)}`).join("&");
      this.refreshing = this.req(`/values:batchGet?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING&${ranges}`)
        .then((data) => {
          const tabs = new Map<TabKey, TabData>();
          keys.forEach((k, i) => tabs.set(k, this.parse(k, data.valueRanges?.[i]?.values ?? [])));
          this.snapshot = { at: Date.now(), gen, tabs };
        })
        .finally(() => {
          this.refreshing = undefined;
        });
    }
    return this.refreshing;
  }

  /**
   * Stale-while-revalidate: cached data is returned immediately; when it is older than STALE_MS a
   * background refresh starts. After a write (or a long idle) we wait for fresh data instead.
   */
  private async load(tab: TabKey): Promise<TabData> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const s = this.snapshot;
      const fresh = s && s.gen === this.writeGen && Date.now() - s.at < MAX_AGE_MS;
      if (fresh) {
        if (Date.now() - s.at > STALE_MS) this.refreshAll().catch(() => {}); // refresh in the background
        return s.tabs.get(tab)!;
      }
      await this.refreshAll();
    }
    return this.snapshot!.tabs.get(tab)!;
  }

  /** One tab, always fresh from Google (used before writes to find row positions). */
  private async fetchTab(tab: TabKey): Promise<TabData & { values: unknown[][] }> {
    const data = await this.req(`/values/${this.range(tab)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);
    const values: unknown[][] = data.values ?? [];
    return { ...this.parse(tab, values), values };
  }

  private parse(tab: TabKey, values: unknown[][]): TabData {
    const headers = (values[0] ?? HEADERS[tab]).map((h) => String(h).trim());
    // A row exists only when its ID column is filled. Empty rows can still hold values
    // (e.g. FALSE from a checkbox column), so "any non-empty cell" is not a safe test.
    const idIdx = Math.max(0, headers.indexOf(ID_COLUMN[tab]));
    const hasId = (r: unknown[]) => String(r[idIdx] ?? "").trim() !== "";
    let lastDataRow = 1; // sheet row number of the last row with an ID (1 = header only)
    values.forEach((r, i) => {
      if (i > 0 && hasId(r)) lastDataRow = i + 1;
    });
    const rows: Row[] = values.slice(1).filter(hasId).map((r) => {
      const o: Row = {};
      headers.forEach((h, i) => (o[h] = fromCell(h, r[i])));
      return o;
    });
    return { headers, rows, lastDataRow };
  }

  private async sheetMeta(tab: TabKey): Promise<{ sheetId: number; rowCount: number }> {
    const meta = await this.req(`?fields=sheets.properties(sheetId,title,gridProperties.rowCount)`);
    const s = meta.sheets.find((x: any) => x.properties.title === TABS[tab]);
    if (!s) throw new Error(`Tab "${TABS[tab]}" not found in the sheet`);
    return { sheetId: s.properties.sheetId, rowCount: s.properties.gridProperties.rowCount };
  }

  /** After a write: the next read waits for fresh data, so users always see their own change. */
  private invalidate(_tab?: TabKey) {
    this.writeGen++;
  }

  async list(tab: TabKey): Promise<Row[]> {
    return (await this.load(tab)).rows.map((r) => ({ ...r }));
  }

  /** Straight from Google, skipping the cache (e.g. a row saved a moment ago by another server). */
  async listFresh(tab: TabKey): Promise<Row[]> {
    return (await this.fetchTab(tab)).rows.map((r) => ({ ...r }));
  }

  async insert(tab: TabKey, rows: Row[]): Promise<void> {
    if (!rows.length) return;
    const { headers, lastDataRow } = await this.fetchTab(tab); // position against fresh data
    const values = rows.map((r) => headers.map((h) => toCell(h, r[h])));
    // Write directly below the last row that has an ID (not values.append, which treats
    // pre-filled checkbox cells as data and would write below them).
    const start = lastDataRow + 1;
    const end = start + values.length - 1;
    const { sheetId, rowCount } = await this.sheetMeta(tab);
    if (end > rowCount) {
      await this.req(`:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ requests: [{ appendDimension: { sheetId, dimension: "ROWS", length: end - rowCount + 500 } }] }),
      });
    }
    const a1 = `A${start}:${colLetter(headers.length)}${end}`;
    await this.req(`/values/${this.range(tab, a1)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values }) });
    this.invalidate(tab);
  }

  /** Returns the 1-based sheet row number of the row with this id (header = row 1). */
  private async findRow(tab: TabKey, id: string): Promise<{ rowNumber: number; headers: string[]; current: Row }> {
    const { headers, values } = await this.fetchTab(tab); // always locate against fresh data before writing
    const idCol = ID_COLUMN[tab];
    const idIdx = headers.indexOf(idCol);
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idIdx] ?? "") === id) {
        const current: Row = {};
        headers.forEach((h, j) => (current[h] = fromCell(h, values[i][j])));
        return { rowNumber: i + 1, headers, current };
      }
    }
    throw new Error(`${TABS[tab]}: no row with ${idCol} = ${id}`);
  }

  async update(tab: TabKey, id: string, patch: Row): Promise<void> {
    const { rowNumber, headers, current } = await this.findRow(tab, id);
    const merged = { ...current, ...patch };
    const values = [headers.map((h) => toCell(h, merged[h]))];
    const a1 = `A${rowNumber}:${colLetter(headers.length)}${rowNumber}`;
    await this.req(`/values/${this.range(tab, a1)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values }) });
    this.invalidate(tab);
  }

  async remove(tab: TabKey, id: string): Promise<void> {
    const { rowNumber } = await this.findRow(tab, id);
    const { sheetId } = await this.sheetMeta(tab);
    await this.req(`:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } }],
      }),
    });
    this.invalidate(tab);
  }

  async replaceAll(tab: TabKey, rows: Row[]): Promise<void> {
    const { headers } = await this.fetchTab(tab);
    await this.req(`/values/${this.range(tab, "A2:" + colLetter(headers.length))}:clear`, { method: "POST", body: "{}" });
    if (rows.length) {
      const values = rows.map((r) => headers.map((h) => toCell(h, r[h])));
      await this.req(`/values/${this.range(tab, "A2")}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values }) });
    }
    this.invalidate(tab);
  }
}
