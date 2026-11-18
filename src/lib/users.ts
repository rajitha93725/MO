// Checking and saving the Users list (Settings → Users). Pure (also used in the browser), so it is unit-tested.
// Hashing lives in password.ts (server only).

import type { Role, UserRow } from "./types";

/** What the Users form sends: the hash never goes to the browser, a new password is typed in plain text. */
export interface UserForm {
  /** Email of this row before editing ("" for a new row), so the stored password follows an email change. */
  orig_email?: string;
  email?: string;
  name?: string;
  role?: string;
  username?: string;
  /** New password; empty = keep the current one. */
  password?: string;
  /** "yes" = remove the password (Google sign-in only). */
  clear_password?: string;
}

/** What the browser is allowed to see about a user. */
export interface PublicUser {
  email: string;
  name: string;
  role: Role;
  username: string;
  has_password: boolean;
}

export const MIN_PASSWORD = 8;

/** A reason the password is not acceptable, or null when it is fine. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters`;
  if (pw.length > 200) return "Password is too long";
  return null;
}

export const LOCAL_EMAIL_DOMAIN = "mo.local";
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function publicUsers(users: UserRow[]): PublicUser[] {
  return users.map((u) => ({ email: u.email, name: u.name, role: u.role, username: u.username ?? "", has_password: Boolean(u.password_hash) }));
}

/**
 * Turns the form rows into Users rows.
 * - Email is the ID (and the Google sign-in). Someone without Google can leave it empty: it becomes <username>@mo.local.
 * - A typed password is hashed; otherwise the current hash is kept (or removed with clear_password).
 */
export async function buildUsers(
  rows: UserForm[],
  existing: UserRow[],
  hash: (pw: string) => Promise<string>,
): Promise<{ users: UserRow[]; errors: string[] }> {
  const errors: string[] = [];
  const users: UserRow[] = [];
  const byEmail = new Map(existing.map((u) => [u.email.toLowerCase(), u]));
  for (const r of rows) {
    const username = (r.username ?? "").trim().toLowerCase();
    let email = (r.email ?? "").trim().toLowerCase();
    const name = (r.name ?? "").trim();
    if (!email && !username && !name) continue; // empty row
    if (!email && username) email = `${username}@${LOCAL_EMAIL_DOMAIN}`;
    const label = name || email || username;
    if (!email) errors.push(`${label}: enter a Google email or a username`);
    else if (!EMAIL.test(email)) errors.push(`${label}: invalid email ${email}`);
    if (!name) errors.push(`${label}: name is required`);
    if (username && !USERNAME.test(username)) errors.push(`${label}: username must be 3–32 letters, numbers, dots, dashes or underscores`);
    const role = (r.role === "partner" || r.role === "staff" ? r.role : "") as Role;
    if (!role) errors.push(`${label}: role must be partner or staff`);

    const before = byEmail.get((r.orig_email || email).toLowerCase());
    let password_hash = r.clear_password === "yes" ? "" : before?.password_hash ?? "";
    const pw = r.password ?? "";
    if (pw) {
      const p = passwordProblem(pw);
      if (p) errors.push(`${label}: ${p}`);
      else password_hash = await hash(pw);
    }
    if (password_hash && !username && email.endsWith(`@${LOCAL_EMAIL_DOMAIN}`)) errors.push(`${label}: needs a username to sign in`);
    if (email.endsWith(`@${LOCAL_EMAIL_DOMAIN}`) && !password_hash) errors.push(`${label}: set a password (no Google email to sign in with)`);
    users.push({ email, name, role, username, password_hash });
  }
  const dup = (vals: string[]) => vals.filter((v, i) => v && vals.indexOf(v) !== i);
  for (const e of new Set(dup(users.map((u) => u.email)))) errors.push(`Email ${e} is used twice`);
  for (const n of new Set(dup(users.map((u) => u.username)))) errors.push(`Username ${n} is used twice`);
  // A username must not look like someone else's email login.
  for (const u of users) if (u.username && users.some((o) => o !== u && o.email === u.username)) errors.push(`Username ${u.username} clashes with an email`);
  return { users, errors };
}
