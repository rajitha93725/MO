import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { currentUser, authDisabled } from "@/lib/auth";
import { BottomNav } from "@/components/Nav";
import { Logo } from "@/components/ui";

export const metadata: Metadata = {
  title: "MO Cafe & Villa – Operations",
  description: "Daily operations for MO Cafe & Villa",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#E8411E",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let user = null;
  try {
    user = await currentUser();
  } catch {
    user = null; // storage not configured yet – pages show the error
  }
  return (
    <html lang="en">
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) add attributes to <body> before React loads */}
      <body suppressHydrationWarning>
        <header className="topbar">
          <Link href="/" aria-label="Home" style={{ display: "flex" }}>
            <Logo size={38} />
          </Link>
          <div className="title">
            MO Cafe &amp; Villa
            <small>Operations</small>
          </div>
          {user && (
            <div className="user">
              {user.name}
              <br />
              <span className="badge">{user.owner ? "owner" : user.role}</span>
              {!authDisabled() && (
                <>
                  {" "}
                  <a href="/api/auth/signout" className="small muted">Sign out</a>
                </>
              )}
            </div>
          )}
        </header>
        <main>{children}</main>
        {user && <BottomNav role={user.role} />}
      </body>
    </html>
  );
}
