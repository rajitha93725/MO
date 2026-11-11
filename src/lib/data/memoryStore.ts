import { ID_COLUMN, type TabKey } from "./schema";
import type { DataStore, Row } from "./store";

/** In-memory store for local demo and tests. Same contract as SheetsStore. */
export class MemoryStore implements DataStore {
  private data = new Map<TabKey, Row[]>();

  constructor(seed: Partial<Record<TabKey, Row[]>> = {}) {
    for (const [k, rows] of Object.entries(seed)) this.data.set(k as TabKey, rows!.map((r) => ({ ...r })));
  }

  private rows(tab: TabKey) {
    if (!this.data.has(tab)) this.data.set(tab, []);
    return this.data.get(tab)!;
  }

  async list(tab: TabKey) {
    return this.rows(tab).map((r) => ({ ...r }));
  }
  async insert(tab: TabKey, rows: Row[]) {
    this.rows(tab).push(...rows.map((r) => ({ ...r })));
  }
  async update(tab: TabKey, id: string, patch: Row) {
    const r = this.rows(tab).find((x) => String(x[ID_COLUMN[tab]]) === id);
    if (!r) throw new Error(`${tab}: no row ${id}`);
    Object.assign(r, patch);
  }
  async remove(tab: TabKey, id: string) {
    const rows = this.rows(tab);
    const i = rows.findIndex((x) => String(x[ID_COLUMN[tab]]) === id);
    if (i >= 0) rows.splice(i, 1);
  }
  async replaceAll(tab: TabKey, rows: Row[]) {
    this.data.set(tab, rows.map((r) => ({ ...r })));
  }
}
