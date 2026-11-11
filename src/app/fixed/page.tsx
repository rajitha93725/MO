import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { today } from "@/lib/today";
import { addMonths, isClosedMonth, monthLabel, monthOf, monthRange } from "@/lib/calc/dates";
import { fixedCostsForMonth, isMonthlyActive } from "@/lib/calc/fixedCosts";
import { StorageError } from "@/components/StorageError";
import { FixedManager } from "./FixedManager";

export default async function FixedPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePage("partner");
  try {
    const [fixed, payments, settings] = await Promise.all([repo.fixedCosts(), repo.fixedPayments(), repo.settings()]);
    const t = today(settings);
    const month = (await searchParams).month || monthOf(t);
    const lines = fixedCostsForMonth(month, fixed, payments, settings);
    const from = settings.opening_month;
    const to = addMonths(from, 11) > monthOf(t) ? addMonths(from, 11) : monthOf(t);
    const matrixMonths = monthRange(from, to);
    const monthly = fixed.filter((f) => f.frequency === "Monthly");
    const matrix = monthly.map((f) => ({
      name: f.name,
      cells: matrixMonths.map((m) => {
        if (isClosedMonth(m, settings.closed_months)) return "closed";
        if (!isMonthlyActive(f, m, settings)) return "";
        return payments.some((p) => p.fixed_id === f.fixed_id && p.month === m) ? "paid" : m <= monthOf(t) ? "unpaid" : "future";
      }),
    }));
    return (
      <FixedManager
        fixed={fixed}
        payments={payments}
        lines={lines}
        month={month}
        monthName={monthLabel(month)}
        closed={isClosedMonth(month, settings.closed_months)}
        today={t}
        allocation={settings.one_time_allocation === "full" ? "One-time costs count fully in the month paid" : `One-time costs are spread over ${settings.one_time_spread_months} open months`}
        basis={settings.fixed_profit_basis}
        matrix={{ months: matrixMonths.map((m) => monthLabel(m).slice(0, 3) + " " + m.slice(2, 4)), rows: matrix }}
      />
    );
  } catch (e) {
    return <StorageError error={e} />;
  }
}
