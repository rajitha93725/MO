import type { ISODate, MonthKey } from "../types";

export function monthOf(date: ISODate): MonthKey {
  return date.slice(0, 7);
}

export function monthNumber(month: MonthKey): number {
  return Number(month.slice(5, 7));
}

export function addMonths(month: MonthKey, n: number): MonthKey {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** Inclusive list of months from `from` to `to`. */
export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  if (!from || !to || from > to) return out;
  let m = from;
  while (m <= to) {
    out.push(m);
    m = addMonths(m, 1);
  }
  return out;
}

export function isClosedMonth(month: MonthKey, closedMonths: number[]): boolean {
  return closedMonths.includes(monthNumber(month));
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(month: MonthKey): string {
  if (!month) return "";
  return `${MONTH_NAMES[monthNumber(month) - 1]} ${month.slice(0, 4)}`;
}

/** Today's date (YYYY-MM-DD) in the given IANA timezone. */
export function todayIn(timezone: string, now: Date = new Date()): ISODate {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function timeIn(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function addDays(date: ISODate, n: number): ISODate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysInMonth(month: MonthKey): ISODate[] {
  const out: ISODate[] = [];
  let d = `${month}-01`;
  while (monthOf(d) === month) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isValidMonth(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}
