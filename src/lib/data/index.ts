import "server-only";
import { MemoryStore } from "./memoryStore";
import { SheetsStore } from "./sheetsStore";
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
    todo: rows([...s.todos, { task_id: "T-008", task: "Change bedsheets Room 1 before check-in", owner: "Staff", due_date: "2027-01-18", priority: "High", done: false, done_date: "", booking_id: "VB-10" }]),
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

// Sheets store lives in a module variable, so a code reload (dev hot reload) always gets the
// current SheetsStore code. The demo memory store is kept on globalThis so its data survives reloads.
let sheetsStore: DataStore | undefined;

/** The one place that decides which storage backend the app uses. */
export function getStore(): DataStore {
  const backend = process.env.DATA_BACKEND ?? "sheets";
  if (backend === "memory") {
    globalThis.__moStore ??= demoStore();
    return globalThis.__moStore;
  }
  if (sheetsStore) return sheetsStore;
  const id = process.env.GOOGLE_SHEET_ID;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!id || !email || !key) throw new Error("Missing GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY (see README).");
  sheetsStore = new SheetsStore(id, email, key);
  return sheetsStore;
}
