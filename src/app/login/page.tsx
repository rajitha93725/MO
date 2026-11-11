import { redirect } from "next/navigation";
import { authDisabled, currentUser } from "@/lib/auth";
import { Logo } from "@/components/ui";
import { SignInButton } from "./SignInButton";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (authDisabled() || (await currentUser())) redirect("/");
  const { error } = await searchParams;
  return (
    <div className="card stack" style={{ maxWidth: 380, margin: "40px auto", textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Logo size={96} />
      </div>
      <h1>MO Cafe &amp; Villa</h1>
      <p className="muted">Sign in with the Google account the partners have added.</p>
      {error && (
        <div className="errors">
          {error === "AccessDenied" ? "This Google account is not on the Users list. Ask a partner to add it." : `Sign-in failed (${error}).`}
        </div>
      )}
      <SignInButton />
    </div>
  );
}
