import { describe, expect, it } from "vitest";
import { buildUsers, publicUsers } from "../src/lib/users";
import { hashPassword, loginLocked, passwordProblem, recordLogin, verifyPassword } from "../src/lib/password";
import type { UserRow } from "../src/lib/types";

const fakeHash = async (pw: string) => `hash(${pw})`;
const raj: UserRow = { email: "raj@gmail.com", name: "Rajitha", role: "partner", username: "rajitha", password_hash: "scrypt$old" };

describe("passwords", () => {
  it("hashes with a random salt and verifies", async () => {
    const a = await hashPassword("cafe-2026!");
    const b = await hashPassword("cafe-2026!");
    expect(a).toMatch(/^scrypt\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("cafe-2026");
    expect(await verifyPassword("cafe-2026!", a)).toBe(true);
    expect(await verifyPassword("cafe-2027!", a)).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", undefined)).toBe(false);
  });
  it("needs at least 8 characters", () => {
    expect(passwordProblem("short")).toMatch(/8/);
    expect(passwordProblem("long enough")).toBeNull();
  });
  it("locks a login for 10 minutes after 5 wrong tries", () => {
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) recordLogin("kasun", false, t);
    expect(loginLocked("kasun", t)).toBe(false);
    recordLogin("kasun", false, t);
    expect(loginLocked("kasun", t + 1000)).toBe(true);
    expect(loginLocked("kasun", t + 11 * 60_000)).toBe(false);
    recordLogin("kasun", true, t);
    expect(loginLocked("kasun", t + 1000)).toBe(false);
  });
});

describe("Users list", () => {
  it("never sends the password hash to the browser", () => {
    expect(publicUsers([raj])).toEqual([{ email: "raj@gmail.com", name: "Rajitha", role: "partner", username: "rajitha", has_password: true }]);
  });
  it("keeps the current password when none is typed, even if the email changes", async () => {
    const { users, errors } = await buildUsers([{ orig_email: "raj@gmail.com", email: "RAJ2@gmail.com", name: "Rajitha", role: "partner", username: "Rajitha" }], [raj], fakeHash);
    expect(errors).toEqual([]);
    expect(users[0]).toEqual({ email: "raj2@gmail.com", name: "Rajitha", role: "partner", username: "rajitha", password_hash: "scrypt$old" });
  });
  it("hashes a new password and can remove one", async () => {
    const a = await buildUsers([{ orig_email: "raj@gmail.com", email: "raj@gmail.com", name: "R", role: "partner", password: "newpass123" }], [raj], fakeHash);
    expect(a.users[0].password_hash).toBe("hash(newpass123)");
    const b = await buildUsers([{ orig_email: "raj@gmail.com", email: "raj@gmail.com", name: "R", role: "partner", clear_password: "yes" }], [raj], fakeHash);
    expect(b.users[0].password_hash).toBe("");
  });
  it("staff without Google: username + password, email filled in", async () => {
    const { users, errors } = await buildUsers([{ name: "Kasun", role: "staff", username: "kasun", password: "kitchen123" }], [], fakeHash);
    expect(errors).toEqual([]);
    expect(users[0]).toMatchObject({ email: "kasun@mo.local", username: "kasun", password_hash: "hash(kitchen123)" });
  });
  it("rejects bad rows", async () => {
    const { errors } = await buildUsers(
      [
        { name: "A", role: "staff", username: "kasun", password: "short" },
        { name: "B", role: "staff", username: "kasun", password: "longenough" },
        { name: "C", role: "boss", email: "c@x.com" },
        { name: "D", role: "staff", username: "nopw" },
        { name: "E", role: "staff", username: "x y", email: "e@x.com" },
        { name: "", role: "staff", email: "f@x.com" },
      ],
      [],
      fakeHash,
    );
    expect(errors.join("\n")).toMatch(/at least 8/);
    expect(errors.join("\n")).toMatch(/Username kasun is used twice/);
    expect(errors.join("\n")).toMatch(/role must be partner or staff/);
    expect(errors.join("\n")).toMatch(/D: set a password/);
    expect(errors.join("\n")).toMatch(/E: username must be/);
    expect(errors.join("\n")).toMatch(/name is required/);
  });
  it("skips empty rows", async () => {
    expect((await buildUsers([{ role: "staff" }], [], fakeHash)).users).toEqual([]);
  });
});
