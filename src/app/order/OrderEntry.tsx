"use client";

import { useMemo, useState } from "react";
import { saveOrder } from "@/app/actions";
import { useAction } from "@/components/ui";
import { MEALS, PAYMENT_METHODS, type Meal, type MenuItem, type PaymentMethod } from "@/lib/types";

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;

export function OrderEntry({ menu, today, defaultMeal }: { menu: MenuItem[]; today: string; defaultMeal: Meal }) {
  const [meal, setMeal] = useState<Meal>(defaultMeal);
  const [pay, setPay] = useState<PaymentMethod>("Cash");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(today);
  const [cat, setCat] = useState<string>(defaultMeal === "Breakfast" ? "Breakfast" : "All day dining");
  const [sub, setSub] = useState<string>("");
  const [query, setQuery] = useState("");
  const [showCart, setShowCart] = useState(false);
  const { pending, call, ui } = useAction();

  const categories = useMemo(() => Array.from(new Set(menu.map((m) => m.category))), [menu]);
  const subs = useMemo(() => Array.from(new Set(menu.filter((m) => m.category === cat).map((m) => m.sub_category))), [menu, cat]);
  const shown = menu.filter((m) =>
    query ? `${m.item_name} ${m.sub_category}`.toLowerCase().includes(query.toLowerCase()) : m.category === cat && (!sub || m.sub_category === sub),
  );

  const lines = Object.entries(cart).filter(([, q]) => q > 0).map(([id, qty]) => ({ item: menu.find((m) => m.item_id === id)!, qty })).filter((l) => l.item);
  const total = lines.reduce((t, l) => t + l.qty * l.item.selling_price, 0);
  const count = lines.reduce((t, l) => t + l.qty, 0);

  const add = (id: string, d: number) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + d) }));
  const setQty = (id: string, q: number) => setCart((c) => ({ ...c, [id]: Number.isFinite(q) && q > 0 ? Math.floor(q) : 0 }));
  const label = (m: MenuItem) => (m.item_name === m.sub_category || !m.sub_category ? m.item_name : `${m.sub_category} · ${m.item_name}`);

  const submit = () =>
    call(
      () => saveOrder({ meal, payment_method: pay, notes, date, lines: lines.map((l) => ({ item_id: l.item.item_id, qty: l.qty })) }),
      () => {
        setCart({});
        setNotes("");
        setShowCart(false);
      },
    );

  return (
    <div className="stack" style={{ paddingBottom: 150 }}>
      <div className="spread">
        <h1 style={{ margin: 0 }}>New order</h1>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} aria-label="Order date" />
      </div>

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
            <span className="price">{rs(m.selling_price)}</span>
            {cart[m.item_id] > 0 && <span className="count">{cart[m.item_id]}</span>}
          </button>
        ))}
        {shown.length === 0 && <span className="muted">No items</span>}
      </div>

      {ui}

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
                  <b className="num" style={{ width: 96 }}>{rs(l.qty * l.item.selling_price)}</b>
                </div>
              ))}
              <input placeholder="Notes (table, guest, discount reason…)" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <div className="seg" role="group" aria-label="Payment method">
                {PAYMENT_METHODS.map((p) => (
                  <button key={p} type="button" className={pay === p ? "on" : ""} aria-pressed={pay === p} onClick={() => setPay(p)}>{p}</button>
                ))}
              </div>
            </div>
          )}
          <div className="row">
            <button type="button" onClick={() => setShowCart((s) => !s)} disabled={!count} style={{ flex: 1, justifyContent: "space-between" }}>
              <span>{count} item{count === 1 ? "" : "s"} {showCart ? "▾" : "▴"}</span>
              <b>{rs(total)}</b>
            </button>
            {count > 0 && !showCart && <button type="button" onClick={() => setCart({})} className="small">Clear</button>}
            <button type="button" className="primary" disabled={!count || pending} onClick={() => (showCart ? submit() : setShowCart(true))} style={{ flex: 1 }}>
              {pending ? "Saving…" : showCart ? `Save · ${pay}` : "Review"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
