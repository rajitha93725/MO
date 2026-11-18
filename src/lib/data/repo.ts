import "server-only";
import { getStore } from "./index";
import type { Row } from "./store";
import type {
  CashMovement, DailyCost, FixedCost, FixedPayment, MenuItem, OrderLine, PriceHistory, Settings, SettingRow, TargetPeriod, Todo, UserRow, VillaRecord, CapitalContribution,
} from "../types";
import { parseSettings } from "../settings";
import { isPaidLine } from "../types";
import { villaRowAccounts } from "../calc/cash";

// Typed repository used by pages and server actions. Everything storage-specific stays behind getStore().

const as = <T,>(rows: Row[]) => rows as unknown as T[];
const row = (o: object) => o as unknown as Row;


export const repo = {
  menu: async () => as<MenuItem>(await getStore().list("menu")),
  priceHistory: async () => as<PriceHistory>(await getStore().list("priceHistory")),
  /** Every order line, including open bills and voided items. */
  orderLines: async () => as<OrderLine>(await getStore().list("orders")),
  /** Paid order lines only: what counts as sales, cash and profit everywhere. */
  orders: async () => as<OrderLine>(await getStore().list("orders")).filter(isPaidLine),
  /** All order lines read without any cache. */
  ordersFresh: async () => {
    const s = getStore();
    return as<OrderLine>(await (s.listFresh ? s.listFresh("orders") : s.list("orders")));
  },
  dailyCosts: async () => as<DailyCost>(await getStore().list("dailyCosts")),
  fixedCosts: async () => as<FixedCost>(await getStore().list("fixedCosts")),
  fixedPayments: async () => as<FixedPayment>(await getStore().list("fixedPayments")),
  movements: async () => as<CashMovement>(await getStore().list("cash")),
  todos: async () => as<Todo>(await getStore().list("todo")),
  users: async () => as<UserRow>(await getStore().list("users")),
  settingRows: async () => as<SettingRow>(await getStore().list("settings")),
  targets: async () => as<TargetPeriod>(await getStore().list("targets")),
  // Villa money never sits in the cafe's petty cash: rows saved before the two cash boxes were split say
  // "Petty cash", which for the villa means its own box.
  villa: async () => as<VillaRecord>(await getStore().list("villa")).map(villaRowAccounts),
  capital: async () => as<CapitalContribution>(await getStore().list("capital")),

  async settings(): Promise<Settings> {
    const [rows, targets] = await Promise.all([this.settingRows(), this.targets()]);
    return parseSettings(rows, targets);
  },

  /** Everything the dashboard / profit / cash screens need, loaded in parallel. */
  async all() {
    const [settings, menu, orderLines, dailyCosts, fixedCosts, fixedPayments, movements, todos, villa, capital] = await Promise.all([
      this.settings(), this.menu(), this.orderLines(), this.dailyCosts(), this.fixedCosts(), this.fixedPayments(), this.movements(), this.todos(), this.villa(), this.capital(),
    ]);
    // `orders` = paid lines (sales); `orderLines` also has open bills and voided items.
    const orders = orderLines.filter(isPaidLine);
    return { settings, menu, orders, orderLines, dailyCosts, fixedCosts, fixedPayments, movements, todos, villa, capital };
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
