import "server-only";
import { MemoryStore } from "./memoryStore";
import { SupabaseStore } from "./supabaseStore";
import type { DataStore, Row } from "./store";
import { seedFixedCosts, seedMenu, seedSettingsRows, seedTargets, seedUsers } from "./seed";
import { buildSample } from "./sample";
import { buildVillaSample } from "./sampleVilla";

declare global {
  // eslint-disable-next-line no-var
  var __moStore: DataStore | undefined;
}

function demoStore(): DataStore {
  const menu = seedMenu();
  const fixed = seedFixedCosts();
  const s = buildSample(menu, fixed);
  const rows = (a: object[]) => a as unknown as Row[];
  return new MemoryStore({
    menu: rows(menu),
    fixedCosts: rows([...fixed, ...s.fixedCosts]),
    fixedPayments: rows(s.fixedPayments),
    orders: rows(s.orders),
    dailyCosts: rows(s.dailyCosts),
    cash: rows(s.movements),
    todo: rows([...s.todos, { task_id: "T-008", task: "Change bedsheets Room 1 before check-in", owner: "Staff", due_date: "2027-01-18", priority: "High", done: false, done_date: "", booking_id: "VB-10", villa: true }]),
    villa: rows(buildVillaSample()),
    // sample opening budget: Rajitha ~95%, Janith ~5% (demo only)
    capital: rows([
      { capital_id: "CAP-1", date: "2026-11-01", partner: "Rajitha", business: "Both", description: "Working capital to business bank", amount: 600_000, paid_into: "Bank", notes: "" },
      { capital_id: "CAP-2", date: "2026-11-05", partner: "Rajitha", business: "MO Cafe", description: "Kitchen equipment & fit-out", amount: 1_200_000, paid_into: "Paid directly", notes: "" },
      { capital_id: "CAP-3", date: "2026-11-10", partner: "Rajitha", business: "MO Villa", description: "Furniture, beds & linen", amount: 900_000, paid_into: "Paid directly", notes: "" },
      { capital_id: "CAP-4", date: "2026-11-12", partner: "Janith", business: "MO Cafe", description: "Cooking utensils", amount: 95_000, paid_into: "Paid directly", notes: "" },
      { capital_id: "CAP-5", date: "2026-11-20", partner: "Janith", business: "Both", description: "Petty cash float", amount: 40_000, paid_into: "Petty cash", notes: "" },
    ]),
    settings: seedSettingsRows(),
    targets: seedTargets(),
    users: rows(seedUsers()),
  });
}

// The Supabase store lives in a module variable, so a code reload (dev hot reload) always gets the
// current code. The demo memory store is kept on globalThis so its data survives reloads.
let supabaseStore: DataStore | undefined;

/** The one place that decides which storage backend the app uses. */
export function getStore(): DataStore {
  const backend = process.env.DATA_BACKEND ?? "supabase";
  if (backend === "memory") {
    globalThis.__moStore ??= demoStore();
    return globalThis.__moStore;
  }
  if (backend !== "supabase") throw new Error(`Unknown DATA_BACKEND "${backend}" (use supabase, or memory for the demo).`);
  if (supabaseStore) return supabaseStore;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SECRET_KEY (see README → Setup).");
  supabaseStore = new SupabaseStore(url, key);
  return supabaseStore;
}
