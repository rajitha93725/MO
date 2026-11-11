"use client";

import { useState } from "react";
import { saveMenuItem, setMenuActive } from "@/app/actions";
import { CsvButton, Tip, formToObject, useAction } from "@/components/ui";
import { menuStats } from "@/lib/calc/daily";
import { HEADERS } from "@/lib/data/schema";
import type { MenuItem, PriceHistory } from "@/lib/types";

const n = (v: number) => Math.round(v).toLocaleString("en-US");
export function MenuManager({ menu, history, target, isPartner, categories }: { menu: MenuItem[]; history: PriceHistory[]; target: number; isPartner: boolean; categories: string[] }) {
  // Settings order first, then any category used in the sheet but not listed in Settings.
  const CATS = [...categories, ...Array.from(new Set(menu.map((m) => m.category))).filter((c) => !categories.includes(c))];
  const [editing, setEditing] = useState<MenuItem | "new" | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [onlyHigh, setOnlyHigh] = useState(false);
  const { pending, call, ui } = useAction();
  const settings = { food_cost_target_pct: target };

  const items = menu.filter((m) => (showInactive || m.active) && (!onlyHigh || menuStats(m, settings).aboveTarget));
  const highCount = menu.filter((m) => m.active && menuStats(m, settings).aboveTarget).length;

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>Menu</h1>
        <div className="row">
          <CsvButton filename="menu" headers={HEADERS.menu} rows={menu.map((m) => HEADERS.menu.map((h) => (h === "active" ? (m.active ? "yes" : "no") : (m as any)[h])))} />
          {isPartner && <button className="primary small" onClick={() => setEditing("new")}>+ Add item</button>}
        </div>
      </div>
      <div className="row small">
        <label className="row"><input type="checkbox" checked={onlyHigh} onChange={(e) => setOnlyHigh(e.target.checked)} /> Only above target ({highCount})</label>
        <label className="row"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive</label>
        <span className="muted">Food cost target: {target}% <Tip text={`Food cost % = unit_cost ÷ selling_price. Red = above the target (Settings: food_cost_target_pct = ${target}%). Profit = selling_price − unit_cost.`} /></span>
      </div>
      {ui}

      {editing && isPartner && (
        <form
          className="card form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            const f = formToObject(e.currentTarget);
            call(() => saveMenuItem(f), () => setEditing(null));
          }}
        >
          <b className="full">{editing === "new" ? "New item" : `Edit ${editing.item_name}`}</b>
          <input type="hidden" name="item_id" defaultValue={editing === "new" ? "" : editing.item_id} />
          <label className="field"><span>Category</span>
            <select name="category" defaultValue={editing === "new" ? categories[0] : editing.category}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="field"><span>Sub-category</span><input name="sub_category" required defaultValue={editing === "new" ? "" : editing.sub_category} /></label>
          <label className="field full"><span>Item name</span><input name="item_name" required defaultValue={editing === "new" ? "" : editing.item_name} /></label>
          <label className="field full"><span>Description (optional)</span><textarea name="description" rows={2} defaultValue={editing === "new" ? "" : editing.description} /></label>
          <label className="field"><span>Unit cost (Rs)</span><input name="unit_cost" type="number" inputMode="numeric" min={0} step={1} required defaultValue={editing === "new" ? "" : editing.unit_cost} /></label>
          <label className="field"><span>Selling price (Rs)</span><input name="selling_price" type="number" inputMode="numeric" min={1} step={1} required defaultValue={editing === "new" ? "" : editing.selling_price} /></label>
          <label className="field"><span>Active</span>
            <select name="active" defaultValue={editing === "new" || editing.active ? "yes" : "no"}><option>yes</option><option>no</option></select>
          </label>
          <p className="small muted full" style={{ margin: 0 }}>Price changes are logged in Menu_Price_History. Past orders keep the price they were sold at.</p>
          <div className="row full">
            <button className="primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      {CATS.map((cat) => {
        const inCat = items.filter((m) => m.category === cat);
        if (!inCat.length) return null;
        const subs = Array.from(new Set(inCat.map((m) => m.sub_category)));
        return (
          <section key={cat}>
            <h2>{cat} <span className="muted small">({inCat.length})</span></h2>
            {subs.map((s) => (
              <div key={s}>
                <h3>{s}</h3>
                <div className="grid md-2">
                  {inCat.filter((m) => m.sub_category === s).map((m) => {
                    const st = menuStats(m, settings);
                    const hist = history.filter((h) => h.item_id === m.item_id);
                    return (
                      <div key={m.item_id} className={`menu-card ${st.aboveTarget ? "high" : ""} ${m.active ? "" : "inactive"}`}>
                        <div style={{ minWidth: 0 }}>
                          <div className="name">{m.item_name} {!m.active && <span className="badge">inactive</span>}</div>
                          {m.description && <div className="small" style={{ color: "var(--text-2)" }}>{m.description}</div>}
                          <div className="small muted">{m.item_id} · cost Rs {n(m.unit_cost)} · profit Rs {n(st.profit)}</div>
                          {hist.length > 0 && (
                            <details className="small muted">
                              <summary>Price history ({hist.length})</summary>
                              {hist.map((h) => (
                                <div key={h.history_id}>{h.effective_date}: Rs {n(h.old_price)} → {n(h.new_price)} (cost {n(h.old_cost)} → {n(h.new_cost)})</div>
                              ))}
                            </details>
                          )}
                          {isPartner && (
                            <div className="row" style={{ marginTop: 6 }}>
                              <button className="small" onClick={() => setEditing(m)}>Edit</button>
                              <button className="small" disabled={pending} onClick={() => call(() => setMenuActive(m.item_id, !m.active))}>
                                {m.active ? "Deactivate" : "Activate"}
                              </button>
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 700, fontSize: "1.05rem" }} className="num">Rs {n(m.selling_price)}</div>
                          <span className={`badge ${st.aboveTarget ? "bad" : "good"}`}>{st.foodCostPct === null ? "-" : `${(st.foodCostPct * 100).toFixed(1)}%`}{st.aboveTarget ? " ▲" : ""}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
