"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";

export function PasswordSignIn() {
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="stack"
      style={{ textAlign: "left" }}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        signIn("password", { username: String(f.get("username") ?? ""), password: String(f.get("password") ?? ""), callbackUrl: "/" });
      }}
    >
      <label className="field">
        <span>Username or email</span>
        <input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
      </label>
      <label className="field">
        <span>Password</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <button className="primary" style={{ width: "100%" }} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

export function SignInButton() {
  return (
    <button style={{ width: "100%" }} onClick={() => signIn("google", { callbackUrl: "/" })}>
      <span aria-hidden style={{ fontWeight: 800, color: "#4285F4" }}>G</span>&nbsp; Sign in with Google
    </button>
  );
}
