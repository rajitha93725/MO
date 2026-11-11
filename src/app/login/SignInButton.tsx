"use client";
import { signIn } from "next-auth/react";

export function SignInButton() {
  return (
    <button className="primary" style={{ width: "100%" }} onClick={() => signIn("google", { callbackUrl: "/" })}>
      Sign in with Google
    </button>
  );
}
