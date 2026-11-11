import { isValidDate, isValidMonth } from "./calc/dates";

export class ValidationError extends Error {
  constructor(public errors: string[]) {
    super(errors.join("; "));
  }
}

/** Collects field errors; call .done() to throw if any. */
export class V {
  errors: string[] = [];

  required(label: string, v: unknown): string {
    const s = String(v ?? "").trim();
    if (!s) this.errors.push(`${label} is required`);
    return s;
  }

  date(label: string, v: unknown): string {
    const s = this.required(label, v);
    if (s && !isValidDate(s)) this.errors.push(`${label} must be a valid date (YYYY-MM-DD)`);
    return s;
  }

  optionalDate(label: string, v: unknown): string {
    const s = String(v ?? "").trim();
    if (s && !isValidDate(s)) this.errors.push(`${label} must be a valid date (YYYY-MM-DD)`);
    return s;
  }

  month(label: string, v: unknown, optional = false): string {
    const s = String(v ?? "").trim();
    if (!s) {
      if (!optional) this.errors.push(`${label} is required`);
      return "";
    }
    if (!isValidMonth(s)) this.errors.push(`${label} must be a month (YYYY-MM)`);
    return s;
  }

  /** Whole-rupee amount. */
  amount(label: string, v: unknown, { min = 0, allowZero = true } = {}): number {
    const s = String(v ?? "").replace(/,/g, "").trim();
    if (s === "") {
      this.errors.push(`${label} is required`);
      return 0;
    }
    const n = Number(s);
    if (!Number.isFinite(n)) {
      this.errors.push(`${label} must be a number`);
      return 0;
    }
    if (!Number.isInteger(n)) this.errors.push(`${label} must be a whole number of rupees`);
    if (n < min) this.errors.push(`${label} cannot be negative`);
    if (!allowZero && n === 0) this.errors.push(`${label} must be more than 0`);
    return Math.round(n);
  }

  /** Percentage 0-100, decimals allowed. */
  percent(label: string, v: unknown): number {
    const s = String(v ?? "").trim();
    if (s === "") {
      this.errors.push(`${label} is required`);
      return 0;
    }
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0 || n > 100) this.errors.push(`${label} must be a number from 0 to 100`);
    return n;
  }

  /** Optional whole number >= 0; blank gives the fallback. */
  optionalAmount(label: string, v: unknown, fallback = 0): number {
    const s = String(v ?? "").replace(/,/g, "").trim();
    if (s === "") return fallback;
    return this.amount(label, s);
  }

  qty(label: string, v: unknown): number {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) this.errors.push(`${label} must be a whole number above 0`);
    return n;
  }

  oneOf<T extends string>(label: string, v: unknown, options: readonly T[]): T {
    const s = String(v ?? "").trim() as T;
    if (!options.includes(s)) this.errors.push(`${label} must be one of: ${options.join(", ")}`);
    return s;
  }

  check(cond: boolean, message: string) {
    if (!cond) this.errors.push(message);
  }

  done() {
    if (this.errors.length) throw new ValidationError(this.errors);
  }
}
