import "server-only";
import { getStore } from "./index";
import type { Row } from "./store";
import type {
  CashMovement, DailyCost, FixedCost, FixedPayment, MenuItem, OrderLine, PriceHistory, Settings, SettingRow, TargetPeriod, Todo, UserRow, VillaRecord, CapitalContribution,
} from "../types";
import { parseSettings } from "../settings";

// Typed repository used by pages and server actions. Everything storage-specific stays behind getStore().

const as = <T,>(rows: Row[]) => rows as unknown as T[];
const row = (o: object) => o as unknown as Row;

export const repo = {
  menu: async () => as<MenuItem>(await getStore().list("menu")),
  priceHistory: async () => as<PriceHistory>(await getStore().list("priceHistory")),
  orders: async () => as<OrderLine>(await getStore().list("orders")),
  dailyCosts: async () => as<DailyCost>(await getStore().list("dailyCosts")),
  fixedCosts: async () => as<FixedCost>(await getStore().list("fixedCosts")),
  fixedPayments: async () => as<FixedPayment>(await getStore().list("fixedPayments")),
  movements: async () => as<CashMovement>(await getStore().list("cash")),
  todos: async () => as<Todo>(await getStore().list("todo")),
  users: async () => as<UserRow>(await getStore().list("users")),
  settingRows: async () => as<SettingRow>(await getStore().list("settings")),
  targets: async () => as<TargetPeriod>(await getStore().list("targets")),
  villa: async () => as<VillaRecord>(await getStore().list("villa")),
  capital: async () => as<CapitalContribution>(await getStore().list("capital")),

  async settings(): Promise<Settings> {
    const [rows, targets] = await Promise.all([this.settingRows(), this.targets()]);
    return parseSettings(rows, targets);
  },

  /** Everything the dashboard / profit / cash screens need, loaded in parallel. */
  async all() {
    const [settings, menu, orders, dailyCosts, fixedCosts, fixedPayments, movements, todos, villa, capital] = await Promise.all([
      this.settings(), this.menu(), this.orders(), this.dailyCosts(), this.fixedCosts(), this.fixedPayments(), this.movements(), this.todos(), this.villa(), this.capital(),
    ]);
    return { settings, menu, orders, dailyCosts, fixedCosts, fixedPayments, movements, todos, villa, capital };
  },

  insert: (tab: Parameters<ReturnType<typeof getStore>["insert"]>[0], rows: object[]) => getStore().insert(tab, rows.map(row)),
  update: (tab: Parameters<ReturnType<typeof getStore>["update"]>[0], id: string, patch: object) => getStore().update(tab, id, row(patch)),
  remove: (tab: Parameters<ReturnType<typeof getStore>["remove"]>[0], id: string) => getStore().remove(tab, id),
  replaceAll: (tab: Parameters<ReturnType<typeof getStore>["replaceAll"]>[0], rows: object[]) => getStore().replaceAll(tab, rows.map(row)),
};

export function newId(prefix: string): string {
  const t = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `${prefix}-${t}-${Math.random().toString(36).slice(2, 6)}`;
}
