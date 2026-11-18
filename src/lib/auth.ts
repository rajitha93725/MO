import "server-only";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { loginLocked, recordLogin, verifyPassword } from "./password";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { cache } from "react";
import { repo } from "./data/repo";
import type { Role } from "./types";

export interface AppUser {
  email: string;
  name: string;
  role: Role;
  /** Owner = full access, including MO Villa, Cash & bank, Settings and Users. */
  owner: boolean;
}

/** Page/action access levels: "owner" ⊂ "partner" ⊂ "any". */
export type Access = Role | "owner" | "any";

export const authDisabled = () => process.env.AUTH_DISABLED === "true";

const emailList = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

/**
 * Owners come from the server config (OWNER_EMAILS, falling back to BOOTSTRAP_PARTNER_EMAILS),
 * never from the database, so nobody can give themselves owner access from inside the app.
 */
export function ownerEmails(): string[] {
  const owners = emailList(process.env.OWNER_EMAILS);
  return owners.length ? owners : emailList(process.env.BOOTSTRAP_PARTNER_EMAILS);
}

/** Look up an email in the Users table (or the bootstrap partner list). */
export async function resolveUser(email: string | null | undefined): Promise<AppUser | null> {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  const owner = ownerEmails().includes(e);
  const users = await repo.users();
  const u = users.find((x) => String(x.email).trim().toLowerCase() === e);
  // An owner is always a partner, whatever the Users table says.
  if (u && (u.role === "partner" || u.role === "staff")) return { email: e, name: u.name || e, role: owner ? "partner" : u.role, owner };
  if (owner || emailList(process.env.BOOTSTRAP_PARTNER_EMAILS).includes(e)) return { email: e, name: e.split("@")[0], role: "partner", owner };
  return null;
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    // Username (or email) + password, for people listed in Users with a password set by the owner.
    CredentialsProvider({
      id: "password",
      name: "Username and password",
      credentials: { username: { label: "Username", type: "text" }, password: { label: "Password", type: "password" } },
      async authorize(c) {
        const login = String(c?.username ?? "").trim().toLowerCase();
        const pw = String(c?.password ?? "");
        if (!login || !pw) return null;
        if (loginLocked(login)) throw new Error("TooManyAttempts");
        const u = (await repo.users()).find((x) => String(x.username ?? "").toLowerCase() === login || String(x.email).toLowerCase() === login);
        const ok = await verifyPassword(pw, u?.password_hash || undefined);
        recordLogin(login, ok);
        if (!ok || !u) return null;
        return { id: u.email, email: u.email, name: u.name };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 30 * 24 * 3600 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    // Only people listed in Users (or the bootstrap list) can sign in, with Google or a password.
    async signIn({ user }) {
      return Boolean(await resolveUser(user.email));
    },
    async jwt({ token }) {
      // Re-check the role against the Users table at most every 5 minutes (not on every page),
      // so role changes in Settings → Users still take effect quickly.
      const checkedAt = Number(token.roleCheckedAt ?? 0);
      if (!token.role || Date.now() - checkedAt > 5 * 60_000) {
        const u = await resolveUser(token.email);
        token.role = u?.role;
        token.appName = u?.name;
        token.roleCheckedAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).role = token.role;
      (session as any).appName = token.appName;
      return session;
    },
  },
};

/** Cached per request: the layout and the page share one lookup. */
export const currentUser = cache(async function currentUser(): Promise<AppUser | null> {
  if (authDisabled()) {
    // DEMO_ROLE: owner (default) | partner | staff
    const d = process.env.DEMO_ROLE;
    const role = d === "staff" ? "staff" : "partner";
    const owner = !d || d === "owner";
    return { email: "demo@local", name: role === "staff" ? "Staff (demo)" : owner ? "Rajitha (demo)" : "Janith (demo)", role, owner };
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return resolveUser(session.user.email);
});

/** For pages: redirect to login when signed out, or home when the role is not allowed. */
export function allowed(u: AppUser, access: Access): boolean {
  if (access === "owner") return u.owner;
  if (access === "partner") return u.role === "partner";
  return true;
}

export async function requirePage(access: Access = "any"): Promise<AppUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (!allowed(u, access)) redirect("/?denied=1");
  return u;
}

/** For server actions: throw when not allowed. */
export async function requireAction(access: Access = "any"): Promise<AppUser> {
  const u = await currentUser();
  if (!u) throw new Error("Please sign in.");
  if (access === "owner" && !u.owner) throw new Error("Only the owner can do this.");
  if (access === "partner" && u.role !== "partner") throw new Error("Only partners can do this.");
  return u;
}
