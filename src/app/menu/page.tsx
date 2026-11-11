import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { StorageError } from "@/components/StorageError";
import { MenuManager } from "./MenuManager";

export default async function MenuPage() {
  const user = await requirePage("any");
  try {
    const [menu, history, settings] = await Promise.all([repo.menu(), repo.priceHistory(), repo.settings()]);
    return <MenuManager menu={menu} history={history} target={settings.food_cost_target_pct} isPartner={user.role === "partner"} categories={settings.menu_categories.map((c) => c.name)} />;
  } catch (e) {
    return <StorageError error={e} />;
  }
}
