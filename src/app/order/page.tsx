import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { today } from "@/lib/today";
import { StorageError } from "@/components/StorageError";
import { OrderEntry } from "./OrderEntry";

export default async function OrderPage() {
  await requirePage("any");
  try {
    const [menu, settings] = await Promise.all([repo.menu(), repo.settings()]);
    const t = today(settings);
    // Suggest the meal from the clock in the cafe's timezone.
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: settings.timezone, hour: "2-digit", hour12: false }).format(new Date()));
    const meal = hour < 11 ? "Breakfast" : hour < 17 ? "Lunch" : "Dinner";
    return <OrderEntry menu={menu.filter((m) => m.active)} today={t} defaultMeal={meal} />;
  } catch (e) {
    return <StorageError error={e} />;
  }
}
