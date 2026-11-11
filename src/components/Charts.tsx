"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const VARS = ["--series-1", "--series-2", "--series-3", "--plan", "--surface", "--border", "--text-2", "--muted", "--text"] as const;
type Palette = Record<(typeof VARS)[number], string>;

/** Resolve CSS tokens to concrete colors (SVG attributes don't reliably accept var()). Re-reads on theme change. */
function usePalette(): Palette | null {
  const [p, setP] = useState<Palette | null>(null);
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      setP(Object.fromEntries(VARS.map((v) => [v, cs.getPropertyValue(v).trim()])) as Palette);
    };
    read();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return p;
}

const fmtK = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v));
const fmtRs = (v: number) => `Rs ${Math.round(v).toLocaleString("en-US")}`;

function TipBox({ active, payload, label, title }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((t: number, p: any) => t + (p.dataKey === "planned" ? 0 : Number(p.value) || 0), 0);
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", fontSize: 12, color: "var(--text)" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{title ? title(label) : label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
          <span>
            <i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: p.color, marginRight: 6 }} />
            {p.name}
          </span>
          <b style={{ fontVariantNumeric: "tabular-nums" }}>{fmtRs(p.value)}</b>
        </div>
      ))}
      {payload.length > 1 && payload.every((p: any) => p.dataKey !== "planned") && (
        <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4, display: "flex", justifyContent: "space-between" }}>
          <span>Total</span>
          <b>{fmtRs(total)}</b>
        </div>
      )}
    </div>
  );
}

export function DailyMealChart({ data }: { data: { day: string; Breakfast: number; Lunch: number; Dinner: number }[] }) {
  const p = usePalette();
  if (!p) return <div className="chart-box" />;
  const series = [
    { key: "Breakfast", color: p["--series-1"] },
    { key: "Lunch", color: p["--series-2"] },
    { key: "Dinner", color: p["--series-3"] },
  ];
  return (
    <>
      <div className="legend" aria-hidden>
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.key}
          </span>
        ))}
      </div>
      <div className="chart-box" role="img" aria-label="Daily sales this month by meal">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 4, left: -12, bottom: 0 }} barCategoryGap="18%">
            <CartesianGrid vertical={false} stroke={p["--border"]} />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: p["--muted"] }} tickLine={false} axisLine={{ stroke: p["--border"] }} interval="preserveStartEnd" />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: p["--muted"] }} tickLine={false} axisLine={false} width={44} />
            <Tooltip content={<TipBox title={(d: string) => `Day ${d}`} />} cursor={{ fill: p["--border"], opacity: 0.4 }} />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.key} stackId="a" fill={s.color} stroke={p["--surface"]} strokeWidth={1}
                radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

export function ProfitPlanChart({ data }: { data: { month: string; actual: number; planned: number; closed: boolean }[] }) {
  const p = usePalette();
  if (!p) return <div className="chart-box" />;
  return (
    <>
      <div className="legend" aria-hidden>
        <span><i style={{ background: p["--series-1"] }} />Net profit</span>
        <span><i className="line" style={{ background: p["--plan"] }} />Planned</span>
      </div>
      <div className="chart-box" role="img" aria-label="Monthly net profit versus planned">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={p["--border"]} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: p["--muted"] }} tickLine={false} axisLine={{ stroke: p["--border"] }} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: p["--muted"] }} tickLine={false} axisLine={false} width={48} />
            <Tooltip content={<TipBox />} cursor={{ fill: p["--border"], opacity: 0.4 }} />
            <Bar dataKey="actual" name="Net profit" fill={p["--series-1"]} radius={[4, 4, 0, 0]} maxBarSize={36} />
            <Line dataKey="planned" name="Planned" stroke={p["--plan"]} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4, fill: p["--plan"], stroke: p["--surface"], strokeWidth: 2 }} type="linear" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/** Single-series bar chart (no legend box: the card title names the series). Negative bars allowed. */
export function BarSeriesChart({ data, name }: { data: { label: string; value: number }[]; name: string }) {
  const p = usePalette();
  if (!p) return <div className="chart-box" />;
  return (
    <div className="chart-box" role="img" aria-label={name}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={p["--border"]} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: p["--muted"] }} tickLine={false} axisLine={{ stroke: p["--border"] }} />
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: p["--muted"] }} tickLine={false} axisLine={false} width={48} />
          <Tooltip content={<TipBox />} cursor={{ fill: p["--border"], opacity: 0.4 }} />
          <Bar dataKey="value" name={name} fill={p["--series-1"]} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
