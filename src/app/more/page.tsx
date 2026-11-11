import Link from "next/link";
import { requirePage } from "@/lib/auth";

export default async function MorePage() {
  const user = await requirePage("any");
  const links = [
    { href: "/villa", t: "MO Villa", d: "Bookings, calendar, villa costs, profit", partner: true },
    { href: "/profit", t: "Profit", d: "Cafe + Villa, YTD, partner shares", partner: true },
    { href: "/cash", t: "Cash & bank", d: "Balances and movements", partner: true },
    { href: "/capital", t: "Capital", d: "Opening budget paid by each partner", partner: true },
    { href: "/fixed", t: "Fixed costs", d: "Rent, salary… planned vs paid", partner: true },
    { href: "/menu", t: "Menu", d: "Prices, cost, food cost %" },
    { href: "/todo", t: "To-do", d: "Tasks for the team" },
    { href: "/sales", t: "Daily sales", d: "Per meal, vs target" },
    { href: "/settings", t: "Settings", d: "Targets, split, users", partner: true },
  ].filter((l) => !l.partner || user.role === "partner");
  return (
    <div className="stack">
      <h1>More</h1>
      <div className="more-links">
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            {l.t}
            <small>{l.d}</small>
          </Link>
        ))}
      </div>
    </div>
  );
}
