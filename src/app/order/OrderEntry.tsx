"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveOrder } from "@/app/actions";
import { useAction } from "@/components/ui";
import { ORDER_TYPES, ORDER_TYPE_ICON, PAYMENT_METHODS, type DiningArea, type Meal, type MenuItem, type OrderChannel, type OrderType, type PaymentMethod } from "@/lib/types";
import { uberCommission, uberPrice } from "@/lib/calc/uber";
import { printReceipt } from "@/components/printReceipt";
import type { ReceiptOrder, ReceiptSettings } from "@/lib/receipt";

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;

const PRINT_KEY = "mo.printReceipt";

/** An open bill as the order screen needs it. */
export interface BillSummary {
  order_id: string;
  label: string;
  total: number;
  items: number;
  lines: { name: string; qty: number }[];
}

export interface UberSettings {
  uber_markup_pct: number;
  uber_commission_pct: number;
}

export function OrderEntry({
  menu, today, defaultMeal, categories: settingCats, uber: uberSettings, defaultChannel = "Cafe", receiptSettings, areas,
  openBills = [], busy = {}, addTo, addToMissing,
}: {
  menu: MenuItem[]; today: string; defaultMeal: Meal; categories: string[]; uber: UberSettings;
  defaultChannel?: OrderChannel; receiptSettings: ReceiptSettings; areas: DiningArea[];
  openBills?: BillSummary[]; busy?: Record<string, string>; addTo?: BillSummary; addToMissing?: boolean;
}) {
  const router = useRouter();
  // Settings order first; then any category in use but not listed in Settings.
  const categories = useMemo(
    () => [...settingCats.filter((c) => menu.some((m) => m.category === c)), ...Array.from(new Set(menu.map((m) => m.category))).filter((c) => !settingCats.includes(c))],
    [menu, settingCats],
  );
  const [type, setType] = useState<OrderType>(defaultChannel === "Uber" ? "Uber" : "Dine-in");
  const [table, setTable] = useState("");
  const [pickTable, setPickTable] = useState(true);
  const isUber = type === "Uber";
  const needsTable = !addTo && type === "Dine-in" && !table;
  const areaOf = (t: string) => Math.max(0, areas.findIndex((a) => a.tables.includes(t)));
  const chooseType = (t: OrderType) => {
    setType(t);
    if (t === "Dine-in" && !table) setPickTable(true);
  };
  // Price shown and charged for an item in the current channel.
  const priceOf = (m: MenuItem) => (isUber ? uberPrice(m.selling_price, uberSettings) : m.selling_price);
  const [pay, setPay] = useState<PaymentMethod>("Cash");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(today);
  // Breakfast opens the first category (e.g. Brunch); other meals open the second one if there is one.
  const [cat, setCat] = useState<string>((defaultMeal === "Breakfast" ? categories[0] : categories[1] ?? categories[0]) ?? "");
  const [printAfter, setPrintAfter] = useState(true);
  const [lastReceipt, setLastReceipt] = useState<ReceiptOrder | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem(PRINT_KEY);
      if (v !== null) setPrintAfter(v === "1");
    } catch {}
  }, []);
  const togglePrint = (v: boolean) => {
    setPrintAfter(v);
    try { localStorage.setItem(PRINT_KEY, v ? "1" : "0"); } catch {}
  };
  const [sub, setSub] = useState<string>("");
  const [query, setQuery] = useState("");
  const [showCart, setShowCart] = useState(false);
  const { pending, call, ui } = useAction();

  const subs = useMemo(() => Array.from(new Set(menu.filter((m) => m.category === cat).map((m) => m.sub_category))), [menu, cat]);
  const shown = menu.filter((m) =>
    query ? `${m.item_name} ${m.sub_category}`.toLowerCase().includes(query.toLowerCase()) : m.category === cat && (!sub || m.sub_category === sub),
  );

  const lines = Object.entries(cart).filter(([, q]) => q > 0).map(([id, qty]) => ({ item: menu.find((m) => m.item_id === id)!, qty })).filter((l) => l.item);
  const total = lines.reduce((t, l) => t + l.qty * priceOf(l.item), 0);
  const commission = isUber ? uberCommission(total, uberSettings) : 0;
  const count = lines.reduce((t, l) => t + l.qty, 0);

  const add = (id: string, d: number) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + d) }));
  const setQty = (id: string, q: number) => setCart((c) => ({ ...c, [id]: Number.isFinite(q) && q > 0 ? Math.floor(q) : 0 }));
  // Small grey menu group under the name (e.g. "SweetMO"), so names stay quick to read. The receipt keeps "SweetMO · name".
  const group = (m: MenuItem) => (m.sub_category && m.sub_category !== m.item_name ? m.sub_category : "");

  const submit = (open: boolean) =>
    call(
      () => saveOrder({
        channel: isUber ? "Uber" : "Cafe", order_type: type, table_no: type === "Dine-in" ? table : "", payment_method: isUber ? "Uber" : pay,
        notes, date, lines: lines.map((l) => ({ item_id: l.item.item_id, qty: l.qty })), open, bill_id: addTo?.order_id,
      }),
      (r) => {
        setCart({});
        setNotes("");
        setShowCart(false);
        // Next guest: pick the table again.
        setTable("");
        setPickTable(true);
        // Print right here (no page change), so the next order can start straight away.
        if (r.receipt) {
          if (r.ticket === "receipt") setLastReceipt(r.receipt);
          if (printAfter) printReceipt(r.receipt, receiptSettings, r.ticket ?? "receipt");
        }
        // Open bills change: refresh the list, and leave "add to bill" mode.
        if (r.ticket !== "receipt") router.push(addTo ? `/bills/${encodeURIComponent(addTo.order_id)}` : "/order");
        else router.refresh();
      },
    );

  return (
    <div className="stack" style={{ paddingBottom: 150 }}>
      <div className="spread">
        <h1 style={{ margin: 0 }}>{addTo ? `Add to ${addTo.label}` : isUber ? "New Uber order" : "New order"}</h1>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} aria-label="Order date" />
      </div>

      {addToMissing && <div className="errors">That bill is no longer open (paid or voided). This is a new order.</div>}
      {addTo ? (
        <div className="card add-to">
          <div className="spread"><b>🧾 {addTo.label} · open bill</b><Link href={`/bills/${encodeURIComponent(addTo.order_id)}`} className="small">Back to bill</Link></div>
          <div className="small muted">Already ordered: {addTo.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")} · {rs(addTo.total)}</div>
          <div className="small">Pick the new items below, then <b>Add to bill</b>. Only the new items go to the kitchen.</div>
        </div>
      ) : (
      <>
      {openBills.length > 0 && (
        <div className="open-bills" role="list" aria-label="Open bills">
          <Link href="/bills" className="small" style={{ fontWeight: 700 }}>🧾 Open bills ({openBills.length})</Link>
          {openBills.map((b) => (
            <Link key={b.order_id} role="listitem" href={`/bills/${encodeURIComponent(b.order_id)}`} className="bill-chip">
              {b.label} · {rs(b.total)}
            </Link>
          ))}
        </div>
      )}
      <div className="seg channel" role="group" aria-label="Order type">
        {ORDER_TYPES.map((t) => (
          <button key={t} type="button" className={`${type === t ? "on" : ""} ${t === "Uber" && type === t ? "uber" : ""}`} aria-pressed={type === t} onClick={() => chooseType(t)}>
            <span aria-hidden>{ORDER_TYPE_ICON[t]}</span> {t}
          </button>
        ))}
      </div>

      {type === "Dine-in" && (table && !pickTable ? (
        <div className="row table-picked">
          <span className="small muted">Table</span>
          <span className={`table-chip on area-${areaOf(table)}`}>🍽️ {table}</span>
          <button type="button" className="small" onClick={() => setPickTable(true)}>Change</button>
        </div>
      ) : (
        <div className="table-pick" role="group" aria-label="Table">
          {areas.map((a, i) => (
            <div key={a.name} className="table-area">
              <span className={`area-name area-${i}`}>{a.name}</span>
              <div className="table-row">
                {a.tables.map((t) => (
                  <button key={t} type="button" className={`table-chip area-${i} ${table === t ? "on" : ""} ${busy[t] ? "busy" : ""}`} aria-pressed={table === t}
                    aria-label={busy[t] ? `${t} – has an open bill, open it` : t}
                    onClick={() => (busy[t] ? router.push(`/bills/${encodeURIComponent(busy[t])}`) : (setTable(t), setPickTable(false)))}>
                    {t.slice(a.name.length).trim() || t}
                    {busy[t] && <span className="busy-dot">open</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
      {type === "Take-away" && <div className="pack-note small">📦 Take-away – the kitchen packs this order.</div>}
      </>
      )}
      {isUber && (
        <div className="uber-note small">
          Uber prices = menu price + {uberSettings.uber_markup_pct}%. Paid to <b>Bank</b>. Uber commission ({uberSettings.uber_commission_pct}% of the total) is saved as a daily cost automatically.
        </div>
      )}

      <input type="search" placeholder="Search menu…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search menu" />

      {!query && (
        <>
          <div className="chips" role="group" aria-label="Category">
            {categories.map((c) => (
              <button key={c} type="button" className={cat === c ? "on" : ""} onClick={() => { setCat(c); setSub(""); }}>
                {c}
              </button>
            ))}
          </div>
          <div className="chips" role="group" aria-label="Sub-category">
            <button type="button" className={!sub ? "on" : ""} onClick={() => setSub("")}>All</button>
            {subs.map((s) => (
              <button key={s} type="button" className={sub === s ? "on" : ""} onClick={() => setSub(s)}>{s}</button>
            ))}
          </div>
        </>
      )}

      <div className="tiles">
        {shown.map((m) => (
          <button key={m.item_id} type="button" className={`tile ${cart[m.item_id] ? "picked" : ""}`} onClick={() => add(m.item_id, 1)}>
            <span className="tile-name">{m.item_name}</span>
            {group(m) && <span className="tile-group">{group(m)}</span>}
            <span className="price">{rs(priceOf(m))}</span>
            {cart[m.item_id] > 0 && <span className="count">{cart[m.item_id]}</span>}
          </button>
        ))}
        {shown.length === 0 && <span className="muted">No items</span>}
      </div>

      {ui}
      {lastReceipt && (
        <div className="row small no-print">
          <span className="muted">Last order {lastReceipt.order_id}</span>
          <button type="button" className="small" onClick={() => printReceipt(lastReceipt, receiptSettings)}>🖨 Print again</button>
          <a className="small" href={`/receipt/${encodeURIComponent(lastReceipt.order_id)}`}>View</a>
        </div>
      )}

      <div className="cart-bar">
        <div className="inner stack">
          {showCart && (
            <div className="stack" style={{ maxHeight: "45vh", overflowY: "auto" }}>
              <div className="spread cart-head">
                <b>{addTo ? `🧾 Add to ${addTo.label}` : `${ORDER_TYPE_ICON[type]} ${type === "Dine-in" ? table || "Pick a table" : type === "Take-away" ? "Take-away · pack" : "Uber · pack"}`}</b>
                <button type="button" className="small" onClick={() => setShowCart(false)} aria-label="Hide the order review to add more items">▾ Hide · add more items</button>
              </div>
              {lines.map((l) => (
                <div key={l.item.item_id} className="spread">
                  <span style={{ flex: 1 }}>
                    {l.item.item_name}
                    {group(l.item) && <span className="tile-group">{group(l.item)}</span>}
                  </span>
                  <span className="qty">
                    <button type="button" onClick={() => add(l.item.item_id, -1)} aria-label="Less">−</button>
                    <input type="number" inputMode="numeric" min={1} value={l.qty} onChange={(e) => setQty(l.item.item_id, Number(e.target.value))} aria-label={`Quantity ${l.item.item_name}`} />
                    <button type="button" onClick={() => add(l.item.item_id, 1)} aria-label="More">+</button>
                  </span>
                  <b className="num" style={{ width: 96 }}>{rs(l.qty * priceOf(l.item))}</b>
                </div>
              ))}
              <input placeholder="Notes (table, guest, discount reason…)" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <label className="row small"><input type="checkbox" checked={printAfter} onChange={(e) => togglePrint(e.target.checked)} /> Print receipt after saving</label>
              {addTo ? null : isUber ? (
                <div className="uber-note sum small">
                  <div className="spread"><span>Uber order total</span><b>{rs(total)}</b></div>
                  <div className="spread"><span>Uber commission {uberSettings.uber_commission_pct}% → daily cost (Bank)</span><b>− {rs(commission)}</b></div>
                  <div className="spread"><span>Cafe receives</span><b>{rs(total - commission)}</b></div>
                </div>
              ) : (
                <div className="seg" role="group" aria-label="Payment method">
                  {PAYMENT_METHODS.map((p) => (
                    <button key={p} type="button" className={pay === p ? "on" : ""} aria-pressed={pay === p} onClick={() => setPay(p)}>{p}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="row">
            <button type="button" onClick={() => setShowCart((s) => !s)} disabled={!count} style={{ flex: 1, justifyContent: "space-between" }}>
              <span>{count} item{count === 1 ? "" : "s"} {showCart ? "▾" : "▴"}</span>
              <b>{rs(total)}</b>
            </button>
            {count > 0 && !showCart && <button type="button" onClick={() => setCart({})} className="small">Clear</button>}
            {!showCart || pending ? (
              <button type="button" className="primary" disabled={!count || pending} onClick={() => setShowCart(true)} style={{ flex: 1 }}>
                {pending ? "Saving…" : "Review"}
              </button>
            ) : addTo ? (
              <button type="button" className="primary" onClick={() => submit(true)} style={{ flex: 1 }}>🍳 Add to bill · send to kitchen</button>
            ) : needsTable ? (
              <button type="button" className="primary" disabled style={{ flex: 1 }}>Pick a table first</button>
            ) : isUber ? (
              <button type="button" className="primary" onClick={() => submit(false)} style={{ flex: 1 }}>Save · Uber</button>
            ) : (
              // Dine-in usually pays after eating (open bill); take-away usually pays now. Both are offered.
              <div className="row" style={{ flex: 1.6, gap: 6 }}>
                <button type="button" className={type === "Dine-in" ? "primary" : ""} onClick={() => submit(true)} style={{ flex: 1 }}>🍳 Kitchen · pay later</button>
                <button type="button" className={type === "Dine-in" ? "" : "primary"} onClick={() => submit(false)} style={{ flex: 1 }}>Pay now · {pay}</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
