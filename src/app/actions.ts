"use server";

import { revalidatePath } from "next/cache";
import { repo, newId } from "@/lib/data/repo";
import { currentUser, requireAction, type AppUser } from "@/lib/auth";
import { V, ValidationError } from "@/lib/validate";
import { today, nowTime } from "@/lib/today";
import { parsePartners, parseSettings } from "@/lib/settings";
import {
  ORDER_TYPES, VOID_REASONS, orderTypeOf, ACCOUNTS, CAFE_ACCOUNTS, VILLA_ACCOUNTS, CAFE_MOVEMENT_TYPES, TRANSFERS, movementAccounts, ALL_ROOMS, BOOKING_STATUSES, CAPITAL_BUSINESSES, CAPITAL_PAID_INTO, MEALS, MOVED_BY, MOVEMENT_TYPES, PAID_BY,
  PAYMENT_METHODS, PAYOUT_STATUSES, type OrderChannel, PRIORITIES, type CapitalContribution,
  COMMISSION_COST_CATEGORY, VILLA_PAID_FROM, VILLA_RECEIVED_TO,
  isVillaTodo, type ActivityLog, type CashMovement, type LogBusiness, type DailyCost, type FixedCost, type FixedPayment, type MenuItem, type OrderLine, type TargetPeriod, type Todo, type VillaRecord,
} from "@/lib/types";
import { commissionDue, commissionFor, expectedIn, findOverlaps, netPayoutFor, nightsBetween, paidAmount, platformsToClose } from "@/lib/calc/villa";
import { receiptFromLines, type ReceiptOrder } from "@/lib/receipt";
import { BILL_DISCOUNT_ID, addonsCost, discountAmount, discountLabel, discountProblem, linePrice, type Addon } from "@/lib/calc/pricing";
import { mealForTime } from "@/lib/calc/meal";
import { buildUsers, type UserForm } from "@/lib/users";
import { capitalAccountAllowed } from "@/lib/calc/capital";
import { hashPassword, loginLocked, recordLogin, verifyPassword } from "@/lib/password";
import { groupBills, liveLines, nextInvoiceNo, nextLineNo } from "@/lib/calc/bills";
import { UBER_COST_CATEGORY, uberCommission, uberCostId, uberPrice } from "@/lib/calc/uber";

export type ActionResult =
  | { ok: true; message?: string; id?: string; receipt?: ReceiptOrder; ticket?: PrintKind }
  | { ok: false; errors: string[] };

/**
 * One line in MO Activity Logs (action level, not every step). Never stops the action itself if logging fails.
 * business: MO Cafe (all partners see it), MO Villa / Admin (owner only).
 */
async function log(business: LogBusiness, category: string, action: string, detail = "", ref = "") {
  try {
    const [user, settings] = await Promise.all([currentUser(), repo.settings()]);
    const row: ActivityLog = {
      log_id: newId("LOG"), at: `${today(settings)} ${nowTime(settings)}`, business, category, action,
      detail: detail.slice(0, 300), ref, by_name: user?.name || user?.email || "",
    };
    await repo.insert("logs", [row]);
  } catch {
    // logging must never block the work
  }
}
const money = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const billWhere = (b: { order_type: string; table_no: string }) => (b.order_type === "Dine-in" ? b.table_no || "Dine-in" : b.order_type || "Order");

/** What to print after an order action: the customer receipt or a kitchen ticket. */
export type PrintKind = "receipt" | "kitchen" | "kitchen-addon";

async function run(
  fn: () => Promise<string | void | { message: string; id: string; receipt?: ReceiptOrder; ticket?: PrintKind }>,
  paths: string[] = ["/"],
): Promise<ActionResult> {
  try {
    const r = (await fn()) ?? undefined;
    for (const p of paths) revalidatePath(p, "layout");
    return typeof r === "object" ? { ok: true, message: r.message, id: r.id, receipt: r.receipt, ticket: r.ticket } : { ok: true, message: r };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, errors: e.errors };
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
}

// ---------------- Orders (partners + staff) ----------------

/** One item on the order screen, with its options. */
export interface OrderLineInput {
  item_id: string;
  qty: number;
  /** Kitchen note: allergies, more / less spicy, without onions, … */
  note?: string;
  /** Paid add-ons: a menu add-on (item_id) or a typed one (name + price). qty = how many. */
  addons?: { item_id?: string; name?: string; price?: number; qty?: number }[];
  /** Item discount on qty × price only (not the add-ons). */
  discount_type?: string;
  discount_value?: number;
}

export interface OrderInput {
  /** "Uber" = Uber order: Uber prices, paid to Bank, commission saved as a daily cost. Default "Cafe". */
  channel?: OrderChannel;
  /** Dine-in (needs table_no) / Take-away / Uber. */
  order_type?: string;
  table_no?: string;
  /** Ignored: the meal is logged from the order time (calc/meal.ts). Kept for old callers. */
  meal?: string;
  payment_method: string;
  notes?: string;
  date?: string;
  lines: OrderLineInput[];
  /** Discount on the whole bill (% or Rs, taken from the subtotal). Kept up to date when items are added or voided. */
  bill_discount?: { type: string; value: number };
  /** Next-day offer printed at the bottom of the invoice. */
  offer_text?: string;
  /** true = open bill: send to the kitchen now, pay (or complete, for Uber) later. */
  open?: boolean;
  /** Uber orders: the Uber invoice number (typed in; needed to complete the order). */
  invoice_no?: string;
  /** Add these items to this open bill (its type, table and date are kept). */
  bill_id?: string;
}

/** Receipt data for some order lines (sub-category in front of each name; discounts, add-ons and notes under it). */
function receiptFor(lines: OrderLine[], menu: MenuItem[], extra: Partial<ReceiptOrder> = {}): ReceiptOrder {
  return receiptFromLines(lines, (id) => menu.find((m) => m.item_id === id)?.sub_category, extra);
}

/**
 * Keeps an open bill's bill-discount line right after items are added or voided (a % follows the new subtotal;
 * an Rs amount is capped at the subtotal). type "" removes the bill discount.
 */
async function syncBillDiscount(order_id: string, set?: { type: string; value: number }, by = "") {
  const lines = (await repo.orderLines()).filter((l) => l.order_id === order_id);
  const bill = groupBills(lines)[0];
  if (!bill || bill.status !== "Open") return;
  const cur = bill.discount;
  const type = (set ? set.type : cur?.discount_type ?? "") as OrderLine["discount_type"];
  const value = set ? Number(set.value) || 0 : cur?.discount_value ?? 0;
  const amount = discountAmount(bill.subtotal, type, value);
  if (!type || !amount) {
    if (cur) await repo.remove("orders", cur.line_id);
    return;
  }
  const label = `Bill discount ${discountLabel(type, value)}`;
  const patch = { item_name: label, discount_type: type, discount_value: value, discount_amount: amount, unit_price: -amount, line_total: -amount };
  if (cur) {
    if (cur.line_total !== -amount || cur.discount_type !== type || cur.discount_value !== value) await repo.update("orders", cur.line_id, patch);
    return;
  }
  const first = bill.lines[0];
  await repo.insert("orders", [{
    ...first, ...patch, line_id: `${order_id}-${nextLineNo(lines, order_id)}`, item_id: BILL_DISCOUNT_ID, qty: 1,
    unit_cost: 0, line_cost: 0, item_note: "", addons: "", addons_total: 0, offer_text: first.offer_text, entered_by: by || first.entered_by,
  }]);
}

export async function saveOrder(input: OrderInput): Promise<ActionResult> {
  return run(async () => {
    const user = await requireAction("any");
    const settings = await repo.settings();
    const v = new V();
    const all = await repo.orderLines();
    // Adding to an open bill: type, table and date come from the bill.
    const bill = input.bill_id ? groupBills(all.filter((l) => l.order_id === input.bill_id))[0] : undefined;
    if (input.bill_id && (!bill || bill.status !== "Open")) throw new Error("This bill is not open any more (paid or voided).");
    const order_type = bill ? bill.order_type || "Take-away" : v.oneOf("Order type", input.order_type || (input.channel === "Uber" ? "Uber" : ""), ORDER_TYPES);
    const uber = order_type === "Uber";
    const open = Boolean(bill) || Boolean(input.open);
    const table_no = bill ? bill.table_no : order_type === "Dine-in" ? v.oneOf("Table", input.table_no, settings.dining_areas.flatMap((a) => a.tables)) : "";
    const payment_method = open ? "" : uber ? "Uber" : v.oneOf("Payment method", input.payment_method, PAYMENT_METHODS);
    const date = bill ? bill.date : v.date("Date", input.date || today(settings));
    v.check(input.lines.length > 0, "Add at least one item");
    input.lines.forEach((l, i) => v.qty(`Quantity (line ${i + 1})`, l.qty));
    const billDisc = bill ? undefined : input.bill_discount?.type ? { type: input.bill_discount.type, value: Number(input.bill_discount.value) || 0 } : undefined;
    const offer_text = (input.offer_text ?? "").trim().slice(0, 200);
    // Uber: the Uber invoice number is typed in (needed to complete); cafe orders get the next YYMMDD_NNN.
    const uberInvoice = (input.invoice_no ?? "").trim();
    if (uber && !bill) {
      v.check(uberInvoice.length <= 40, "Uber invoice number is too long");
      if (!open) v.check(Boolean(uberInvoice), "Type the Uber invoice number");
      if (uberInvoice) v.check(!all.some((l) => l.invoice_no === uberInvoice && l.status !== "Void"), `Uber invoice ${uberInvoice} is already saved`);
    }
    if (!bill && open && table_no) {
      const busy = groupBills(all).find((b) => b.status === "Open" && b.table_no === table_no);
      v.check(!busy, `${table_no} already has an open bill – add the items to that bill instead`);
    }
    v.done();

    const menu = await repo.menu();
    const order_id = bill ? bill.order_id : newId("ORD");
    const time = nowTime(settings);
    // The meal is not chosen on screen: it is logged from the time, for reports.
    const meal = bill ? bill.lines[0]?.meal ?? mealForTime(time) : mealForTime(time);
    const firstNo = bill ? nextLineNo(all, order_id) : 1;
    const invoice_no = bill ? bill.invoice_no : uber ? uberInvoice : nextInvoiceNo(date, all);
    const channelPrice = (p: number) => (uber ? uberPrice(p, settings) : p);
    const errs: string[] = [];
    const rows: OrderLine[] = input.lines.map((l, i) => {
      const m = menu.find((x) => x.item_id === l.item_id);
      if (!m) throw new ValidationError([`Unknown menu item ${l.item_id}`]);
      if (!m.active) throw new ValidationError([`${m.item_name} is not active`]);
      // Snapshot price & cost at the moment of saving. Uber orders use the Uber price (add-ons too).
      const price = channelPrice(m.selling_price);
      const addons: Addon[] = (l.addons ?? []).map((a) => {
        const qty = Math.max(1, Math.floor(Number(a.qty) || 1));
        if (a.item_id) {
          const x = menu.find((mm) => mm.item_id === a.item_id && mm.active);
          if (!x) { errs.push(`${m.item_name}: add-on ${a.item_id} is not on the menu`); return { item_id: "", name: "", price: 0, qty, cost: 0 }; }
          return { item_id: x.item_id, name: x.item_name, price: channelPrice(x.selling_price), qty, cost: x.unit_cost };
        }
        const name = String(a.name ?? "").trim().slice(0, 60);
        const p = Math.round(Number(a.price));
        if (!name) errs.push(`${m.item_name}: give the extra a name`);
        if (!Number.isFinite(p) || p < 0) errs.push(`${m.item_name}: price of "${name}" must be 0 or more`);
        return { item_id: "", name, price: Math.max(0, p || 0), qty, cost: 0 };
      }).filter((a) => a.name);
      const dtype = (l.discount_type === "%" || l.discount_type === "Rs" ? l.discount_type : "") as OrderLine["discount_type"];
      const dval = dtype ? Number(l.discount_value) || 0 : 0;
      const prob = discountProblem(l.qty * price, dtype, dval, `${m.item_name} discount`);
      if (prob) errs.push(prob);
      const lp = linePrice(l.qty, price, addons, dtype, dval);
      return {
        line_id: `${order_id}-${firstNo + i}`,
        order_id, date, time, meal,
        item_id: m.item_id, item_name: m.item_name, qty: l.qty,
        unit_price: price, line_total: lp.total,
        unit_cost: m.unit_cost, line_cost: l.qty * m.unit_cost + addonsCost(addons),
        payment_method: payment_method as OrderLine["payment_method"], notes: (input.notes ?? "").trim(), entered_by: user.email,
        order_type: order_type as OrderLine["order_type"], table_no, status: open ? "Open" : "Paid", void_by: "", void_reason: "", invoice_no,
        item_note: String(l.note ?? "").trim().slice(0, 200), addons: addons.length ? JSON.stringify(addons) : "", addons_total: lp.addons,
        discount_type: dtype, discount_value: dval, discount_amount: lp.discount, offer_text, printed_at: "",
      };
    });
    if (billDisc) {
      const prob = discountProblem(rows.reduce((t, r) => t + r.line_total, 0), billDisc.type, billDisc.value, "Bill discount");
      if (prob) errs.push(prob);
    }
    if (errs.length) throw new ValidationError(errs);
    // The bill discount is its own line (negative amount), so every total, cash and report figure includes it.
    if (billDisc) {
      const sub = rows.reduce((t, r) => t + r.line_total, 0);
      const amount = discountAmount(sub, billDisc.type, billDisc.value);
      if (amount) rows.push({
        ...rows[0], line_id: `${order_id}-${firstNo + rows.length}`, item_id: BILL_DISCOUNT_ID, item_name: `Bill discount ${discountLabel(billDisc.type, billDisc.value)}`,
        qty: 1, unit_price: -amount, line_total: -amount, unit_cost: 0, line_cost: 0, item_note: "", addons: "", addons_total: 0,
        discount_type: billDisc.type as OrderLine["discount_type"], discount_value: billDisc.value, discount_amount: amount,
      });
    }
    await repo.insert("orders", rows);
    // Items added to an open bill: its bill discount follows the new subtotal.
    if (bill) await syncBillDiscount(order_id);
    const total = rows.reduce((t, r) => t + r.line_total, 0);
    const fmt = (n: number) => `Rs ${n.toLocaleString("en-US")}`;
    const where = order_type === "Dine-in" ? table_no : order_type === "Uber" ? "Uber" : "take-away";
    if (open) {
      // Kitchen ticket with just these items.
      const receipt = receiptFor(rows, menu, { status: "Open" });
      await log("MO Cafe", "Order", bill ? "Items added" : "Order opened (kitchen)", `${where} · ${invoice_no || "no invoice yet"} · ${rows.filter((r) => r.item_id !== BILL_DISCOUNT_ID).map((r) => `${r.qty}× ${r.item_name}`).join(", ")} · ${fmt(total)}`, order_id);
      return bill
        ? { message: `Added to ${where} · ${fmt(total)} more`, id: order_id, receipt, ticket: "kitchen-addon" }
        : { message: `Open bill · ${where} · sent to kitchen`, id: order_id, receipt, ticket: "kitchen" };
    }
    // Everything needed to print the receipt straight away, without reading the order back.
    const receipt = receiptFor(rows, menu);
    if (uber) {
      const commission = await recordUberCommission(order_id, date, meal, total, invoice_no, user.email);
      await log("MO Cafe", "Payment", "Uber order completed", `Uber · ${invoice_no} · ${fmt(total)} · commission ${fmt(commission)}`, order_id);
      return { message: `Uber order saved · ${fmt(total)} · commission ${fmt(commission)} recorded`, id: order_id, receipt, ticket: "receipt" };
    }
    await log("MO Cafe", "Payment", "Order paid", `${where} · ${invoice_no} · ${fmt(total)} · ${payment_method}`, order_id);
    return { message: `Order saved · ${invoice_no} · ${fmt(total)}`, id: order_id, receipt, ticket: "receipt" };
  });
}

/** Uber keeps a % of every completed Uber order: saved as a daily cost (Bank, Business), linked to the order. */
async function recordUberCommission(order_id: string, date: string, meal: string, total: number, invoice_no: string, by: string): Promise<number> {
  const settings = await repo.settings();
  const commission = uberCommission(total, settings);
  const cost_id = uberCostId(order_id);
  if (commission <= 0 || (await repo.dailyCosts()).some((c) => c.cost_id === cost_id)) return commission;
  const cost: DailyCost = {
    cost_id, date, category: UBER_COST_CATEGORY,
    description: `Uber commission · ${meal} · ${invoice_no || order_id}`,
    amount: commission, paid_from: "Bank", paid_by: "Business",
    notes: `Auto: ${settings.uber_commission_pct}% of Rs ${total.toLocaleString("en-US")}`,
    entered_by: by,
  };
  await repo.insert("dailyCosts", [cost]);
  return commission;
}

/**
 * Take payment for an open bill: all its lines become Paid (and count in sales and cash from now).
 * Uber bills are "completed" instead: payment is Uber, the Uber invoice number is required, and the commission is recorded.
 */
export async function payBill(order_id: string, payment_method: string, invoice_no?: string, offer_text?: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireAction("any");
    const all = await repo.orderLines();
    const bill = groupBills(all.filter((l) => l.order_id === order_id))[0];
    if (!bill || bill.status !== "Open") throw new Error("This bill is not open (already paid or voided).");
    const uber = bill.order_type === "Uber";
    const v = new V();
    const method = uber ? "Uber" : v.oneOf("Payment method", payment_method, PAYMENT_METHODS);
    const inv = uber ? (invoice_no ?? bill.invoice_no).trim() : bill.invoice_no;
    if (uber) {
      v.check(Boolean(inv), "Type the Uber invoice number");
      v.check(inv.length <= 40, "Uber invoice number is too long");
      v.check(!all.some((l) => l.order_id !== order_id && l.invoice_no === inv && l.status !== "Void"), `Uber invoice ${inv} is already saved`);
    }
    v.done();
    const live = liveLines(bill);
    const offer = offer_text === undefined ? live.find((l) => l.offer_text)?.offer_text ?? "" : offer_text.trim().slice(0, 200);
    for (const l of live) await repo.update("orders", l.line_id, { status: "Paid", payment_method: method, invoice_no: inv, offer_text: offer });
    const menu = await repo.menu();
    const paid = live.map((l) => ({ ...l, status: "Paid" as const, payment_method: method as OrderLine["payment_method"], invoice_no: inv, offer_text: offer }));
    const fmt = (n: number) => `Rs ${n.toLocaleString("en-US")}`;
    if (uber) {
      const commission = await recordUberCommission(order_id, bill.date, bill.lines[0]?.meal ?? "", bill.total, inv, user.email);
      await log("MO Cafe", "Payment", "Uber order completed", `Uber · ${inv} · ${fmt(bill.total)} · commission ${fmt(commission)}`, order_id);
      return { message: `Uber order completed · ${inv} · commission ${fmt(commission)} recorded`, id: order_id, receipt: receiptFor(paid, menu), ticket: "receipt" };
    }
    await log("MO Cafe", "Payment", "Bill paid", `${billWhere(bill)} · ${inv} · ${fmt(bill.total)} · ${method}`, order_id);
    return { message: `Paid · ${fmt(bill.total)} · ${method}`, id: order_id, receipt: receiptFor(paid, menu), ticket: "receipt" };
  });
}

/**
 * Print the bill for the table, before payment: saves the bill discount and the next-day offer first, so the paper
 * bill has everything, and records when it was printed ("waiting for payment").
 */
export async function printBill(order_id: string, discount: { type: string; value: number } | null, offer_text: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireAction("any");
    const settings = await repo.settings();
    let bill = groupBills((await repo.orderLines()).filter((l) => l.order_id === order_id))[0];
    if (!bill || bill.status !== "Open") throw new Error("This bill is not open (already paid or voided).");
    if (discount) {
      const t = discount.type === "%" || discount.type === "Rs" ? discount.type : "";
      const prob = discountProblem(bill.subtotal, t, Number(discount.value) || 0, "Bill discount");
      if (prob) throw new ValidationError([prob]);
      await syncBillDiscount(order_id, { type: t, value: Number(discount.value) || 0 }, user.email);
    }
    const offer = (offer_text ?? "").trim().slice(0, 200);
    const at = `${today(settings)} ${nowTime(settings)}`;
    bill = groupBills((await repo.orderLines()).filter((l) => l.order_id === order_id))[0];
    for (const l of liveLines(bill)) await repo.update("orders", l.line_id, { offer_text: offer, printed_at: at });
    const menu = await repo.menu();
    const lines = liveLines(bill).map((l) => ({ ...l, offer_text: offer, printed_at: at }));
    await log("MO Cafe", "Bill", "Bill printed", `${billWhere(bill)} · ${bill.invoice_no} · ${money(bill.total)}${bill.discount ? ` · ${bill.discount.item_name}` : ""}`, order_id);
    return { message: `Bill printed · ${money(bill.total)} – waiting for payment`, id: order_id, receipt: receiptFor(lines, menu, { status: "Open" }), ticket: "receipt" };
  });
}

/** Set, change or remove (type "") the discount on the whole open bill. */
export async function setBillDiscount(order_id: string, type: string, value: number): Promise<ActionResult> {
  return run(async () => {
    const user = await requireAction("any");
    const bill = groupBills((await repo.orderLines()).filter((l) => l.order_id === order_id))[0];
    if (!bill || bill.status !== "Open") throw new Error("Only an open bill can get a discount.");
    const t = type === "%" || type === "Rs" ? type : "";
    const prob = discountProblem(bill.subtotal, t, Number(value) || 0, "Bill discount");
    if (prob) throw new ValidationError([prob]);
    await syncBillDiscount(order_id, { type: t, value: Number(value) || 0 }, user.email);
    await log("MO Cafe", "Discount", t ? "Bill discount set" : "Bill discount removed", `${billWhere(bill)} · ${bill.invoice_no} · ${t ? discountLabel(t, value) : ""}`, order_id);
    return t ? `Bill discount ${discountLabel(t, value)} added` : "Bill discount removed";
  });
}

export interface VoidInput {
  order_id: string;
  /** One line, or "" for the whole bill. */
  line_id: string;
  /** How many of that line to void (default: all). */
  qty?: number;
  reason: string;
  note?: string;
  /** Name of the partner who authorises, and their password. */
  authorised_by: string;
  password: string;
}

/**
 * Void (cancel) items on an open bill. Needs the password of a partner (Settings → Users), so items are not
 * removed without a manager. Voided items stay on record with who authorised it and why; they never count.
 */
export async function voidItems(input: VoidInput): Promise<ActionResult> {
  return run(async () => {
    await requireAction("any");
    const v = new V();
    const reason = v.oneOf("Reason", input.reason, VOID_REASONS);
    if (reason === "Other") v.required("What happened", input.note);
    v.done();
    const key = `void:${(input.authorised_by ?? "").toLowerCase()}`;
    if (loginLocked(key)) throw new Error("Too many wrong passwords. Wait 10 minutes and try again.");
    const users = await repo.users();
    const auth = users.find((u) => u.role === "partner" && u.password_hash && (u.name === input.authorised_by || u.email === input.authorised_by));
    const ok = await verifyPassword(input.password ?? "", auth?.password_hash || undefined);
    recordLogin(key, ok);
    if (!auth || !ok) throw new Error("Wrong password – a partner must enter their own password to void.");

    const all = await repo.orderLines();
    const bill = groupBills(all.filter((l) => l.order_id === input.order_id))[0];
    if (!bill || bill.status !== "Open") throw new Error("Only items on an open bill can be voided.");
    const why = input.note?.trim() ? `${reason}: ${input.note.trim()}` : reason;
    const targets = input.line_id ? bill.lines.filter((l) => l.line_id === input.line_id) : liveLines(bill);
    if (!targets.length) throw new Error("That item is not on the bill.");
    let next = nextLineNo(all, bill.order_id);
    for (const l of targets) {
      const n = input.line_id && input.qty ? Math.floor(input.qty) : l.qty;
      if (!(n >= 1 && n <= l.qty)) throw new Error(`Void 1 to ${l.qty} of ${l.item_name}`);
      if (n === l.qty) {
        await repo.update("orders", l.line_id, { status: "Void", void_by: auth.name, void_reason: why });
      } else {
        // Part of a line: keep the rest on the bill, record the voided part as its own line.
        const left = l.qty - n;
        await repo.update("orders", l.line_id, { qty: left, line_total: left * l.unit_price, line_cost: left * l.unit_cost });
        await repo.insert("orders", [{ ...l, line_id: `${l.order_id}-${next++}`, qty: n, line_total: n * l.unit_price, line_cost: n * l.unit_cost, status: "Void", void_by: auth.name, void_reason: why }]);
      }
    }
    if (input.line_id) await syncBillDiscount(bill.order_id);
    await log("MO Cafe", "Void", input.line_id ? "Item voided" : "Whole bill voided",
      `${billWhere(bill)} · ${bill.invoice_no} · ${targets.map((t) => t.item_name).join(", ")} · ${why} · authorised by ${auth.name}`, bill.order_id);
    return input.line_id ? `Voided · authorised by ${auth.name}` : `Whole bill voided · authorised by ${auth.name}`;
  });
}

export async function deleteOrder(order_id: string): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
    const lines = (await repo.orderLines()).filter((o) => o.order_id === order_id);
    for (const l of lines) await repo.remove("orders", l.line_id);
    const inv = lines.find((l) => l.invoice_no)?.invoice_no ?? "";
    await log("MO Cafe", "Order", "Order deleted", `${inv || order_id} · ${money(lines.filter((l) => l.status !== "Void").reduce((t, l) => t + l.line_total, 0))}`, order_id);
    // An Uber order's commission goes with it.
    if (lines.some((l) => l.payment_method === "Uber")) {
      const cid = uberCostId(order_id);
      if ((await repo.dailyCosts()).some((c) => c.cost_id === cid)) await repo.remove("dailyCosts", cid);
    }
    return "Order deleted";
  });
}

// ---------------- Daily costs (partners + staff) ----------------

export async function saveDailyCost(form: Record<string, string>): Promise<ActionResult> {
  return run(async () => {
    const user = await requireAction("any");
    const settings = await repo.settings();
    const v = new V();
    const row: DailyCost = {
      cost_id: form.cost_id || newId("C"),
      date: v.date("Date", form.date),
      category: v.oneOf("Category", form.category, settings.cost_categories),
      description: v.required("Description", form.description),
      amount: v.amount("Amount", form.amount, { allowZero: false }),
      paid_from: v.oneOf("Paid from", form.paid_from, CAFE_ACCOUNTS),
      paid_by: v.oneOf("Paid by", form.paid_by, PAID_BY),
      notes: (form.notes ?? "").trim(),
      entered_by: user.email,
    };
    v.done();
    if (form.cost_id) {
      await requireAction("partner"); // only partners edit existing entries
      await repo.update("dailyCosts", form.cost_id, row);
      await log("MO Cafe", "Daily cost", "Cost updated", `${row.date} · ${row.category} · ${row.description} · ${money(row.amount)} · ${row.paid_from}`, row.cost_id);
      return "Cost updated";
    }
    await repo.insert("dailyCosts", [row]);
    await log("MO Cafe", "Daily cost", "Cost added", `${row.date} · ${row.category} · ${row.description} · ${money(row.amount)} · ${row.paid_from}`, row.cost_id);
    return "Cost saved";
  });
}

export async function deleteDailyCost(id: string): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
    const c = (await repo.dailyCosts()).find((x) => x.cost_id === id);
    await repo.remove("dailyCosts", id);
    await log("MO Cafe", "Daily cost", "Cost deleted", c ? `${c.date} · ${c.category} · ${c.description} · ${money(c.amount)}` : id, id);
    return "Cost deleted";
  });
}

// ---------------- Menu (partners) ----------------

export async function saveMenuItem(form: Record<string, string>): Promise<ActionResult> {
  return run(async () => {
    const user = await requireAction("partner");
    const settings = await repo.settings();
    const v = new V();
    const item: MenuItem = {
      item_id: (form.item_id || "").trim(),
      category: v.oneOf("Category", form.category, settings.menu_categories.map((c) => c.name)),
      sub_category: v.required("Sub-category", form.sub_category),
      item_name: v.required("Item name", form.item_name),
      unit_cost: v.amount("Unit cost", form.unit_cost),
      selling_price: v.amount("Selling price", form.selling_price, { allowZero: false }),
      active: form.active !== "no",
      description: (form.description ?? "").trim(),
    };
    v.done();
    const menu = await repo.menu();
    const existing = menu.find((m) => m.item_id === item.item_id);
    if (existing) {
      if (existing.unit_cost !== item.unit_cost || existing.selling_price !== item.selling_price) {
        await repo.insert("priceHistory", [{
          history_id: newId("PH"), item_id: item.item_id, effective_date: today(settings),
          old_cost: existing.unit_cost, old_price: existing.selling_price, new_cost: item.unit_cost, new_price: item.selling_price,
          changed_by: user.email,
        }]);
      }
      await repo.update("menu", item.item_id, item);
      await log("MO Cafe", "Menu", "Item updated", `${item.item_id} · ${item.item_name} · price ${money(item.selling_price)} · cost ${money(item.unit_cost)}`, item.item_id);
      return "Item updated";
    }
    const prefix = settings.menu_categories.find((c) => c.name === item.category)!.prefix;
    const max = menu.filter((m) => m.item_id.startsWith(prefix)).map((m) => Number(m.item_id.slice(1)) || 0).reduce((a, b) => Math.max(a, b), 0);
    item.item_id = `${prefix}${String(max + 1).padStart(2, "0")}`;
    await repo.insert("menu", [item]);
    await log("MO Cafe", "Menu", "Item added", `${item.item_id} · ${item.item_name} · ${item.category} · ${money(item.selling_price)}`, item.item_id);
    return "Item added";
  });
}

export async function setMenuActive(item_id: string, active: boolean): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
    await repo.update("menu", item_id, { active });
    await log("MO Cafe", "Menu", active ? "Item activated" : "Item deactivated", (await repo.menu()).find((m) => m.item_id === item_id)?.item_name ?? item_id, item_id);
    return active ? "Item activated" : "Item deactivated";
  });
}

// ---------------- Fixed costs (partners) ----------------

export async function saveFixedCost(form: Record<string, string>): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
    const v = new V();
    const frequency = v.oneOf("Frequency", form.frequency, ["Monthly", "One-time"] as const);
    const row: FixedCost = {
      fixed_id: form.fixed_id || newId("F"),
      name: v.required("Name", form.name),
      amount: v.amount("Amount", form.amount, { allowZero: false }),
      frequency,
      start_month: frequency === "Monthly" ? v.month("Start month", form.start_month) : "",
      end_month: frequency === "Monthly" ? v.month("End month", form.end_month, true) : "",
      month_paid: frequency === "One-time" ? v.month("Month paid", form.month_paid) : "",
      paid_from: v.oneOf("Paid from", form.paid_from, CAFE_ACCOUNTS),
      notes: (form.notes ?? "").trim(),
    };
    if (row.end_month && row.start_month) v.check(row.end_month >= row.start_month, "End month must be after start month");
    v.done();
    if (form.fixed_id) await repo.update("fixedCosts", form.fixed_id, row);
    else await repo.insert("fixedCosts", [row]);
    await log("MO Cafe", "Fixed cost", form.fixed_id ? "Fixed cost updated" : "Fixed cost added", `${row.name} · ${money(row.amount)} · ${row.frequency}`, row.fixed_id);
    return "Fixed cost saved";
  });
}

export async function deleteFixedCost(id: string): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
    await repo.remove("fixedCosts", id);
    await log("MO Cafe", "Fixed cost", "Fixed cost deleted", id, id);
    return "Fixed cost deleted";
  });
}

export async function recordFixedPayment(form: Record<string, string>): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
    const v = new V();
    const row: FixedPayment = {
      payment_id: newId("P"),
      fixed_id: v.required("Fixed cost", form.fixed_id),
      month: v.month("Month", form.month),
      amount: v.amount("Amount", form.amount, { allowZero: false }),
      paid_date: v.date("Paid date", form.paid_date),
      paid_from: v.oneOf("Paid from", form.paid_from, CAFE_ACCOUNTS),
      notes: (form.notes ?? "").trim(),
    };
    v.done();
    await repo.insert("fixedPayments", [row]);
    await log("MO Cafe", "Fixed cost", "Fixed cost paid", `${(await repo.fixedCosts()).find((f) => f.fixed_id === row.fixed_id)?.name ?? row.fixed_id} · ${row.month} · ${money(row.amount)} · ${row.paid_from}`, row.payment_id);
    return "Payment recorded";
  });
}

export async function undoFixedPayment(fixed_id: string, month: string): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
    const pays = (await repo.fixedPayments()).filter((p) => p.fixed_id === fixed_id && p.month === month);
    for (const p of pays) await repo.remove("fixedPayments", p.payment_id);
    await log("MO Cafe", "Fixed cost", "Fixed cost marked not paid", `${fixed_id} · ${month}`, fixed_id);
    return "Marked as not paid";
  });
}

// ---------------- Cash movements (owner: all accounts; other partners: cafe petty cash only) ----------------

export async function saveMovement(form: Record<string, string>): Promise<ActionResult> {
  return run(async () => {
    const user = await requireAction("partner");
    const v = new V();
    const type = v.oneOf("Type", form.type, user.owner ? MOVEMENT_TYPES : CAFE_MOVEMENT_TYPES);
    const row = {
      movement_id: newId("M"),
      date: v.date("Date", form.date),
      // transfers/deposits have a fixed direction; the source account is recorded for clarity
      account: TRANSFERS[type]?.[0] ?? v.oneOf("Account", form.account, user.owner ? ACCOUNTS : (["Petty cash"] as const)),
      type,
      amount: v.amount("Amount", form.amount, { allowZero: false }),
      notes: (form.notes ?? "").trim(),
      moved_by: v.oneOf("Moved by", form.moved_by, MOVED_BY),
    };
    v.done();
    await repo.insert("cash", [row]);
    {
      const accts = movementAccounts(row as CashMovement);
      const biz: LogBusiness = accts.includes("Villa petty cash") ? "MO Villa" : accts.every((a) => a === "Petty cash") || (accts.includes("Petty cash") && CAFE_MOVEMENT_TYPES.includes(row.type)) ? "MO Cafe" : "Admin";
      await log(biz, "Cash", `Cash: ${row.type}`, `${row.date} · ${accts.join(" → ")} · ${money(row.amount)} · by ${row.moved_by}${row.notes ? ` · ${row.notes}` : ""}`, row.movement_id);
    }
    return "Movement saved";
  });
}

export async function deleteMovement(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireAction("partner");
    if (!user.owner) {
      const m = (await repo.movements()).find((x) => x.movement_id === id);
      if (!m) throw new Error("Movement not found.");
      if (!movementAccounts(m).includes("Petty cash") || !CAFE_MOVEMENT_TYPES.includes(m.type)) throw new Error("Only the owner can delete this movement.");
    }
    const gone = (await repo.movements()).find((x) => x.movement_id === id);
    await repo.remove("cash", id);
    if (gone) {
      const accts = movementAccounts(gone);
      await log(accts.includes("Villa petty cash") ? "MO Villa" : accts.includes("Petty cash") && CAFE_MOVEMENT_TYPES.includes(gone.type) ? "MO Cafe" : "Admin",
        "Cash", "Cash movement deleted", `${gone.date} · ${gone.type} · ${money(gone.amount)}`, id);
    }
    return "Movement deleted";
  });
}

// ---------------- To-do (partners) ----------------

/** Non-owners may not see or change tasks linked to villa bookings. */
async function assertTodoAccess(user: AppUser, task_id: string | undefined) {
  if (user.owner || !task_id) return;
  const t = (await repo.todos()).find((x) => x.task_id === task_id);
  if (t && isVillaTodo(t)) throw new Error("Only the owner can change this task.");
}

export async function saveTodo(form: Record<string, string>): Promise<ActionResult> {
  return run(async () => {
    const user = await requireAction("partner");
    await assertTodoAccess(user, form.task_id);
    if (!user.owner && (form.booking_id ?? "").trim()) throw new Error("Only the owner can link villa bookings.");
    const v = new V();
    const row: Todo = {
      task_id: form.task_id || newId("T"),
      task: v.required("Task", form.task),
      owner: v.oneOf("Owner", form.owner, ["Rajitha", "Janith", "Staff"] as const),
      due_date: v.date("Due date", form.due_date),
      priority: v.oneOf("Priority", form.priority, PRIORITIES),
      done: false,
      done_date: "",
      booking_id: (form.booking_id ?? "").trim(),
      // Only the owner can mark a villa task; a booking link always makes it one.
      villa: user.owner && (["on", "yes", "true"].includes(String(form.villa ?? "").toLowerCase()) || Boolean((form.booking_id ?? "").trim())),
    };
    if (row.booking_id) v.check((await repo.villa()).some((r) => r.record_id === row.booking_id && r.record_type === "Booking"), "Linked booking not found");
    v.done();
    if (form.task_id)
      await repo.update("todo", form.task_id, { task: row.task, owner: row.owner, due_date: row.due_date, priority: row.priority, booking_id: row.booking_id, villa: row.villa });
    else await repo.insert("todo", [row]);
    await log(isVillaTodo(row) ? "MO Villa" : "MO Cafe", "To-do", form.task_id ? "Task updated" : "Task added", `${row.task}${row.due_date ? ` · due ${row.due_date}` : ""}`, row.task_id);
    return "Task saved";
  });
}

export async function setTodoDone(task_id: string, done: boolean): Promise<ActionResult> {
  return run(async () => {
    const user = await requireAction("partner");
    await assertTodoAccess(user, task_id);
    const settings = await repo.settings();
    await repo.update("todo", task_id, { done, done_date: done ? today(settings) : "" });
    {
      const td = (await repo.todos()).find((x) => x.task_id === task_id);
      if (td) await log(isVillaTodo(td) ? "MO Villa" : "MO Cafe", "To-do", done ? "Task done" : "Task reopened", td.task, task_id);
    }
    return done ? "Done" : "Task reopened";
  });
}

// ---------------- Settings (partners) ----------------

export async function saveSettings(values: Record<string, string>): Promise<ActionResult> {
  return run(async () => {
    await requireAction("owner");
    const v = new V();
    v.month("Opening month", values.opening_month);
    const partners = parsePartners(values.partners ?? "");
    const total = partners.reduce((t, p) => t + p.pct, 0);
    v.check(partners.length > 0 && Math.abs(total - 100) < 0.001, `Partner split must total 100% (now ${total}%)`);
    for (const k of ["food_cost_target_pct", "food_cost_good_pct", "petty_low_threshold", "one_time_spread_months", "todo_amber_days"]) v.amount(k, values[k]);
    v.check((values.closed_months ?? "").split(",").filter(Boolean).every((m) => Number(m) >= 1 && Number(m) <= 12), "Closed months must be numbers 1-12");
    v.done();
    const current = await repo.settingRows();
    const rows = current.map((r) => (r.key in values ? { ...r, value: values[r.key] } : r));
    for (const [key, value] of Object.entries(values)) if (!rows.some((r) => r.key === key)) rows.push({ key, value, description: "" });
    // Parse the full new settings before saving, so a typo can never break the app.
    let parsed;
    try {
      parsed = parseSettings(rows, await repo.targets());
    } catch (e) {
      throw new ValidationError([e instanceof Error ? e.message : String(e)]);
    }
    const roomNames = parsed.villa_rooms.map((r) => r.room_number);
    v.check(roomNames.length > 0, "Add at least one villa room");
    v.check(new Set(roomNames).size === roomNames.length, "Villa room numbers must be unique");
    v.check(parsed.villa_platforms.length > 0, "Add at least one villa platform");
    v.check(parsed.villa_platforms.every((p) => p.commission_pct >= 0 && p.commission_pct <= 100), "Platform commission must be 0-100%");
    v.check(parsed.villa_rooms.every((r) => r.base_price >= 0), "Room base price cannot be negative");
    v.done();
    await repo.replaceAll("settings", rows);
    await log("Admin", "Settings", "Settings saved", "", "settings");
    return "Settings saved";
  });
}

export async function saveTargets(rows: Record<string, string>[]): Promise<ActionResult> {
  return run(async () => {
    await requireAction("owner");
    const v = new V();
    const out: TargetPeriod[] = rows.filter((r) => (r.period ?? "").trim()).map((r, i) => {
      const t = {
        period: v.required(`Period ${i + 1} name`, r.period),
        start_month: v.month(`Period ${i + 1} start`, r.start_month),
        end_month: v.month(`Period ${i + 1} end`, r.end_month),
        planned_monthly_sales: v.amount(`Period ${i + 1} planned sales`, r.planned_monthly_sales),
        planned_net_profit: v.amount(`Period ${i + 1} planned profit`, r.planned_net_profit, { min: -Infinity }),
        daily_target_breakfast: v.amount(`Period ${i + 1} breakfast target`, r.daily_target_breakfast),
        daily_target_lunch: v.amount(`Period ${i + 1} lunch target`, r.daily_target_lunch),
        daily_target_dinner: v.amount(`Period ${i + 1} dinner target`, r.daily_target_dinner),
      };
      v.check(!t.start_month || !t.end_month || t.end_month >= t.start_month, `Period ${i + 1}: end before start`);
      return t;
    });
    v.done();
    await repo.replaceAll("targets", out);
    await log("Admin", "Settings", "Targets saved", `${out.length} period(s)`, "targets");
    return "Targets saved";
  });
}

export async function saveUsers(rows: UserForm[]): Promise<ActionResult> {
  return run(async () => {
    const me = await requireAction("owner");
    const v = new V();
    const { users, errors } = await buildUsers(rows, await repo.users(), hashPassword);
    errors.forEach((e) => v.check(false, e));
    v.check(me.email === "demo@local" || users.some((u) => u.email === me.email && u.role === "partner"), "You cannot remove your own partner access");
    v.done();
    await repo.replaceAll("users", users as unknown as Record<string, string>[]);
    await log("Admin", "Users", "Users saved", users.map((u) => `${u.name} (${u.role})`).join(", "), "users");
    return "Users saved";
  });
}

// ---------------- MO Villa (partners) ----------------

const EMPTY_VILLA: VillaRecord = {
  record_id: "", record_type: "Booking", date_entered: "", room_number: "", room_type: "", platform: "", booking_ref: "",
  guest_name: "", guests: 0, check_in: "", check_out: "", nights: 0, status: "", total_price: 0, commission_pct: 0,
  commission_amount: 0, booking_costs: 0, net_payout: 0, payout_status: "", payout_date: "", received_to: "",
  cost_category: "", cost_description: "", cost_amount: 0, cost_room: "", paid_from: "", notes: "",
  breakfast: false, commission_later: false, amount_paid: 0, closed_platforms: "", booking_id: "",
};

export async function saveBooking(form: Record<string, string>): Promise<ActionResult> {
  return run(async () => {
    await requireAction("owner");
    const settings = await repo.settings();
    const records = await repo.villa();
    const v = new V();
    const room_number = v.oneOf("Room", form.room_number, settings.villa_rooms.map((r) => r.room_number));
    const platform = v.oneOf("Platform", form.platform, settings.villa_platforms.map((p) => p.name));
    const check_in = v.date("Check-in", form.check_in);
    const check_out = v.date("Check-out", form.check_out);
    if (check_in && check_out) v.check(check_out > check_in, "Check-out must be after check-in");
    const status = v.oneOf("Status", form.status || "Confirmed", BOOKING_STATUSES);
    // A cancelled booking may be 0 (no cancellation fee); otherwise the price must be positive.
    const total_price = v.amount("Total price", form.total_price, { allowZero: status === "Cancelled" });
    const commission_pct = v.percent("Commission %", form.commission_pct);
    const commission_amount = v.optionalAmount("Commission amount", form.commission_amount, commissionFor(total_price, commission_pct));
    const booking_costs = v.optionalAmount("Booking costs", form.booking_costs);
    const guests = v.optionalAmount("Guests", form.guests);
    const commission_later = form.commission_later === "yes";
    const breakfast = form.breakfast === "yes";
    // Payment: Not paid / Part paid (amount) / Paid (everything to receive).
    const toReceive = expectedIn({ net_payout: netPayoutFor(total_price, commission_amount, booking_costs), commission_amount, commission_later });
    const payment = v.oneOf("Payment", form.payment || "Not paid", ["Not paid", "Part paid", "Paid"]);
    let amount_paid = 0;
    if (payment === "Paid") amount_paid = toReceive;
    else if (payment === "Part paid") {
      amount_paid = v.amount("Amount paid", form.amount_paid, { allowZero: false });
      v.check(amount_paid <= toReceive, `Amount paid can't be more than the amount to receive (Rs ${toReceive.toLocaleString("en-US")})`);
    }
    const payout_status: VillaRecord["payout_status"] = amount_paid > 0 && amount_paid >= toReceive ? "Received" : "Pending";
    let received_to: VillaRecord["received_to"] = "";
    let payout_date = "";
    if (amount_paid > 0) {
      received_to = v.oneOf("Received to", form.received_to, VILLA_RECEIVED_TO);
      payout_date = v.optionalDate("Payment date", form.payout_date) || today(settings);
    }
    v.done();

    const record_id = form.record_id || newId("VB");
    const clash = findOverlaps({ record_id, room_number, check_in, check_out, status }, records);
    if (clash.length) {
      const c = clash[0];
      const who = [c.guest_name, c.platform, c.booking_ref].filter(Boolean).join(" · ");
      throw new ValidationError([`Double booking: ${room_number} is already booked ${c.check_in} → ${c.check_out} (${who}). Change the dates or the room.`]);
    }

    const existing = records.find((r) => r.record_id === record_id);
    const row: VillaRecord = {
      ...EMPTY_VILLA,
      record_id,
      record_type: "Booking",
      date_entered: existing?.date_entered || today(settings),
      room_number,
      room_type: settings.villa_rooms.find((r) => r.room_number === room_number)?.room_type ?? "",
      platform,
      booking_ref: (form.booking_ref ?? "").trim(),
      guest_name: (form.guest_name ?? "").trim(),
      guests,
      check_in,
      check_out,
      nights: nightsBetween(check_in, check_out),
      status,
      total_price,
      commission_pct,
      commission_amount,
      booking_costs,
      net_payout: netPayoutFor(total_price, commission_amount, booking_costs),
      payout_status,
      payout_date,
      received_to,
      notes: (form.notes ?? "").trim(),
      breakfast,
      commission_later,
      amount_paid,
      // Ticks stay unless the platform changed (then the list of other platforms is different).
      closed_platforms: existing && existing.platform === platform ? existing.closed_platforms : "",
    };
    if (existing) await repo.update("villa", record_id, row);
    else await repo.insert("villa", [row]);
    await log("MO Villa", "Booking", existing ? "Booking updated" : "Booking added", `${row.room_number} · ${row.guest_name || row.platform} · ${row.check_in} → ${row.check_out} · ${row.status} · ${money(row.total_price)}`, record_id);
    return existing ? "Booking updated" : "Booking saved";
  });
}

/** Adds a payment (full or part) to a booking. */
export async function recordPayment(record_id: string, amount: string, received_to: string, payout_date: string): Promise<ActionResult> {
  return run(async () => {
    await requireAction("owner");
    const b = (await repo.villa()).find((r) => r.record_id === record_id && r.record_type === "Booking");
    if (!b) throw new Error("Booking not found");
    const due = Math.max(0, expectedIn(b) - paidAmount(b));
    const v = new V();
    const amt = v.amount("Amount", amount, { allowZero: false });
    v.check(amt <= due, `Only Rs ${due.toLocaleString("en-US")} is still to receive`);
    const to = v.oneOf("Received to", received_to, VILLA_RECEIVED_TO);
    const date = v.date("Payment date", payout_date);
    v.done();
    const amount_paid = paidAmount(b) + amt;
    const payout_status = amount_paid >= expectedIn(b) ? "Received" : "Pending";
    await repo.update("villa", record_id, { payout_status, amount_paid, received_to: to, payout_date: date });
    await log("MO Villa", "Booking", payout_status === "Received" ? "Payment received (paid in full)" : "Part payment received",
      `${b.room_number} · ${b.guest_name || b.platform} · ${money(amt)} · to ${to} · ${date}`, record_id);
    return payout_status === "Received" ? "Paid in full" : `Part payment saved · Rs ${(expectedIn(b) - amount_paid).toLocaleString("en-US")} still to receive`;
  });
}

/** Pays a "commission later" booking's commission: saved as a villa Cost linked to the booking. */
export async function payCommission(record_id: string, paid_from: string, date: string): Promise<ActionResult> {
  return run(async () => {
    await requireAction("owner");
    const records = await repo.villa();
    const b = records.find((r) => r.record_id === record_id && r.record_type === "Booking");
    if (!b) throw new Error("Booking not found");
    const due = commissionDue(b, records);
    if (due <= 0) throw new Error("No commission to pay for this booking");
    const v = new V();
    const from = v.oneOf("Paid from", paid_from, VILLA_PAID_FROM);
    const d = v.date("Date", date);
    v.done();
    const row: VillaRecord = {
      ...EMPTY_VILLA,
      record_id: newId("VC"),
      record_type: "Cost",
      date_entered: d,
      cost_category: COMMISSION_COST_CATEGORY,
      cost_description: `${b.platform} commission · ${b.guest_name || b.booking_ref || b.record_id} · ${b.check_in}`,
      cost_amount: due,
      cost_room: b.room_number,
      paid_from: from,
      booking_id: b.record_id,
    };
    await repo.insert("villa", [row]);
    await log("MO Villa", "Villa cost", "Commission paid", `${b.room_number} · ${b.platform} · ${b.guest_name || b.record_id} · ${money(due)} · ${from}`, row.record_id);
    return "Commission paid · saved under Costs";
  });
}

/** Ticks (or unticks) another platform as closed by hand for a booking's dates. */
export async function setPlatformClosed(record_id: string, platform: string, closed: boolean): Promise<ActionResult> {
  return run(async () => {
    await requireAction("owner");
    const settings = await repo.settings();
    const b = (await repo.villa()).find((r) => r.record_id === record_id && r.record_type === "Booking");
    if (!b) throw new Error("Booking not found");
    const allowed = platformsToClose(b, settings);
    if (!allowed.includes(platform)) throw new Error(`${platform} is not one of the other platforms`);
    const now = new Set((b.closed_platforms || "").split(",").map((s) => s.trim()).filter(Boolean));
    if (closed) now.add(platform);
    else now.delete(platform);
    const closed_platforms = allowed.filter((p) => now.has(p)).join(",");
    await repo.update("villa", record_id, { closed_platforms });
    await log("MO Villa", "Booking", closed ? "Platform closed" : "Platform reopened", `${b.room_number} · ${b.check_in} → ${b.check_out} · ${platform}`, record_id);
    return closed ? `${platform} ticked as closed` : `${platform} unticked`;
  });
}

export async function saveVillaCost(form: Record<string, string>): Promise<ActionResult> {
  return run(async () => {
    await requireAction("owner");
    const settings = await repo.settings();
    const v = new V();
    const rooms = settings.villa_rooms.map((r) => r.room_number);
    const before = form.record_id ? (await repo.villa()).find((r) => r.record_id === form.record_id) : undefined;
    // Old rows may say Bank; they keep it, new costs use the three villa options.
    const paidFromOptions = [...VILLA_PAID_FROM, ...(before?.paid_from && !VILLA_PAID_FROM.includes(before.paid_from) ? [before.paid_from] : [])];
    const row: VillaRecord = {
      ...EMPTY_VILLA,
      record_id: form.record_id || newId("VC"),
      record_type: "Cost",
      date_entered: v.date("Date", form.date_entered),
      cost_category: v.oneOf("Category", form.cost_category, [...settings.villa_cost_categories, COMMISSION_COST_CATEGORY]),
      cost_description: (form.cost_description ?? "").trim(),
      cost_amount: v.amount("Amount", form.cost_amount, { allowZero: false }),
      cost_room: v.oneOf("Room", form.cost_room || ALL_ROOMS, [ALL_ROOMS, ...rooms]),
      paid_from: v.oneOf("Paid from", form.paid_from, paidFromOptions),
      notes: (form.notes ?? "").trim(),
      booking_id: before?.booking_id ?? "",
    };
    v.done();
    if (form.record_id) await repo.update("villa", form.record_id, row);
    else await repo.insert("villa", [row]);
    await log("MO Villa", "Villa cost", form.record_id ? "Villa cost updated" : "Villa cost added", `${row.date_entered} · ${row.cost_category} · ${row.cost_description} · ${money(row.cost_amount)} · ${row.paid_from}`, row.record_id);
    return form.record_id ? "Cost updated" : "Villa cost saved";
  });
}

export async function deleteVillaRecord(record_id: string): Promise<ActionResult> {
  return run(async () => {
    await requireAction("owner");
    const vr = (await repo.villa()).find((r) => r.record_id === record_id);
    await repo.remove("villa", record_id);
    await log("MO Villa", vr?.record_type === "Cost" ? "Villa cost" : "Booking", vr?.record_type === "Cost" ? "Villa cost deleted" : "Booking deleted",
      vr ? (vr.record_type === "Cost" ? `${vr.cost_category} · ${money(vr.cost_amount)}` : `${vr.room_number} · ${vr.guest_name || vr.platform} · ${vr.check_in}`) : record_id, record_id);
    return "Deleted";
  });
}

// ---------------- Partner capital (partners) ----------------

/** Non-owners only see and change MO Cafe capital. */
async function assertCapitalAccess(user: AppUser, capital_id: string | undefined) {
  if (user.owner || !capital_id) return;
  const r = (await repo.capital()).find((x) => x.capital_id === capital_id);
  if (r && r.business !== "MO Cafe") throw new Error("Only the owner can change this contribution.");
}

export async function saveCapital(form: Record<string, string>): Promise<ActionResult> {
  return run(async () => {
    const user = await requireAction("partner");
    await assertCapitalAccess(user, form.capital_id);
    if (!user.owner && form.business !== "MO Cafe") throw new Error("Only the owner can record MO Villa or shared capital.");
    const settings = await repo.settings();
    const v = new V();
    const row: CapitalContribution = {
      capital_id: form.capital_id || newId("CAP"),
      date: v.date("Date", form.date),
      partner: v.oneOf("Partner", form.partner, settings.partners.map((p) => p.name)),
      business: v.oneOf("Business", form.business, CAPITAL_BUSINESSES),
      description: v.required("Description", form.description),
      amount: v.amount("Amount", form.amount, { allowZero: false }),
      paid_into: v.oneOf("Paid into", form.paid_into, CAPITAL_PAID_INTO),
      notes: (form.notes ?? "").trim(),
    };
    v.check(capitalAccountAllowed(row.business, row.paid_into), `${row.business} capital can't go into ${row.paid_into === "Petty cash" ? "the cafe petty cash" : row.paid_into.toLowerCase()}`);
    v.done();
    if (form.capital_id) await repo.update("capital", form.capital_id, row);
    else await repo.insert("capital", [row]);
    await log(row.business === "MO Cafe" ? "MO Cafe" : row.business === "MO Villa" ? "MO Villa" : "Admin", "Capital", form.capital_id ? "Capital updated" : "Capital added",
      `${row.partner} · ${row.business} · ${row.description} · ${money(row.amount)}`, row.capital_id);
    return form.capital_id ? "Contribution updated" : "Contribution saved";
  });
}

export async function deleteCapital(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireAction("partner");
    await assertCapitalAccess(user, id);
    const cap = (await repo.capital()).find((c) => c.capital_id === id);
    await repo.remove("capital", id);
    await log(cap?.business === "MO Cafe" ? "MO Cafe" : cap?.business === "MO Villa" ? "MO Villa" : "Admin", "Capital", "Capital deleted", cap ? `${cap.partner} · ${cap.description} · ${money(cap.amount)}` : id, id);
    return "Contribution deleted";
  });
}
