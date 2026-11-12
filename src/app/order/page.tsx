import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { today } from "@/lib/today";
import { StorageError } from "@/components/StorageError";
import { OrderEntry } from "./OrderEntry";

export default async function OrderPage({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  await requirePage("any");
  const { channel } = await searchParams;
  try {
    const [menu, settings] = await Promise.all([repo.menu(), repo.settings()]);
    const t = today(settings);
    // Suggest the meal from the clock in the cafe's timezone.
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: settings.timezone, hour: "2-digit", hour12: false }).format(new Date()));
    const meal = hour < 11 ? "Breakfast" : hour < 17 ? "Lunch" : "Dinner";
    const categories = settings.menu_categories.map((c) => c.name);
    const uber = { uber_markup_pct: settings.uber_markup_pct, uber_commission_pct: settings.uber_commission_pct };
    return (
      <OrderEntry
        key={channel === "uber" ? "uber" : "cafe"}
        menu={menu.filter((m) => m.active)}
        today={t}
        defaultMeal={meal}
        categories={categories}
        uber={uber}
        defaultChannel={channel === "uber" ? "Uber" : "Cafe"}
      />
    );
  } catch (e) {
    return <StorageError error={e} />;
  }
}
