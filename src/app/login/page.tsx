import Link from "next/link";
import { redirect } from "next/navigation";
import { authDisabled, currentUser } from "@/lib/auth";
import { Logo } from "@/components/ui";
import { PasswordSignIn, SignInButton } from "./SignInButton";

const ERRORS: Record<string, string> = {
  CredentialsSignin: "Wrong username or password.",
  TooManyAttempts: "Too many wrong tries. Please wait 10 minutes and try again.",
  AccessDenied: "This account is not on the Users list. Ask the owner to add it.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (authDisabled() || (await currentUser())) redirect("/order");
  const { error } = await searchParams;
  return (
    <div className="card stack" style={{ maxWidth: 380, margin: "40px auto", textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Logo size={96} />
      </div>
      <h1 style={{ margin: 0 }}>MO – Operations</h1>
      {error && <div className="errors">{ERRORS[error] ?? `Sign-in failed (${error}).`}</div>}
      <PasswordSignIn />
      <div className="row small muted" style={{ justifyContent: "center", gap: 10 }}>
        <span style={{ flex: 1, height: 1, background: "var(--border)" }} /> or <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>
      <SignInButton />
      <p className="small muted" style={{ margin: 0 }}>
        Looking for the menu? <Link href="/menu">View our menu</Link>
      </p>
    </div>
  );
}
