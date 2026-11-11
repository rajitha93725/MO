"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/types";

const I = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  cost: <path d="M4 7h16v10H4zM4 11h16M8 15h3" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  sales: <path d="M3 3v18h18M7 15l4-4 3 3 5-6" />,
};

function Icon({ d }: { d: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d}
    </svg>
  );
}

export function BottomNav({ role }: { role: Role }) {
  const path = usePathname();
  const items =
    role === "partner"
      ? [
          { href: "/", label: "Home", icon: I.home },
          { href: "/sales", label: "Sales", icon: I.sales },
          { href: "/order", label: "Order", icon: I.plus, cta: true },
          { href: "/costs", label: "Costs", icon: I.cost },
          { href: "/more", label: "More", icon: I.more },
        ]
      : [
          { href: "/", label: "Home", icon: I.home },
          { href: "/sales", label: "Sales", icon: I.sales },
          { href: "/order", label: "Order", icon: I.plus, cta: true },
          { href: "/costs", label: "Costs", icon: I.cost },
          { href: "/menu", label: "Menu", icon: I.chart },
        ];
  return (
    <nav className="bottomnav" aria-label="Main">
      {items.map((it) => {
        const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={`${active ? "active" : ""} ${it.cta ? "cta" : ""}`}>
            {it.cta ? (
              <span className="dot">
                <Icon d={it.icon} />
              </span>
            ) : (
              <Icon d={it.icon} />
            )}
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
