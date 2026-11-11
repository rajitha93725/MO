/** LKR, no decimals. All stored amounts are whole rupees. */
export function rs(n: number): string {
  const v = Math.round(n || 0);
  const s = Math.abs(v).toLocaleString("en-US");
  return v < 0 ? `-Rs ${s}` : `Rs ${s}`;
}

/** Plain number with thousands separators (for tables). */
export function num(n: number): string {
  return Math.round(n || 0).toLocaleString("en-US");
}

/** Percentage or "-" when the denominator is 0. */
export function pct(numerator: number, denominator: number, digits = 1): string {
  if (!denominator) return "-";
  return `${((numerator / denominator) * 100).toFixed(digits)}%`;
}

/** Ratio or null when the denominator is 0. */
export function ratio(numerator: number, denominator: number): number | null {
  return denominator ? numerator / denominator : null;
}

export function sum<T>(rows: T[], f: (r: T) => number): number {
  let t = 0;
  for (const r of rows) t += f(r) || 0;
  return t;
}

/** Round to whole rupees. */
export function roundRs(n: number): number {
  return Math.round(n);
}
