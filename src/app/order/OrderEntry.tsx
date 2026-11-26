"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveOrder } from "@/app/actions";
import { useAction } from "@/components/ui";
import { ORDER_TYPES, ORDER_TYPE_ICON, PAYMENT_METHODS, type DiningArea, type Meal, type MenuItem, type OrderChannel, type OrderType, type PaymentMethod } from "@/lib/types";
import { uberCommission, uberPrice } from "@/lib/calc/uber";
import { discountAmount, discountLabel, discountProblem, linePrice, type DiscountType } from "@/lib/calc/pricing";
import { printReceipt } from "@/components/printReceipt";
import { OpenFor } from "@/components/OpenFor";
import type { ReceiptOrder, ReceiptSettings } from "@/lib/receipt";

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;

const PRINT_KEY = "mo.printReceipt";

/** An open bill as the order screen needs it. */
export interface BillSummary {
  order_id: string;
  label: string;
  total: number;
  items: number;
  /** Minutes since the bill was opened (when the page loaded). */
  minutes: number;
  lines: { name: string; qty: number }[];
}

export interface UberSettings {
  uber_markup_pct: number;
  uber_commission_pct: number;
}

/** A paid extra on one cart line: a menu add-on (item_id) or a typed one. */
interface CartAddon {
  item_id: string;
  name: string;
  price: number;
  qty: number;
}

/** One line in the cart. The same dish can be on two lines with different options. */
interface CartLine {
  key: string;
  item_id: string;
  qty: number;
  note: string;
  addons: CartAddon[];
  dtype: DiscountType;
  dvalue: number;
}

const plain = (l: CartLine) => !l.note && !l.addons.length && !l.dtype;
let keySeq = 0;
const newKey = () => `L${++keySeq}`;

export function OrderEntry({
  menu, today, defaultMeal, categories: settingCats, uber: uberSettings, defaultChannel = "Cafe", receiptSettings, areas,
  openBills = [], busy = {}, addTo, addToMissing, addonItems = [], noteTags = [], defaultOffer = "",
}: {
  menu: MenuItem[]; today: string; defaultMeal: Meal; categories: string[]; uber: UberSettings;
  defaultChannel?: OrderChannel; receiptSettings: ReceiptSettings; areas: DiningArea[];
  openBills?: BillSummary[]; busy?: Record<string, string>; addTo?: BillSummary; addToMissing?: boolean;
  /** Menu items of the add-on category (Extra cheese, …). */
  addonItems?: MenuItem[];
  /** Quick kitchen notes (Allergies, More spicy, …). */
  noteTags?: string[];
  /** Default next-day offer text (Settings). */
  defaultOffer?: string;
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
  // Price shown and charged in the current channel (Uber prices for Uber, add-ons too).
  const chPrice = (p: number) => (isUber ? uberPrice(p, uberSettings) : p);
  const priceOf = (m: MenuItem) => chPrice(m.selling_price);
  const [pay, setPay] = useState<PaymentMethod>("Cash");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notes, setNotes] = useState("");
  const [uberInv, setUberInv] = useState("");
  const [billDType, setBillDType] = useState<DiscountType>("");
  const [billDValue, setBillDValue] = useState(0);
  const [offerOn, setOfferOn] = useState(false);
  const [offer, setOffer] = useState(defaultOffer);
  const [editing, setEditing] = useState<string | null>(null);
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
  const itemOf = (id: string) => menu.find((m) => m.item_id === id);

  const priced = cart
    .map((l) => ({ l, item: itemOf(l.item_id)! }))
    .filter((x) => x.item)
    .map((x) => ({ ...x, p: linePrice(x.l.qty, priceOf(x.item), x.l.addons, x.l.dtype, x.l.dvalue) }));
  const subtotal = priced.reduce((t, x) => t + x.p.total, 0);
  const itemDiscounts = priced.reduce((t, x) => t + x.p.discount, 0);
  const billDisc = addTo ? 0 : discountAmount(subtotal, billDType, billDValue);
  const total = subtotal - billDisc;
  const commission = isUber ? uberCommission(total, uberSettings) : 0;
  const count = cart.reduce((t, l) => t + l.qty, 0);
  const countOf = (id: string) => cart.filter((l) => l.item_id === id).reduce((t, l) => t + l.qty, 0);
  const problems = [
    ...priced.map((x) => discountProblem(x.p.base, x.l.dtype, x.l.dvalue, `${x.item.item_name} discount`)),
    addTo ? null : discountProblem(subtotal, billDType, billDValue, "Bill discount"),
    ...cart.flatMap((l) => l.addons.filter((a) => !a.item_id && (!a.name.trim() || !(a.price >= 0))).map(() => "Give each typed extra a name and a price")),
  ].filter(Boolean) as string[];

  // Tapping a dish adds to its plain line (no options); a line with options stays as it is.
  const tap = (id: string) =>
    setCart((c) => {
      const i = c.findIndex((l) => l.item_id === id && plain(l));
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { key: newKey(), item_id: id, qty: 1, note: "", addons: [], dtype: "", dvalue: 0 }];
    });
  const patch = (key: string, p: Partial<CartLine>) => setCart((c) => c.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const setQty = (key: string, q: number) => setCart((c) => c.map((l) => (l.key === key ? { ...l, qty: Number.isFinite(q) && q > 0 ? Math.floor(q) : 0 } : l)).filter((l) => l.qty > 0));
  // Small grey menu group under the name (e.g. "SweetMO"), so names stay quick to read. The receipt keeps "SweetMO · name".
  const group = (m: MenuItem) => (m.sub_category && m.sub_category !== m.item_name ? m.sub_category : "");
  const optionSummary = (l: CartLine) =>
    [
      l.dtype && l.dvalue ? `−${discountLabel(l.dtype, l.dvalue)}` : "",
      ...l.addons.map((a) => `+ ${a.name}${a.qty > 1 ? ` ×${a.qty}` : ""}`),
      l.note ? `✎ ${l.note}` : "",
    ].filter(Boolean).join(" · ");

  const reset = () => {
    setCart([]);
    setNotes("");
    setUberInv("");
    setBillDType("");
    setBillDValue(0);
    setOfferOn(false);
    setOffer(defaultOffer);
    setEditing(null);
    setShowCart(false);
    // Next guest: pick the table again.
    setTable("");
    setPickTable(true);
  };

  const submit = (open: boolean) =>
    call(
      () => saveOrder({
        channel: isUber ? "Uber" : "Cafe", order_type: type, table_no: type === "Dine-in" ? table : "", payment_method: isUber ? "Uber" : pay,
        notes, date, open, bill_id: addTo?.order_id, invoice_no: isUber ? uberInv : undefined,
        lines: cart.map((l) => ({
          item_id: l.item_id, qty: l.qty, note: l.note,
          addons: l.addons.map((a) => (a.item_id ? { item_id: a.item_id, qty: a.qty } : { name: a.name, price: a.price, qty: a.qty })),
          discount_type: l.dtype, discount_value: l.dvalue,
        })),
        bill_discount: !addTo && billDType ? { type: billDType, value: billDValue } : undefined,
        offer_text: !addTo && offerOn ? offer : "",
      }),
      (r) => {
        reset();
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
              {b.label} · {rs(b.total)} · <OpenFor minutes={b.minutes} />
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
                {a.tables.map((t) => {
                  const ob = busy[t] ? openBills.find((b) => b.order_id === busy[t]) : undefined;
                  return (
                  <button key={t} type="button" className={`table-chip area-${i} ${table === t ? "on" : ""} ${busy[t] ? "busy" : ""}`} aria-pressed={table === t}
                    aria-label={busy[t] ? `${t} – open bill${ob ? ` ${rs(ob.total)}` : ""}, open it` : t}
                    onClick={() => (busy[t] ? router.push(`/bills/${encodeURIComponent(busy[t])}`) : (setTable(t), setPickTable(false)))}>
                    {t.slice(a.name.length).trim() || t}
                    {busy[t] && (ob ? (
                      <span className="busy-dot"><span>{rs(ob.total)}</span><OpenFor minutes={ob.minutes} /></span>
                    ) : <span className="busy-dot">open</span>)}
                  </button>
                  );
                })}
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
          Uber prices = menu price + {uberSettings.uber_markup_pct}%. Paid to <b>Bank</b>. Keep it in the kitchen until the rider picks it up (it can still be cancelled);
          the Uber commission ({uberSettings.uber_commission_pct}%) is saved as a daily cost when the order is completed.
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
          <button key={m.item_id} type="button" className={`tile ${countOf(m.item_id) ? "picked" : ""}`} onClick={() => tap(m.item_id)}>
            <span className="tile-name">{m.item_name}</span>
            {group(m) && <span className="tile-group">{group(m)}</span>}
            <span className="price">{rs(priceOf(m))}</span>
            {countOf(m.item_id) > 0 && <span className="count">{countOf(m.item_id)}</span>}
          </button>
        ))}
        {shown.length === 0 && <span className="muted">No items</span>}
      </div>

      {ui}
      {lastReceipt && (
        <div className="row small no-print">
          <span className="muted">Last order {lastReceipt.invoice_no || lastReceipt.order_id}</span>
          <button type="button" className="small" onClick={() => printReceipt(lastReceipt, receiptSettings)}>🖨 Print again</button>
          <a className="small" href={`/receipt/${encodeURIComponent(lastReceipt.order_id)}`}>View</a>
        </div>
      )}

      <div className="cart-bar">
        <div className="inner stack">
          {showCart && (
            <div className="stack" style={{ maxHeight: "58vh", overflowY: "auto" }}>
              <div className="spread cart-head">
                <b>{addTo ? `🧾 Add to ${addTo.label}` : `${ORDER_TYPE_ICON[type]} ${type === "Dine-in" ? table || "Pick a table" : type === "Take-away" ? "Take-away · pack" : "Uber · pack"}`}</b>
                <button type="button" className="small" onClick={() => setShowCart(false)} aria-label="Hide the order review to add more items">▾ Hide · add more items</button>
              </div>
              {priced.map(({ l, item, p }) => (
                <div key={l.key} className="cart-line">
                  <div className="spread">
                    <span style={{ flex: 1 }}>
                      {item.item_name}
                      {group(item) && <span className="tile-group">{group(item)}</span>}
                    </span>
                    <span className="qty">
                      <button type="button" onClick={() => setQty(l.key, l.qty - 1)} aria-label="Less">−</button>
                      <input type="number" inputMode="numeric" min={1} value={l.qty} onChange={(e) => setQty(l.key, Number(e.target.value))} aria-label={`Quantity ${item.item_name}`} />
                      <button type="button" onClick={() => setQty(l.key, l.qty + 1)} aria-label="More">+</button>
                    </span>
                    <b className="num" style={{ width: 90 }}>{rs(p.total)}</b>
                  </div>
                  <div className="row small" style={{ gap: 8 }}>
                    <button type="button" className={`small opt-btn ${editing === l.key ? "on" : ""}`} onClick={() => setEditing(editing === l.key ? null : l.key)}>
                      {editing === l.key ? "▾ Done" : "⚙ Options"}
                    </button>
                    {optionSummary(l) && <span className="opt-sum">{optionSummary(l)}</span>}
                  </div>
                  {editing === l.key && (
                    <LineOptions
                      line={l} base={p.base} addonItems={addonItems} noteTags={noteTags} chPrice={chPrice}
                      onChange={(x) => patch(l.key, x)}
                    />
                  )}
                </div>
              ))}

              {!addTo && (
                <div className="disc-box">
                  <div className="spread"><b className="small">Bill discount</b>{billDisc > 0 && <span className="small">−{rs(billDisc)}</span>}</div>
                  <DiscountInput type={billDType} value={billDValue} onChange={(t, v) => { setBillDType(t); setBillDValue(v); }} />
                </div>
              )}
              <div className="totals small">
                {(itemDiscounts > 0 || billDisc > 0) && <div className="spread"><span>Subtotal{itemDiscounts > 0 ? ` (item discounts −${rs(itemDiscounts)})` : ""}</span><span>{rs(subtotal)}</span></div>}
                {billDisc > 0 && <div className="spread"><span>Bill discount {discountLabel(billDType, billDValue)}</span><span>−{rs(billDisc)}</span></div>}
                <div className="spread"><b>Total</b><b style={{ fontSize: "1.1rem" }}>{rs(total)}</b></div>
              </div>
              {problems.length > 0 && <div className="errors">{problems[0]}</div>}

              <input placeholder="Order note (guest name, …)" value={notes} onChange={(e) => setNotes(e.target.value)} />
              {!addTo && (
                <div className="offer-box">
                  <label className="row small"><input type="checkbox" checked={offerOn} onChange={(e) => setOfferOn(e.target.checked)} /> 🎁 Print a next-day offer on the invoice</label>
                  {offerOn && <input value={offer} onChange={(e) => setOffer(e.target.value)} maxLength={200} placeholder="e.g. Show this bill tomorrow: 10% off breakfast" />}
                </div>
              )}
              <label className="row small"><input type="checkbox" checked={printAfter} onChange={(e) => togglePrint(e.target.checked)} /> Print receipt after saving</label>
              {addTo ? null : isUber ? (
                <>
                <label className="field">
                  <span>Uber invoice no. {""}<span className="muted">(needed to complete; can be typed later on the bill)</span></span>
                  <input value={uberInv} onChange={(e) => setUberInv(e.target.value)} placeholder="e.g. 3F2A9" autoCapitalize="characters" spellCheck={false} maxLength={40} />
                </label>
                <div className="uber-note sum small">
                  <div className="spread"><span>Uber order total</span><b>{rs(total)}</b></div>
                  <div className="spread"><span>Uber commission {uberSettings.uber_commission_pct}% → daily cost (Bank)</span><b>− {rs(commission)}</b></div>
                  <div className="spread"><span>Cafe receives</span><b>{rs(total - commission)}</b></div>
                </div>
                </>
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
            {count > 0 && !showCart && <button type="button" onClick={() => setCart([])} className="small">Clear</button>}
            {!showCart || pending ? (
              <button type="button" className="primary" disabled={!count || pending} onClick={() => setShowCart(true)} style={{ flex: 1 }}>
                {pending ? "Saving…" : "Review"}
              </button>
            ) : problems.length ? (
              <button type="button" className="primary" disabled style={{ flex: 1 }}>Fix the discount / extras</button>
            ) : addTo ? (
              <button type="button" className="primary" onClick={() => submit(true)} style={{ flex: 1 }}>🍳 Add to bill · send to kitchen</button>
            ) : needsTable ? (
              <button type="button" className="primary" disabled style={{ flex: 1 }}>Pick a table first</button>
            ) : isUber ? (
              // Uber: keep it open in the kitchen (it can still be cancelled); complete it with the Uber invoice no.
              <div className="row" style={{ flex: 1.6, gap: 6 }}>
                <button type="button" className="primary" onClick={() => submit(true)} style={{ flex: 1 }}>🍳 Kitchen · complete later</button>
                <button type="button" disabled={!uberInv.trim()} onClick={() => submit(false)} style={{ flex: 1 }} title={uberInv.trim() ? "" : "Type the Uber invoice no. first"}>
                  {uberInv.trim() ? "Done · Uber" : "Uber no. needed"}
                </button>
              </div>
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

/** None / % / Rs, then the value. */
export function DiscountInput({ type, value, onChange }: { type: DiscountType; value: number; onChange: (t: DiscountType, v: number) => void }) {
  return (
    <div className="row disc-input">
      <div className="seg mini" role="group" aria-label="Discount type">
        {(["", "%", "Rs"] as DiscountType[]).map((t) => (
          <button key={t || "none"} type="button" className={type === t ? "on" : ""} aria-pressed={type === t} onClick={() => onChange(t, t ? value : 0)}>
            {t || "None"}
          </button>
        ))}
      </div>
      {type && (
        <input type="number" inputMode="decimal" min={0} step={type === "%" ? 0.5 : 10} value={value || ""} aria-label={type === "%" ? "Discount percent" : "Discount amount"}
          placeholder={type === "%" ? "e.g. 10" : "e.g. 200"} onChange={(e) => onChange(type, Number(e.target.value) || 0)} style={{ width: 110 }} />
      )}
    </div>
  );
}

/** Options of one cart line: kitchen note, paid extras and item discount. */
function LineOptions({ line, base, addonItems, noteTags, chPrice, onChange }: {
  line: CartLine; base: number; addonItems: MenuItem[]; noteTags: string[]; chPrice: (p: number) => number;
  onChange: (p: Partial<CartLine>) => void;
}) {
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const tags = line.note ? line.note.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const toggleTag = (t: string) => {
    const next = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t];
    onChange({ note: next.join(", ") });
  };
  const addAddon = (a: CartAddon) => {
    const i = line.addons.findIndex((x) => (a.item_id ? x.item_id === a.item_id : !x.item_id && x.name === a.name && x.price === a.price));
    onChange({ addons: i >= 0 ? line.addons.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)) : [...line.addons, a] });
  };
  const setAddonQty = (i: number, q: number) => onChange({ addons: line.addons.map((x, j) => (j === i ? { ...x, qty: q } : x)).filter((x) => x.qty > 0) });
  return (
    <div className="line-opts stack">
      <div>
        <div className="small muted">Kitchen note</div>
        <div className="chips">
          {noteTags.map((t) => (
            <button key={t} type="button" className={`small ${tags.includes(t) ? "on" : ""}`} aria-pressed={tags.includes(t)} onClick={() => toggleTag(t)}>{t}</button>
          ))}
        </div>
        <input value={line.note} onChange={(e) => onChange({ note: e.target.value })} placeholder="Type a note (e.g. allergic to nuts)" maxLength={200} />
      </div>

      <div>
        <div className="small muted">Extras (paid)</div>
        <div className="chips">
          {addonItems.map((a) => (
            <button key={a.item_id} type="button" className="small" onClick={() => addAddon({ item_id: a.item_id, name: a.item_name, price: chPrice(a.selling_price), qty: 1 })}>
              + {a.item_name} · {rs(chPrice(a.selling_price))}
            </button>
          ))}
          {addonItems.length === 0 && <span className="small muted">No add-ons on the menu yet (Menu → category Add-ons).</span>}
        </div>
        {line.addons.map((a, i) => (
          <div key={`${a.item_id}-${a.name}-${i}`} className="spread small addon-row">
            <span>+ {a.name} · {rs(a.price)}</span>
            <span className="qty">
              <button type="button" onClick={() => setAddonQty(i, a.qty - 1)} aria-label={`Less ${a.name}`}>−</button>
              <span style={{ minWidth: 22, textAlign: "center" }}>{a.qty}</span>
              <button type="button" onClick={() => setAddonQty(i, a.qty + 1)} aria-label={`More ${a.name}`}>+</button>
            </span>
            <b>{rs(a.price * a.qty)}</b>
          </div>
        ))}
        <div className="row" style={{ gap: 6 }}>
          <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Other extra" maxLength={60} style={{ flex: 2 }} />
          <input type="number" inputMode="numeric" min={0} value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} placeholder="Rs" style={{ flex: 1, minWidth: 70 }} />
          <button type="button" className="small" disabled={!customName.trim() || customPrice === "" || Number(customPrice) < 0}
            onClick={() => { addAddon({ item_id: "", name: customName.trim(), price: Math.round(Number(customPrice)), qty: 1 }); setCustomName(""); setCustomPrice(""); }}>
            Add
          </button>
        </div>
      </div>

      <div>
        <div className="small muted">Item discount (on the item only, not the extras · item price {rs(base)})</div>
        <DiscountInput type={line.dtype} value={line.dvalue} onChange={(t, v) => onChange({ dtype: t, dvalue: v })} />
      </div>
    </div>
  );
}
