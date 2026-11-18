// Password hashing for username/password sign-in (Node's built-in scrypt, no extra packages).
// Stored as "scrypt$<salt base64>$<hash base64>". Plain passwords are never stored or logged.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

const KEYLEN = 32;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, KEYLEN, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export { MIN_PASSWORD, passwordProblem } from "./users";

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${(await scrypt(pw, salt)).toString("base64")}`;
}

// Used when the user does not exist, so a wrong username takes as long as a wrong password.
const DUMMY = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export async function verifyPassword(pw: string, stored: string | undefined): Promise<boolean> {
  const [kind, salt, hash] = (stored || DUMMY).split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(pw, Buffer.from(salt, "base64"));
  return Boolean(stored) && expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Slows down password guessing: after 5 wrong tries a login is locked for 10 minutes. */
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60_000;
const attempts = new Map<string, { fails: number; until: number }>();

export function loginLocked(login: string, now = Date.now()): boolean {
  const a = attempts.get(login);
  return Boolean(a && a.until > now);
}

export function recordLogin(login: string, ok: boolean, now = Date.now()) {
  if (ok) {
    attempts.delete(login);
    return;
  }
  const a = attempts.get(login) ?? { fails: 0, until: 0 };
  a.fails += 1;
  if (a.fails >= MAX_FAILS) {
    a.until = now + LOCK_MS;
    a.fails = 0;
  }
  attempts.set(login, a);
}
