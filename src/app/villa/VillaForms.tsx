"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteVillaRecord, markPayoutReceived, saveBooking, saveVillaCost } from "@/app/actions";
import { formToObject, useAction } from "@/components/ui";
import { commissionFor, netPayoutFor, nightsBetween } from "@/lib/calc/villa";
import { ACCOUNTS, ALL_ROOMS, BOOKING_STATUSES, PAYOUT_STATUSES, type VillaPlatform, type VillaRecord, type VillaRoom } from "@/lib/types";

const n = (v: number) => Math.round(v || 0).toLocaleString("en-US");
const toNum = (s: string) => {
  const v = Number(String(s).replace(/,/g, ""));
  return Number.isFinite(v) ? v : 0;
};

export function BookingForm({ editing, rooms, platforms, today, cancelHref }: {
  editing: VillaRecord | null; rooms: VillaRoom[]; platforms: VillaPlatform[]; today: string; cancelHref: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const { pending, call, ui } = useAction();
  const [open, setOpen] = useState(Boolean(editing));
  const [room, setRoom] = useState(editing?.room_number ?? rooms[0]?.room_number ?? "");
  const [platform, setPlatform] = useState(editing?.platform ?? platforms[0]?.name ?? "");
  const [checkIn, setCheckIn] = useState(editing?.check_in ?? today);
  const [checkOut, setCheckOut] = useState(editing?.check_out ?? "");
  const [total, setTotal] = useState(editing ? String(editing.total_price) : "");
  const [pctStr, setPct] = useState(editing ? String(editing.commission_pct) : String(platforms[0]?.commission_pct ?? 0));
  // Commission amount follows total × % until the user types their own amount.
  const [commissionOverride, setCommissionOverride] = useState<string>(
    editing && editing.commission_amount !== commissionFor(editing.total_price, editing.commission_pct) ? String(editing.commission_amount) : "",
  );
  const [costs, setCosts] = useState(editing ? String(editing.booking_costs) : "");
  const [payout, setPayout] = useState<string>(editing?.payout_status || "Pending");
  const [status, setStatus] = useState<string>(editing?.status || "Confirmed");

  const nights = nightsBetween(checkIn, checkOut);
  const computedCommission = commissionFor(toNum(total), toNum(pctStr));
  const commission = commissionOverride === "" ? computedCommission : toNum(commissionOverride);
  const net = netPayoutFor(toNum(total), commission, toNum(costs));
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
            setPlatform(e.target.value);
            setPct(String(platforms.find((p) => p.name === e.target.value)?.commission_pct ?? 0));
            setCommissionOverride("");
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
      <label className="field full">
        <span>{status === "Cancelled" ? "Cancellation fee (Rs) – 0 if none" : "Total price (Rs) *"}</span>
        <input type="number" name="total_price" inputMode="numeric" min={0} step={1} required value={total} onChange={(e) => setTotal(e.target.value)} />
        {base > 0 && nights > 0 && status !== "Cancelled" && (
          <span className="small muted">Base price: {nights} × Rs {n(base)} = Rs {n(base * nights)} <button type="button" className="small" onClick={() => setTotal(String(base * nights))}>Use</button></span>
        )}
      </label>
      <label className="field"><span>Commission %</span><input type="number" name="commission_pct" inputMode="decimal" min={0} max={100} step="0.1" value={pctStr} onChange={(e) => { setPct(e.target.value); setCommissionOverride(""); }} /></label>
      <label className="field"><span>Commission (Rs){commissionOverride !== "" && " · edited"}</span>
        <input type="number" inputMode="numeric" min={0} step={1} value={commissionOverride === "" ? computedCommission : commissionOverride} onChange={(e) => setCommissionOverride(e.target.value)} aria-label="Commission amount" />
      </label>
      <label className="field full"><span>Booking costs (Rs) · cleaning, laundry, breakfast, transfers</span>
        <input type="number" name="booking_costs" inputMode="numeric" min={0} step={1} value={costs} onChange={(e) => setCosts(e.target.value)} />
      </label>

      <div className="full card" style={{ background: "var(--surface-2)", boxShadow: "none" }} aria-live="polite">
        <div className="spread small"><span>Nights</span><b>{nights || "-"}</b></div>
        <div className="spread small"><span>Total</span><span className="num">{n(toNum(total))}</span></div>
        <div className="spread small"><span>− Commission</span><span className="num">{n(commission)}</span></div>
        <div className="spread small"><span>− Booking costs</span><span className="num">{n(toNum(costs))}</span></div>
        <div className="spread"><b>Net payout</b><b className={`num ${net < 0 ? "neg" : ""}`}>Rs {n(net)}</b></div>
        {nights > 0 && toNum(total) > 0 && <div className="small muted">Rs {n(Math.round(toNum(total) / nights))} per night</div>}
      </div>

      <label className="field"><span>Payout status</span>
        <select name="payout_status" value={payout} onChange={(e) => setPayout(e.target.value)}>{PAYOUT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
      </label>
      <label className="field"><span>Received to{payout === "Received" ? " *" : ""}</span>
        <select name="received_to" defaultValue={editing?.received_to || (platform === "Direct" ? "Petty cash" : "Bank")}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select>
      </label>
      {payout === "Received" && <label className="field full"><span>Payout date</span><input type="date" name="payout_date" defaultValue={editing?.payout_date || today} /></label>}
      <label className="field full"><span>Notes</span><input name="notes" defaultValue={editing?.notes ?? ""} /></label>
      <div className="full">{ui}</div>
      <div className="row full">
        <button className="primary" disabled={pending} style={{ flex: 1 }}>{pending ? "Checking & saving…" : editing ? "Update booking" : "Save booking"}</button>
        <button type="button" onClick={() => { setOpen(false); if (editing) router.push(cancelHref); }}>Cancel</button>
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
        <select name="cost_category" defaultValue={editing?.cost_category ?? categories[0]}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
      </label>
      <label className="field"><span>Room</span>
        <select name="cost_room" defaultValue={editing?.cost_room || ALL_ROOMS}><option>{ALL_ROOMS}</option>{rooms.map((r) => <option key={r}>{r}</option>)}</select>
      </label>
      <label className="field"><span>Paid from</span>
        <select name="paid_from" defaultValue={editing?.paid_from || "Petty cash"}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select>
      </label>
      <label className="field full"><span>Description</span><input name="cost_description" defaultValue={editing?.cost_description ?? ""} placeholder="e.g. 6 bath towels" /></label>
      <label className="field full"><span>Notes</span><input name="notes" defaultValue={editing?.notes ?? ""} /></label>
      <div className="full">{ui}</div>
      <div className="row full">
        <button className="primary" disabled={pending} style={{ flex: 1 }}>{pending ? "Saving…" : editing ? "Update cost" : "Save cost"}</button>
        {editing && <button type="button" onClick={() => router.push(cancelHref)}>Cancel</button>}
      </div>
    </form>
  );
}

export function PayoutButton({ id, today, defaultTo }: { id: string; today: string; defaultTo: string }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultTo);
  const [date, setDate] = useState(today);
  const { pending, call, ui } = useAction();
  if (!open) return <button className="small" onClick={() => setOpen(true)}>Mark payout received</button>;
  return (
    <span className="row">
      <select value={to} onChange={(e) => setTo(e.target.value)} style={{ width: "auto", minHeight: 36 }} aria-label="Received to">{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 150, minHeight: 36 }} aria-label="Payout date" />
      <button className="small primary" disabled={pending} onClick={() => call(() => markPayoutReceived(id, to, date), () => setOpen(false))}>Save</button>
      <button className="small" onClick={() => setOpen(false)}>✕</button>
      {ui}
    </span>
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
