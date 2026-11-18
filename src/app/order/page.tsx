import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { nowTime, today } from "@/lib/today";
import { mealForTime } from "@/lib/calc/meal";
import { StorageError } from "@/components/StorageError";
import { OrderEntry } from "./OrderEntry";

export default async function OrderPage({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  await requirePage("any");
  const { channel } = await searchParams;
  try {
    const [menu, settings] = await Promise.all([repo.menu(), repo.settings()]);
    const t = today(settings);
    // The meal is logged from the time (same rule as when saving); it only picks the first menu tab here.
    const meal = mealForTime(nowTime(settings));
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
        areas={settings.dining_areas}
        receiptSettings={{
          receipt_name: settings.receipt_name,
          receipt_address: settings.receipt_address,
          receipt_footer: settings.receipt_footer,
          receipt_width_mm: settings.receipt_width_mm,
        }}
      />
    );
  } catch (e) {
    return <StorageError error={e} />;
  }
}
