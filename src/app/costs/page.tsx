import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { today } from "@/lib/today";
import { monthOf } from "@/lib/calc/dates";
import { StorageError } from "@/components/StorageError";
import { CostsManager } from "./CostsManager";

export default async function CostsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requirePage("any");
  try {
    const [costs, settings] = await Promise.all([repo.dailyCosts(), repo.settings()]);
    const t = today(settings);
    const month = (await searchParams).month || monthOf(t);
    return (
      <CostsManager
        costs={costs.filter((c) => monthOf(c.date) === month).sort((a, b) => b.date.localeCompare(a.date))}
        allCosts={costs}
        month={month}
        today={t}
        categories={settings.cost_categories}
        isPartner={user.role === "partner"}
      />
    );
  } catch (e) {
    return <StorageError error={e} />;
  }
}
