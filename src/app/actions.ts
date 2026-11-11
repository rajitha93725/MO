"use server";

import { revalidatePath } from "next/cache";
import { repo, newId } from "@/lib/data/repo";
import { requireAction } from "@/lib/auth";
import { V, ValidationError } from "@/lib/validate";
import { today, nowTime } from "@/lib/today";
import { parsePartners, parseSettings } from "@/lib/settings";
import {
  ACCOUNTS, ALL_ROOMS, BOOKING_STATUSES, CAPITAL_BUSINESSES, CAPITAL_PAID_INTO, MEALS, MOVED_BY, MOVEMENT_TYPES, PAID_BY,
  PAYMENT_METHODS, PAYOUT_STATUSES, PRIORITIES, type CapitalContribution,
  type DailyCost, type FixedCost, type FixedPayment, type MenuItem, type OrderLine, type TargetPeriod, type Todo, type VillaRecord,
} from "@/lib/types";
import { commissionFor, findOverlaps, netPayoutFor, nightsBetween } from "@/lib/calc/villa";

export type ActionResult = { ok: true; message?: string; id?: string } | { ok: false; errors: string[] };

async function run(fn: () => Promise<string | void>, paths: string[] = ["/"]): Promise<ActionResult> {
  try {
    const message = (await fn()) ?? undefined;
    for (const p of paths) revalidatePath(p, "layout");
    return { ok: true, message };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, errors: e.errors };
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
}

// ---------------- Orders (partners + staff) ----------------

export interface OrderInput {
  meal: string;
  payment_method: string;
  notes?: string;
  date?: string;
  lines: { item_id: string; qty: number }[];
}

export async function saveOrder(input: OrderInput): Promise<ActionResult> {
  return run(async () => {
    const user = await requireAction("any");
    const settings = await repo.settings();
    const v = new V();
    const meal = v.oneOf("Meal", input.meal, MEALS);
    const payment_method = v.oneOf("Payment method", input.payment_method, PAYMENT_METHODS);
    const date = v.date("Date", input.date || today(settings));
    v.check(input.lines.length > 0, "Add at least one item");
    input.lines.forEach((l, i) => v.qty(`Quantity (line ${i + 1})`, l.qty));
    v.done();

    const menu = await repo.menu();
    const order_id = newId("ORD");
    const time = nowTime(settings);
    const rows: OrderLine[] = input.lines.map((l, i) => {
      const m = menu.find((x) => x.item_id === l.item_id);
      if (!m) throw new ValidationError([`Unknown menu item ${l.item_id}`]);
      if (!m.active) throw new ValidationError([`${m.item_name} is not active`]);
      // Snapshot price & cost at the moment of saving.
      return {
        line_id: `${order_id}-${i + 1}`,
        order_id, date, time, meal,
        item_id: m.item_id, item_name: m.item_name, qty: l.qty,
        unit_price: m.selling_price, line_total: l.qty * m.selling_price,
        unit_cost: m.unit_cost, line_cost: l.qty * m.unit_cost,
        payment_method, notes: (input.notes ?? "").trim(), entered_by: user.email,
      };
    });
    await repo.insert("orders", rows);
    const total = rows.reduce((t, r) => t + r.line_total, 0);
    return `Order saved · Rs ${total.toLocaleString("en-US")}`;
  });
}

export async function deleteOrder(order_id: string): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
    const lines = (await repo.orders()).filter((o) => o.order_id === order_id);
    for (const l of lines) await repo.remove("orders", l.line_id);
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
      paid_from: v.oneOf("Paid from", form.paid_from, ACCOUNTS),
      paid_by: v.oneOf("Paid by", form.paid_by, PAID_BY),
      notes: (form.notes ?? "").trim(),
      entered_by: user.email,
    };
    v.done();
    if (form.cost_id) {
      await requireAction("partner"); // only partners edit existing entries
      await repo.update("dailyCosts", form.cost_id, row);
      return "Cost updated";
    }
    await repo.insert("dailyCosts", [row]);
    return "Cost saved";
  });
}

export async function deleteDailyCost(id: string): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
    await repo.remove("dailyCosts", id);
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
      category: v.oneOf("Category", form.category, ["Breakfast", "All day dining", "Drinks"] as const),
      sub_category: v.required("Sub-category", form.sub_category),
      item_name: v.required("Item name", form.item_name),
      unit_cost: v.amount("Unit cost", form.unit_cost),
      selling_price: v.amount("Selling price", form.selling_price, { allowZero: false }),
      active: form.active !== "no",
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
      return "Item updated";
    }
    const prefix = item.category === "Breakfast" ? "B" : item.category === "Drinks" ? "D" : "A";
    const max = menu.filter((m) => m.item_id.startsWith(prefix)).map((m) => Number(m.item_id.slice(1)) || 0).reduce((a, b) => Math.max(a, b), 0);
    item.item_id = `${prefix}${String(max + 1).padStart(2, "0")}`;
    await repo.insert("menu", [item]);
    return "Item added";
  });
}

export async function setMenuActive(item_id: string, active: boolean): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
    await repo.update("menu", item_id, { active });
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
      paid_from: v.oneOf("Paid from", form.paid_from, ACCOUNTS),
      notes: (form.notes ?? "").trim(),
    };
    if (row.end_month && row.start_month) v.check(row.end_month >= row.start_month, "End month must be after start month");
    v.done();
    if (form.fixed_id) await repo.update("fixedCosts", form.fixed_id, row);
    else await repo.insert("fixedCosts", [row]);
    return "Fixed cost saved";
  });
}

export async function deleteFixedCost(id: string): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
    await repo.remove("fixedCosts", id);
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
      paid_from: v.oneOf("Paid from", form.paid_from, ACCOUNTS),
      notes: (form.notes ?? "").trim(),
    };
    v.done();
    await repo.insert("fixedPayments", [row]);
    return "Payment recorded";
  });
}

export async function undoFixedPayment(fixed_id: string, month: string): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
    const pays = (await repo.fixedPayments()).filter((p) => p.fixed_id === fixed_id && p.month === month);
    for (const p of pays) await repo.remove("fixedPayments", p.payment_id);
    return "Marked as not paid";
  });
}

// ---------------- Cash movements (partners) ----------------

export async function saveMovement(form: Record<string, string>): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
    const v = new V();
    const type = v.oneOf("Type", form.type, MOVEMENT_TYPES);
    const row = {
      movement_id: newId("M"),
      date: v.date("Date", form.date),
      // transfers/deposits have a fixed direction; the source account is recorded for clarity
      account: type === "Transfer bank→petty" ? "Bank" : type === "Transfer petty→bank" || type === "Cash sales deposit" ? "Petty cash" : v.oneOf("Account", form.account, ACCOUNTS),
      type,
      amount: v.amount("Amount", form.amount, { allowZero: false }),
      notes: (form.notes ?? "").trim(),
      moved_by: v.oneOf("Moved by", form.moved_by, MOVED_BY),
    };
    v.done();
    await repo.insert("cash", [row]);
    return "Movement saved";
  });
}

export async function deleteMovement(id: string): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
    await repo.remove("cash", id);
    return "Movement deleted";
  });
}

// ---------------- To-do (partners) ----------------

export async function saveTodo(form: Record<string, string>): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
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
    };
    if (row.booking_id) v.check((await repo.villa()).some((r) => r.record_id === row.booking_id && r.record_type === "Booking"), "Linked booking not found");
    v.done();
    if (form.task_id)
      await repo.update("todo", form.task_id, { task: row.task, owner: row.owner, due_date: row.due_date, priority: row.priority, booking_id: row.booking_id });
    else await repo.insert("todo", [row]);
    return "Task saved";
  });
}

export async function setTodoDone(task_id: string, done: boolean): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
    const settings = await repo.settings();
    await repo.update("todo", task_id, { done, done_date: done ? today(settings) : "" });
    return done ? "Done" : "Task reopened";
  });
}

// ---------------- Settings (partners) ----------------

export async function saveSettings(values: Record<string, string>): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
    const v = new V();
    v.month("Opening month", values.opening_month);
    const partners = parsePartners(values.partners ?? "");
    const total = partners.reduce((t, p) => t + p.pct, 0);
    v.check(partners.length > 0 && Math.abs(total - 100) < 0.001, `Partner split must total 100% (now ${total}%)`);
    for (const k of ["food_cost_target_pct", "petty_low_threshold", "one_time_spread_months", "todo_amber_days"]) v.amount(k, values[k]);
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
    return "Settings saved";
  });
}

export async function saveTargets(rows: Record<string, string>[]): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
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
    return "Targets saved";
  });
}

export async function saveUsers(rows: Record<string, string>[]): Promise<ActionResult> {
  return run(async () => {
    const me = await requireAction("partner");
    const v = new V();
    const out = rows.filter((r) => (r.email ?? "").trim()).map((r) => ({
      email: v.required("Email", r.email).toLowerCase(),
      name: v.required("Name", r.name),
      role: v.oneOf("Role", r.role, ["partner", "staff"] as const),
    }));
    out.forEach((u) => v.check(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email), `Invalid email ${u.email}`));
    v.check(me.email === "demo@local" || out.some((u) => u.email === me.email && u.role === "partner"), "You cannot remove your own partner access");
    v.done();
    await repo.replaceAll("users", out);
    return "Users saved";
  });
}

// ---------------- MO Villa (partners) ----------------

const EMPTY_VILLA: VillaRecord = {
  record_id: "", record_type: "Booking", date_entered: "", room_number: "", room_type: "", platform: "", booking_ref: "",
  guest_name: "", guests: 0, check_in: "", check_out: "", nights: 0, status: "", total_price: 0, commission_pct: 0,
  commission_amount: 0, booking_costs: 0, net_payout: 0, payout_status: "", payout_date: "", received_to: "",
  cost_category: "", cost_description: "", cost_amount: 0, cost_room: "", paid_from: "", notes: "",
};

export async function saveBooking(form: Record<string, string>): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
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
    const payout_status = v.oneOf("Payout status", form.payout_status || "Pending", PAYOUT_STATUSES);
    const payout_date = v.optionalDate("Payout date", form.payout_date);
    let received_to: VillaRecord["received_to"] = "";
    if (payout_status === "Received") received_to = v.oneOf("Received to", form.received_to, ACCOUNTS);
    else if ((ACCOUNTS as string[]).includes(form.received_to)) received_to = form.received_to as VillaRecord["received_to"];
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
    };
    if (existing) await repo.update("villa", record_id, row);
    else await repo.insert("villa", [row]);
    return existing ? "Booking updated" : "Booking saved";
  });
}

export async function markPayoutReceived(record_id: string, received_to: string, payout_date: string): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
    const v = new V();
    const to = v.oneOf("Received to", received_to, ACCOUNTS);
    const date = v.date("Payout date", payout_date);
    v.done();
    await repo.update("villa", record_id, { payout_status: "Received", received_to: to, payout_date: date });
    return "Payout marked received";
  });
}

export async function saveVillaCost(form: Record<string, string>): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
    const settings = await repo.settings();
    const v = new V();
    const rooms = settings.villa_rooms.map((r) => r.room_number);
    const row: VillaRecord = {
      ...EMPTY_VILLA,
      record_id: form.record_id || newId("VC"),
      record_type: "Cost",
      date_entered: v.date("Date", form.date_entered),
      cost_category: v.oneOf("Category", form.cost_category, settings.villa_cost_categories),
      cost_description: (form.cost_description ?? "").trim(),
      cost_amount: v.amount("Amount", form.cost_amount, { allowZero: false }),
      cost_room: v.oneOf("Room", form.cost_room || ALL_ROOMS, [ALL_ROOMS, ...rooms]),
      paid_from: v.oneOf("Paid from", form.paid_from, ACCOUNTS),
      notes: (form.notes ?? "").trim(),
    };
    v.done();
    if (form.record_id) await repo.update("villa", form.record_id, row);
    else await repo.insert("villa", [row]);
    return form.record_id ? "Cost updated" : "Villa cost saved";
  });
}

export async function deleteVillaRecord(record_id: string): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
    await repo.remove("villa", record_id);
    return "Deleted";
  });
}

// ---------------- Partner capital (partners) ----------------

export async function saveCapital(form: Record<string, string>): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
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
    v.done();
    if (form.capital_id) await repo.update("capital", form.capital_id, row);
    else await repo.insert("capital", [row]);
    return form.capital_id ? "Contribution updated" : "Contribution saved";
  });
}

export async function deleteCapital(id: string): Promise<ActionResult> {
  return run(async () => {
    await requireAction("partner");
    await repo.remove("capital", id);
    return "Contribution deleted";
  });
}
