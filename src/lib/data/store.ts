import type { TabKey } from "./schema";

export type Row = Record<string, string | number | boolean>;

/**
 * Storage contract. The app only talks to storage through this interface
 * (via repo.ts). To move to Supabase/Firebase, implement these five methods
 * against tables/collections with the same names and columns as schema.ts,
 * and return it from getStore() in ./index.ts. No UI code changes.
 */
export interface DataStore {
  list(tab: TabKey): Promise<Row[]>;
  insert(tab: TabKey, rows: Row[]): Promise<void>;
  update(tab: TabKey, id: string, patch: Row): Promise<void>;
  remove(tab: TabKey, id: string): Promise<void>;
  /** Replace all rows of a tab (used for Settings / Targets / Users editing). */
  replaceAll(tab: TabKey, rows: Row[]): Promise<void>;
}
