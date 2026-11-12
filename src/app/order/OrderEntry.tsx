"use client";

import { useEffect, useMemo, useState } from "react";
import { saveOrder } from "@/app/actions";
import { useAction } from "@/components/ui";
import { MEALS, PAYMENT_METHODS, type Meal, type MenuItem, type OrderChannel, type PaymentMethod } from "@/lib/types";
import { uberCommission, uberPrice } from "@/lib/calc/uber";
import { printReceipt } from "@/components/printReceipt";
import type { ReceiptOrder, ReceiptSettings } from "@/lib/receipt";

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;

const PRINT_KEY = "mo.printReceipt";

export interface UberSettings {
  uber_markup_pct: number;
  uber_commission_pct: number;
}

export function OrderEntry({
  menu, today, defaultMeal, categories: settingCats, uber: uberSettings, defaultChannel = "Cafe", receiptSettings,
}: {
  menu: MenuItem[]; today: string; defaultMeal: Meal; categories: string[]; uber: UberSettings;
  defaultChannel?: OrderChannel; receiptSettings: ReceiptSettings;
}) {
  // Settings order first; then any category in use but not listed in Settings.
  const categories = useMemo(
    () => [...settingCats.filter((c) => menu.some((m) => m.category === c)), ...Array.from(new Set(menu.map((m) => m.category))).filter((c) => !settingCats.includes(c))],
    [menu, settingCats],
  );
  const [meal, setMeal] = useState<Meal>(defaultMeal);
  const [channel, setChannel] = useState<OrderChannel>(defaultChannel);
  const isUber = channel === "Uber";
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
  const label = (m: MenuItem) => (m.item_name === m.sub_category || !m.sub_category ? m.item_name : `${m.sub_category} · ${m.item_name}`);

  const submit = () =>
    call(
      () => saveOrder({ channel, meal, payment_method: isUber ? "Uber" : pay, notes, date, lines: lines.map((l) => ({ item_id: l.item.item_id, qty: l.qty })) }),
      (r) => {
        setCart({});
        setNotes("");
        setShowCart(false);
        // Print right here (no page change), so the next order can start straight away.
        if (r.receipt) {
          setLastReceipt(r.receipt);
          if (printAfter) printReceipt(r.receipt, receiptSettings);
        }
      },
    );

  return (
    <div className="stack" style={{ paddingBottom: 150 }}>
      <div className="spread">
        <h1 style={{ margin: 0 }}>{isUber ? "New Uber order" : "New order"}</h1>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} aria-label="Order date" />
      </div>

      <div className="seg channel" role="group" aria-label="Order type">
        <button type="button" className={!isUber ? "on" : ""} aria-pressed={!isUber} onClick={() => setChannel("Cafe")}>☕ Cafe</button>
        <button type="button" className={isUber ? "on uber" : ""} aria-pressed={isUber} onClick={() => setChannel("Uber")}>🛵 Uber</button>
      </div>
      {isUber && (
        <div className="uber-note small">
          Uber prices = menu price + {uberSettings.uber_markup_pct}%. Paid to <b>Bank</b>. Uber commission ({uberSettings.uber_commission_pct}% of the total) is saved as a daily cost automatically.
        </div>
      )}

      <div className="seg" role="group" aria-label="Meal">
        {MEALS.map((m) => (
          <button key={m} type="button" className={meal === m ? "on" : ""} aria-pressed={meal === m} onClick={() => setMeal(m)}>
            {m}
          </button>
        ))}
      </div>

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
            {label(m)}
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
              {lines.map((l) => (
                <div key={l.item.item_id} className="spread">
                  <span style={{ flex: 1 }}>{label(l.item)}</span>
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
              {isUber ? (
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
            <button type="button" className="primary" disabled={!count || pending} onClick={() => (showCart ? submit() : setShowCart(true))} style={{ flex: 1 }}>
              {pending ? "Saving…" : showCart ? `Save · ${isUber ? "Uber" : pay}` : "Review"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
