// Line pricing with item discounts and add-ons, and the bill discount. Pure (used on screen, on the server and in tests).
//
// line total = qty × unit price − item discount + add-ons
//   - the item discount (% or Rs) is taken from qty × unit price only, never from the add-ons
//   - add-ons (extra cheese, extra egg, …) each have their own price and quantity
// bill discount (% or Rs) = taken from the bill subtotal (all line totals); saved as its own line so every total stays right.

export type DiscountType = "%" | "Rs" | "";

export interface Addon {
  /** Menu add-on item id, or "" for a typed one. */
  item_id: string;
  name: string;
  /** Price of one (already in the order's channel, e.g. Uber price). */
  price: number;
  qty: number;
  /** Cost of one (food cost); 0 for typed add-ons. */
  cost: number;
}

/** Order line id used for the bill discount line. */
export const BILL_DISCOUNT_ID = "BILL-DISCOUNT";
export const isDiscountLine = (l: { item_id: string }) => l.item_id === BILL_DISCOUNT_ID;

/** Discount in rupees: a % of the amount (max 100%), or a fixed Rs amount (max the amount). */
export function discountAmount(amount: number, type: DiscountType | string, value: number): number {
  const v = Number(value) || 0;
  if (amount <= 0 || v <= 0) return 0;
  if (type === "%") return Math.round((amount * Math.min(v, 100)) / 100);
  if (type === "Rs") return Math.min(Math.round(v), Math.round(amount));
  return 0;
}

/** "10%" or "Rs 200" (or "" when there is no discount). */
export function discountLabel(type: DiscountType | string, value: number): string {
  if (!value || (type !== "%" && type !== "Rs")) return "";
  return type === "%" ? `${Number(value)}%` : `Rs ${Math.round(value).toLocaleString("en-US")}`;
}

export function addonsTotal(addons: Pick<Addon, "price" | "qty">[]): number {
  return addons.reduce((t, a) => t + Math.round(a.price) * a.qty, 0);
}

export function addonsCost(addons: Pick<Addon, "cost" | "qty">[]): number {
  return addons.reduce((t, a) => t + (a.cost || 0) * a.qty, 0);
}

export interface LinePrice {
  base: number;
  discount: number;
  addons: number;
  total: number;
}

export function linePrice(qty: number, unitPrice: number, addons: Pick<Addon, "price" | "qty">[], type: DiscountType | string, value: number): LinePrice {
  const base = qty * unitPrice;
  const discount = discountAmount(base, type, value);
  const extra = addonsTotal(addons);
  return { base, discount, addons: extra, total: base - discount + extra };
}

/** Add-ons are stored as JSON text on the order line; anything unreadable is ignored. */
export function parseAddons(json: string | undefined): Addon[] {
  if (!json) return [];
  try {
    const a = JSON.parse(json);
    if (!Array.isArray(a)) return [];
    return a
      .map((x) => ({ item_id: String(x?.item_id ?? ""), name: String(x?.name ?? ""), price: Number(x?.price) || 0, qty: Math.max(1, Math.floor(Number(x?.qty) || 1)), cost: Number(x?.cost) || 0 }))
      .filter((x) => x.name);
  } catch {
    return [];
  }
}

/** Problems with a discount (null when fine). */
export function discountProblem(amount: number, type: DiscountType | string, value: number, what = "Discount"): string | null {
  if (!type) return null;
  if (type !== "%" && type !== "Rs") return `${what}: choose % or Rs`;
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return `${what}: enter an amount above 0`;
  if (type === "%" && v > 100) return `${what}: at most 100%`;
  if (type === "Rs" && v > amount) return `${what}: Rs ${Math.round(v).toLocaleString("en-US")} is more than Rs ${Math.round(amount).toLocaleString("en-US")}`;
  return null;
}
