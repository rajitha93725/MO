"use client";

import { useState } from "react";
import { saveSettings, saveTargets, saveUsers } from "@/app/actions";
import { CsvButton, formToObject, useAction } from "@/components/ui";
import { HEADERS } from "@/lib/data/schema";
import type { SettingRow, TargetPeriod, UserRow } from "@/lib/types";

const LABELS: Record<string, string> = {
  opening_month: "Opening month",
  closed_months: "Closed months",
  food_cost_target_pct: "Food cost target %",
  partners: "Partner split",
  petty_low_threshold: "Petty-cash low threshold (Rs)",
  one_time_allocation: "One-time cost allocation",
  one_time_spread_months: "Spread over N months",
  fixed_profit_basis: "Fixed cost in profit",
  cost_categories: "Daily cost categories",
  food_check_categories: "Food cost check categories",
  todo_amber_days: "To-do amber window (days)",
  timezone: "Timezone",
  villa_rooms: "Villa rooms",
  villa_platforms: "Villa platforms & commission %",
  villa_cost_categories: "Villa cost categories",
  villa_allocation: "Villa revenue by month",
};

function Input({ r }: { r: SettingRow }) {
  if (r.key === "opening_month") return <input type="month" name={r.key} defaultValue={r.value} />;
  if (r.key === "one_time_allocation")
    return (
      <select name={r.key} defaultValue={r.value}>
        <option value="full">full – all in month paid</option>
        <option value="spread">spread – over N open months</option>
      </select>
    );
  if (r.key === "fixed_profit_basis")
    return (
      <select name={r.key} defaultValue={r.value}>
        <option value="actual_when_paid">actual payment when recorded</option>
        <option value="planned">always planned amount</option>
      </select>
    );
  if (r.key === "villa_allocation")
    return (
      <select name={r.key} defaultValue={r.value}>
        <option value="nights">split by nights stayed</option>
        <option value="check_in">all in the check-in month</option>
      </select>
    );
  if (["cost_categories", "food_check_categories", "villa_rooms", "villa_platforms", "villa_cost_categories"].includes(r.key))
    return <textarea name={r.key} rows={3} defaultValue={r.value} />;
  const numeric = ["food_cost_target_pct", "petty_low_threshold", "one_time_spread_months", "todo_amber_days"].includes(r.key);
  return <input name={r.key} defaultValue={r.value} inputMode={numeric ? "numeric" : undefined} />;
}

export function SettingsForm({ rows }: { rows: SettingRow[] }) {
  const { pending, call, ui } = useAction();
  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = formToObject(e.currentTarget);
        call(() => saveSettings(f));
      }}
    >
      <div className="spread">
        <b>General</b>
        <CsvButton filename="settings" headers={HEADERS.settings} rows={rows.map((r) => [r.key, r.value, r.description])} />
      </div>
      {rows.map((r) => (
        <label key={r.key} className="field">
          <span>
            <b>{LABELS[r.key] ?? r.key}</b> · <span className="muted">{r.description}</span>
          </span>
          <Input r={r} />
        </label>
      ))}
      {ui}
      <button className="primary" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
    </form>
  );
}

const TCOLS: [keyof TargetPeriod, string, string][] = [
  ["period", "Period", "text"],
  ["start_month", "Start", "month"],
  ["end_month", "End", "month"],
  ["planned_monthly_sales", "Planned monthly sales", "number"],
  ["planned_net_profit", "Planned net profit", "number"],
  ["daily_target_breakfast", "Daily breakfast", "number"],
  ["daily_target_lunch", "Daily lunch", "number"],
  ["daily_target_dinner", "Daily dinner", "number"],
];

export function TargetsForm({ targets }: { targets: TargetPeriod[] }) {
  const [rows, setRows] = useState<Record<string, string>[]>(
    targets.map((t) => Object.fromEntries(TCOLS.map(([k]) => [k, String(t[k] ?? "")]))),
  );
  const { pending, call, ui } = useAction();
  const set = (i: number, k: string, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div className="card stack">
      <div className="spread">
        <b>Planned targets per period</b>
        <CsvButton filename="targets" headers={HEADERS.targets} rows={rows.map((r) => HEADERS.targets.map((h) => r[h]))} />
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Used for “vs plan” on the profit page and the daily target on the sales page. Closed months always have a plan of 0.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {TCOLS.map(([, l]) => <th key={l}>{l}</th>)}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {TCOLS.map(([k, , type]) => (
                  <td key={k} style={{ minWidth: type === "text" ? 170 : type === "month" ? 150 : 120 }}>
                    <input
                      type={type}
                      inputMode={type === "number" ? "numeric" : undefined}
                      value={r[k] ?? ""}
                      onChange={(e) => set(i, k, e.target.value)}
                      aria-label={`${k} row ${i + 1}`}
                    />
                  </td>
                ))}
                <td>
                  <button type="button" className="small danger" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ui}
      <div className="row">
        <button type="button" onClick={() => setRows((x) => [...x, {}])}>+ Add period</button>
        <button className="primary" disabled={pending} onClick={() => call(() => saveTargets(rows))}>Save targets</button>
      </div>
    </div>
  );
}

export function UsersForm({ users }: { users: UserRow[] }) {
  const [rows, setRows] = useState<Record<string, string>[]>(users.map((u) => ({ email: u.email, name: u.name, role: u.role })));
  const { pending, call, ui } = useAction();
  const set = (i: number, k: string, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div className="card stack">
      <b>Users &amp; roles</b>
      <p className="small muted" style={{ margin: 0 }}>
        Only these Google accounts can sign in. <b>partner</b> = full access. <b>staff</b> = add orders and daily costs only.
      </p>
      {rows.map((r, i) => (
        <div key={i} className="form-grid">
          <label className="field full"><span>Google email</span><input type="email" value={r.email ?? ""} onChange={(e) => set(i, "email", e.target.value)} /></label>
          <label className="field"><span>Name</span><input value={r.name ?? ""} onChange={(e) => set(i, "name", e.target.value)} /></label>
          <label className="field">
            <span>Role</span>
            <select value={r.role ?? "staff"} onChange={(e) => set(i, "role", e.target.value)}>
              <option>partner</option>
              <option>staff</option>
            </select>
          </label>
          <div className="full">
            <button type="button" className="small danger" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>Remove</button>
          </div>
        </div>
      ))}
      {ui}
      <div className="row">
        <button type="button" onClick={() => setRows((x) => [...x, { role: "staff" }])}>+ Add user</button>
        <button className="primary" disabled={pending} onClick={() => call(() => saveUsers(rows))}>Save users</button>
      </div>
    </div>
  );
}
