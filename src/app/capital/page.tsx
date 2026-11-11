import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { today } from "@/lib/today";
import { capitalSummary, CAPITAL_FORMULAS } from "@/lib/calc/capital";
import { num, rs } from "@/lib/calc/money";
import { CsvButton, Tip } from "@/components/ui";
import { StorageError } from "@/components/StorageError";
import { HEADERS } from "@/lib/data/schema";
import type { CapitalContribution, Settings } from "@/lib/types";
import { CapitalForm, DeleteCapitalButton } from "./CapitalForm";

const pctText = (s: number | null) => (s === null ? "-" : `${(s * 100).toFixed(1)}%`);

export default async function CapitalPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requirePage("partner");
  let rows: CapitalContribution[], settings: Settings;
  try {
    [rows, settings] = await Promise.all([repo.capital(), repo.settings()]);
  } catch (e) {
    return <StorageError error={e} />;
  }
  const { edit } = await searchParams;
  const editing = edit ? rows.find((r) => r.capital_id === edit) ?? null : null;
  const sum = capitalSummary(rows, settings.partners);
  const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>Opening budget &amp; capital</h1>
        <CsvButton filename="capital" headers={HEADERS.capital} rows={rows.map((r) => HEADERS.capital.map((h) => (r as any)[h]))} />
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {CAPITAL_FORMULAS.trackOnly} Current profit split: {settings.partners.map((p) => `${p.name} ${p.pct}%`).join(" / ")}.
      </p>

      <div className="grid cols-3">
        <div className="card stat">
          <div className="label">Total capital</div>
          <div className="value">{rs(sum.total)}</div>
          <div className="sub">MO Cafe + MO Villa</div>
        </div>
        {sum.byPartner.map((p) => (
          <div key={p.name} className="card stat">
            <div className="label">{p.name} <Tip text={CAPITAL_FORMULAS.share} /></div>
            <div className="value">{rs(p.amount)}</div>
            <div className="sub"><b>{pctText(p.share)}</b> of capital</div>
            <div style={{ height: 8, marginTop: 6, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }} aria-hidden>
              <div style={{ width: `${(p.share ?? 0) * 100}%`, height: "100%", background: "var(--series-1)", borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Business</th>
              {sum.byPartner.map((p) => <th key={p.name} className="num">{p.name}</th>)}
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {sum.byBusiness.map((b) => (
              <tr key={b.business}>
                <td>{b.business === "Both" ? "Both (shared)" : b.business}</td>
                {b.byPartner.map((p) => (
                  <td key={p.name} className="num">{num(p.amount)}{b.total > 0 && <div className="small muted">{pctText(p.share)}</div>}</td>
                ))}
                <td className="num"><b>{num(b.total)}</b></td>
              </tr>
            ))}
            <tr className="total">
              <td>All</td>
              {sum.byPartner.map((p) => <td key={p.name} className="num">{num(p.amount)}<div className="small">{pctText(p.share)}</div></td>)}
              <td className="num">{num(sum.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <CapitalForm key={editing?.capital_id ?? "new"} editing={editing} partners={settings.partners.map((p) => p.name)} today={today(settings)} />
      <p className="small muted" style={{ margin: 0 }}>{CAPITAL_FORMULAS.cash}</p>

      <h2>Contributions</h2>
      <div className="list">
        {sorted.length === 0 && <span className="muted">No contributions recorded yet.</span>}
        {sorted.map((r) => (
          <div key={r.capital_id} className="item">
            <div className="grow">
              <div className="spread"><b>{r.partner} · {r.description}</b><b className="num">{rs(r.amount)}</b></div>
              <div className="small muted">{r.date} · {r.business} · {r.paid_into}{r.notes ? ` · ${r.notes}` : ""}</div>
            </div>
            <a className="btn small" href={`?edit=${r.capital_id}`}>Edit</a>
            <DeleteCapitalButton id={r.capital_id} />
          </div>
        ))}
      </div>
    </div>
  );
}
