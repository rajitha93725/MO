import type { Metadata } from "next";
import { Fredoka } from "next/font/google";
import { currentUser } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { MenuCard, type MenuTab } from "./MenuCard";

// Public menu card: anyone with the link can view it, no sign-in needed.
// Signed-in users also get an "Edit menu" button (the editor itself is at /menu/edit and needs sign-in).

const display = Fredoka({ subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: "Menu – MO Stay · Eatery",
  description: "Beverages, brunch and all-day food at MO Stay · Eatery.",
  openGraph: { title: "MO Stay · Eatery – Menu", images: ["/logo.png"] },
};

/** Tab order and look. Any other category in the menu gets its own tab after these. */
const TAB_STYLE: { match: RegExp; label: string; icon: string; photos: string[] }[] = [
  { match: /bever|drink/i, label: "Beverage", icon: "🍹", photos: [1, 2, 3, 4, 5].map((i) => `/menu/beverage-${i}.jpg`) },
  { match: /brunch|breakfast/i, label: "Brunch", icon: "🥞", photos: [1, 2].map((i) => `/menu/brunch-${i}.jpg`) },
  { match: /all ?day|main/i, label: "All Day", icon: "🍝", photos: [1, 2, 3].map((i) => `/menu/allday-${i}.jpg`) },
];
const ALL_PHOTOS = TAB_STYLE.flatMap((t) => t.photos);

export default async function PublicMenuPage() {
  const user = await currentUser().catch(() => null);
  let tabs: MenuTab[] = [];
  let name = "MO Stay · Eatery";
  let address = "";
  let footer = "";
  try {
    const [menu, settings] = await Promise.all([repo.menu(), repo.settings()]);
    name = settings.receipt_name || name;
    address = settings.receipt_address;
    footer = settings.receipt_footer;
    // Add-ons (Extra cheese, …) are extras on a dish, not dishes: not on the public menu.
    const cats = Array.from(new Set(menu.filter((m) => m.active).map((m) => m.category))).filter((c) => c.toLowerCase() !== settings.addon_category.toLowerCase());
    const rank = (c: string) => {
      const i = TAB_STYLE.findIndex((t) => t.match.test(c));
      return i < 0 ? TAB_STYLE.length : i;
    };
    cats.sort((a, b) => rank(a) - rank(b));
    tabs = cats.map((cat) => {
      const style = TAB_STYLE.find((t) => t.match.test(cat));
      const sections: MenuTab["sections"] = [];
      for (const m of menu) {
        if (!m.active || m.category !== cat) continue;
        const secName = m.sub_category || cat;
        let sec = sections.find((s) => s.name === secName);
        if (!sec) sections.push((sec = { name: secName, items: [] }));
        // Only public fields leave the server (never costs).
        sec.items.push({ id: m.item_id, name: m.item_name, description: m.description, price: m.selling_price });
      }
      return { key: cat, label: style?.label ?? cat.replace(/\s*menu$/i, ""), icon: style?.icon ?? "🍴", photos: style?.photos ?? ALL_PHOTOS, sections };
    });
  } catch {
    tabs = [];
  }
  return <MenuCard tabs={tabs} name={name} address={address} footer={footer} canEdit={Boolean(user)} displayFont={display.className} />;
}
