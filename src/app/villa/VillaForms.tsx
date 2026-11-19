"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteVillaRecord, payCommission, recordPayment, saveBooking, saveVillaCost, setPlatformClosed } from "@/app/actions";
import { formToObject, useAction } from "@/components/ui";
import { commissionFor, expectedIn, netPayoutFor, nightsBetween, paidAmount } from "@/lib/calc/villa";
import {
  ALL_ROOMS, BOOKING_STATUSES, COMMISSION_COST_CATEGORY, VILLA_PAID_FROM, VILLA_RECEIVED_TO, villaAccountLabel,
  type VillaPlatform, type VillaRecord, type VillaRoom,
} from "@/lib/types";

const n = (v: number) => Math.round(v || 0).toLocaleString("en-US");
const toNum = (s: string) => {
  const v = Number(String(s).replace(/,/g, ""));
  return Number.isFinite(v) ? v : 0;
};
/** Commission % shown with up to 2 decimals. */
const pct2 = (v: number) => String(Math.round(v * 100) / 100);

export function BookingForm({ editing, rooms, platforms, today, cancelHref, startRoom, startCheckIn }: {
  editing: VillaRecord | null; rooms: VillaRoom[]; platforms: VillaPlatform[]; today: string; cancelHref: string;
  /** Pre-filled from a free calendar day. */
  startRoom?: string; startCheckIn?: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const { pending, call, ui } = useAction();
  const firstPlatform = platforms[0];
  const [open, setOpen] = useState(Boolean(editing || startRoom || startCheckIn));
  const [room, setRoom] = useState(editing?.room_number ?? (rooms.some((r) => r.room_number === startRoom) ? startRoom! : rooms[0]?.room_number ?? ""));
  const [platform, setPlatform] = useState(editing?.platform ?? firstPlatform?.name ?? "");
  const [checkIn, setCheckIn] = useState(editing?.check_in ?? startCheckIn ?? today);
  const [checkOut, setCheckOut] = useState(editing?.check_out ?? "");
  const [total, setTotal] = useState(editing ? String(editing.total_price) : "");
  // Commission: type the % or the amount; the other one follows. `mode` remembers which one was typed last.
  const startPct = editing ? editing.commission_pct : firstPlatform?.commission_pct ?? 0;
  const [mode, setMode] = useState<"pct" | "amt">(
    editing && editing.commission_amount !== commissionFor(editing.total_price, editing.commission_pct) ? "amt" : "pct",
  );
  const [pctStr, setPct] = useState(String(startPct));
  const [amtStr, setAmt] = useState(editing ? String(editing.commission_amount) : "");
  const [later, setLater] = useState(editing ? editing.commission_later : Boolean(firstPlatform?.commission_later));
  const [costs, setCosts] = useState(editing ? String(editing.booking_costs) : "");
  const [status, setStatus] = useState<string>(editing?.status || "Confirmed");
  const editPaid = editing ? paidAmount(editing) : 0;
  const [payment, setPayment] = useState<string>(
    !editing || editPaid <= 0 ? "Not paid" : editPaid >= expectedIn(editing) ? "Paid" : "Part paid",
  );
  const [paidStr, setPaid] = useState(editing && editPaid > 0 ? String(editPaid) : "");

  const totalNum = toNum(total);
  const nights = nightsBetween(checkIn, checkOut);
  const commission = mode === "pct" ? commissionFor(totalNum, toNum(pctStr)) : toNum(amtStr);
  const shownPct = mode === "amt" ? (totalNum > 0 ? pct2((toNum(amtStr) / totalNum) * 100) : pctStr) : pctStr;
  const shownAmt = mode === "pct" ? String(commission) : amtStr;
  const net = netPayoutFor(totalNum, commission, toNum(costs));
  const toReceive = net + (later ? commission : 0);
  const base = rooms.find((r) => r.room_number === room)?.base_price ?? 0;

  if (!open) {
    return <button className="primary" onClick={() => setOpen(true)}>+ New booking</button>;
  }

  return (
    <form
      ref={ref}
      className="card form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        const f = formToObject(e.currentTarget);
        f.commission_amount = String(commission);
        f.commission_pct = shownPct;
        f.commission_later = later ? "yes" : "";
        call(() => saveBooking(f), () => {
          setOpen(false);
          router.push(cancelHref);
        });
      }}
    >
      <b className="full">{editing ? `Edit booking · ${editing.guest_name || editing.record_id}` : "New booking"}</b>
      <input type="hidden" name="record_id" value={editing?.record_id ?? ""} />
      <label className="field"><span>Room *</span>
        <select name="room_number" value={room} onChange={(e) => setRoom(e.target.value)}>
          {rooms.map((r) => <option key={r.room_number} value={r.room_number}>{r.room_number}{r.room_type ? ` · ${r.room_type}` : ""}</option>)}
        </select>
      </label>
      <label className="field"><span>Platform *</span>
        <select
          name="platform"
          value={platform}
          onChange={(e) => {
            const p = platforms.find((x) => x.name === e.target.value);
            setPlatform(e.target.value);
            setPct(String(p?.commission_pct ?? 0));
            setMode("pct");
            setLater(Boolean(p?.commission_later));
          }}
        >
          {platforms.map((p) => <option key={p.name}>{p.name}</option>)}
        </select>
      </label>
      <label className="field"><span>Check-in *</span><input type="date" name="check_in" required value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></label>
      <label className="field"><span>Check-out *</span><input type="date" name="check_out" required min={checkIn} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></label>
      <label className="field"><span>Guest name</span><input name="guest_name" defaultValue={editing?.guest_name ?? ""} /></label>
      <label className="field"><span>Guests</span><input type="number" name="guests" inputMode="numeric" min={0} step={1} defaultValue={editing?.guests || ""} /></label>
      <label className="field"><span>Booking ref</span><input name="booking_ref" defaultValue={editing?.booking_ref ?? ""} /></label>
      <label className="field"><span>Status</span>
        <select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>{BOOKING_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
      </label>
      <label className="row full" style={{ gap: 8 }}>
        <input type="checkbox" name="breakfast" value="yes" defaultChecked={editing?.breakfast ?? false} style={{ width: "auto", minHeight: 0 }} />
        <span>🍳 Breakfast included</span>
      </label>
      <label className="field full">
        <span>{status === "Cancelled" ? "Cancellation fee (Rs) – 0 if none" : "Total price (Rs) *"}</span>
        <input type="number" name="total_price" inputMode="numeric" min={0} step={1} required value={total} onChange={(e) => setTotal(e.target.value)} />
        {base > 0 && nights > 0 && status !== "Cancelled" && (
          <span className="small muted">Base price: {nights} × Rs {n(base)} = Rs {n(base * nights)} <button type="button" className="small" onClick={() => setTotal(String(base * nights))}>Use</button></span>
        )}
      </label>
      <label className="field"><span>Commission %{mode === "amt" ? " · from amount" : ""}</span>
        <input type="number" inputMode="decimal" min={0} max={100} step="0.01" value={shownPct} aria-label="Commission %"
          onChange={(e) => { setPct(e.target.value); setMode("pct"); }} />
      </label>
      <label className="field"><span>Commission (Rs){mode === "pct" ? " · from %" : ""}</span>
        <input type="number" inputMode="numeric" min={0} step={1} value={shownAmt} aria-label="Commission amount"
          onChange={(e) => { setAmt(e.target.value); setMode("amt"); }} />
      </label>
      <label className="row full" style={{ gap: 8 }}>
        <input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} style={{ width: "auto", minHeight: 0 }} />
        <span>Commission paid later <span className="small muted">(guest pays us the full price; pay the platform from the booking → saved under Costs)</span></span>
      </label>
      <label className="field full"><span>Booking costs (Rs) · cleaning, laundry, breakfast, transfers</span>
        <input type="number" name="booking_costs" inputMode="numeric" min={0} step={1} value={costs} onChange={(e) => setCosts(e.target.value)} />
      </label>

      <div className="full card" style={{ background: "var(--surface-2)", boxShadow: "none" }} aria-live="polite">
        <div className="spread small"><span>Nights</span><b>{nights || "-"}</b></div>
        <div className="spread small"><span>Total</span><span className="num">{n(totalNum)}</span></div>
        <div className="spread small"><span>− Commission{later ? " (paid later, under Costs)" : ""}</span><span className="num">{n(commission)}</span></div>
        <div className="spread small"><span>− Booking costs</span><span className="num">{n(toNum(costs))}</span></div>
        <div className="spread"><b>Net for the villa</b><b className={`num ${net < 0 ? "neg" : ""}`}>Rs {n(net)}</b></div>
        <div className="spread small"><span>To receive{later ? " (full price − booking costs)" : ""}</span><b className="num">Rs {n(toReceive)}</b></div>
        {nights > 0 && totalNum > 0 && <div className="small muted">Rs {n(Math.round(totalNum / nights))} per night</div>}
      </div>

      <label className="field"><span>Payment</span>
        <select name="payment" value={payment} onChange={(e) => setPayment(e.target.value)}>
          <option>Not paid</option><option>Part paid</option><option>Paid</option>
        </select>
      </label>
      {payment === "Part paid" && (
        <label className="field"><span>Amount paid (Rs) *</span>
          <input type="number" name="amount_paid" inputMode="numeric" min={1} step={1} required value={paidStr} onChange={(e) => setPaid(e.target.value)} />
        </label>
      )}
      {payment !== "Not paid" && (
        <>
          <label className="field"><span>Received to *</span>
            <select name="received_to" defaultValue={editing?.received_to || (platform === "Direct" ? "Villa petty cash" : "Owner Bank")}>
              {VILLA_RECEIVED_TO.map((a) => <option key={a} value={a}>{villaAccountLabel(a)}</option>)}
            </select>
          </label>
          <label className="field"><span>Payment date</span><input type="date" name="payout_date" defaultValue={editing?.payout_date || today} /></label>
          {payment === "Part paid" && <span className="small muted full">Still to receive: Rs {n(Math.max(0, toReceive - toNum(paidStr)))}</span>}
        </>
      )}
      <label className="field full"><span>Notes</span><input name="notes" defaultValue={editing?.notes ?? ""} /></label>
      <div className="full">{ui}</div>
      <div className="row full">
        <button className="primary" disabled={pending} style={{ flex: 1 }}>{pending ? "Checking & saving…" : editing ? "Update booking" : "Save booking"}</button>
        <button type="button" onClick={() => { setOpen(false); if (editing || startRoom || startCheckIn) router.push(cancelHref); }}>Cancel</button>
      </div>
    </form>
  );
}

export function CostForm({ editing, categories, rooms, today, cancelHref }: {
  editing: VillaRecord | null; categories: string[]; rooms: string[]; today: string; cancelHref: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const { pending, call, ui } = useAction();
  const cats = editing?.cost_category === COMMISSION_COST_CATEGORY ? [...categories, COMMISSION_COST_CATEGORY] : categories;
  const paidFrom = editing?.paid_from && !VILLA_PAID_FROM.includes(editing.paid_from) ? [...VILLA_PAID_FROM, editing.paid_from] : VILLA_PAID_FROM;
  return (
    <form
      ref={ref}
      className="card form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        const f = formToObject(e.currentTarget);
        call(() => saveVillaCost(f), () => {
          if (editing) router.push(cancelHref);
          else ref.current?.reset();
        });
      }}
    >
      <b className="full">{editing ? "Edit villa cost" : "Add villa cost"}</b>
      <input type="hidden" name="record_id" value={editing?.record_id ?? ""} />
      <label className="field"><span>Date *</span><input type="date" name="date_entered" required defaultValue={editing?.date_entered ?? today} /></label>
      <label className="field"><span>Amount (Rs) *</span><input type="number" name="cost_amount" inputMode="numeric" min={1} step={1} required defaultValue={editing?.cost_amount || ""} /></label>
      <label className="field full"><span>Category *</span>
        <select name="cost_category" defaultValue={editing?.cost_category ?? cats[0]}>{cats.map((c) => <option key={c}>{c}</option>)}</select>
      </label>
      <label className="field"><span>Room</span>
        <select name="cost_room" defaultValue={editing?.cost_room || ALL_ROOMS}><option>{ALL_ROOMS}</option>{rooms.map((r) => <option key={r}>{r}</option>)}</select>
      </label>
      <label className="field"><span>Paid from</span>
        <select name="paid_from" defaultValue={editing?.paid_from || "Villa petty cash"}>{paidFrom.map((a) => <option key={a} value={a}>{villaAccountLabel(a)}</option>)}</select>
      </label>
      <label className="field full"><span>Description</span><input name="cost_description" defaultValue={editing?.cost_description ?? ""} placeholder="e.g. 6 bath towels" /></label>
      <label className="field full"><span>Notes</span><input name="notes" defaultValue={editing?.notes ?? ""} /></label>
      <div className="full small muted">Owner Bank and Owner Cash are your own money: they don&apos;t change the business balances and count as money put into the villa (Recovery tab).</div>
      <div className="full">{ui}</div>
      <div className="row full">
        <button className="primary" disabled={pending} style={{ flex: 1 }}>{pending ? "Saving…" : editing ? "Update cost" : "Save cost"}</button>
        {editing && <button type="button" onClick={() => router.push(cancelHref)}>Cancel</button>}
      </div>
    </form>
  );
}

/** Add a full or part payment to a booking. */
export function PaymentButton({ id, today, due, defaultTo }: { id: string; today: string; due: number; defaultTo: string }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultTo);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState(String(due));
  const { pending, call, ui } = useAction();
  if (!open) return <button className="small" onClick={() => setOpen(true)}>+ Payment</button>;
  return (
    <span className="row">
      <input type="number" inputMode="numeric" min={1} max={due} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 120, minHeight: 36 }} aria-label="Amount received" />
      <select value={to} onChange={(e) => setTo(e.target.value)} style={{ width: "auto", minHeight: 36 }} aria-label="Received to">{VILLA_RECEIVED_TO.map((a) => <option key={a} value={a}>{villaAccountLabel(a)}</option>)}</select>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 150, minHeight: 36 }} aria-label="Payment date" />
      <button className="small primary" disabled={pending} onClick={() => call(() => recordPayment(id, amount, to, date), () => setOpen(false))}>Save</button>
      <button className="small" onClick={() => setOpen(false)}>✕</button>
      {ui}
    </span>
  );
}

/** Pay a "paid later" commission; it is saved as a villa Cost. */
export function CommissionButton({ id, today, amount }: { id: string; today: string; amount: number }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<string>("Owner Bank");
  const [date, setDate] = useState(today);
  const { pending, call, ui } = useAction();
  if (!open) return <button className="small" onClick={() => setOpen(true)}>Pay commission Rs {n(amount)}</button>;
  return (
    <span className="row">
      <select value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: "auto", minHeight: 36 }} aria-label="Paid from">{VILLA_PAID_FROM.map((a) => <option key={a} value={a}>{villaAccountLabel(a)}</option>)}</select>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 150, minHeight: 36 }} aria-label="Date paid" />
      <button className="small primary" disabled={pending} onClick={() => call(() => payCommission(id, from, date), () => setOpen(false))}>Save</button>
      <button className="small" onClick={() => setOpen(false)}>✕</button>
      {ui}
    </span>
  );
}

/** Checklist: other platforms closed by hand for these dates. */
export function ClosePlatforms({ id, platforms, closed }: { id: string; platforms: string[]; closed: string[] }) {
  const { pending, call, ui } = useAction();
  if (!platforms.length) return null;
  const left = platforms.filter((p) => !closed.includes(p)).length;
  return (
    <div className={`close-list ${left ? "open" : "done"}`}>
      <span className="small"><b>{left ? `⚠ Close on other platforms (${left} left)` : "✓ Other platforms closed"}</b></span>
      {platforms.map((p) => (
        <label key={p} className="row small" style={{ gap: 4 }}>
          <input type="checkbox" checked={closed.includes(p)} disabled={pending} onChange={(e) => call(() => setPlatformClosed(id, p, e.target.checked))} style={{ width: "auto", minHeight: 0 }} />
          {p}
        </label>
      ))}
      {ui}
    </div>
  );
}

export function DeleteVillaButton({ id, label }: { id: string; label: string }) {
  const { pending, call, ui } = useAction();
  return (
    <>
      <button className="small danger" disabled={pending} onClick={() => confirm(`Delete this ${label}?`) && call(() => deleteVillaRecord(id))} aria-label={`Delete ${label}`}>✕</button>
      {ui}
    </>
  );
}
