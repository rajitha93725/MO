import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { today } from "@/lib/today";
import { addMonths, monthLabel, monthOf } from "@/lib/calc/dates";
import { FORMULAS, profitTable, totalProfit, yearToDate, type MonthProfit, type ProfitTotals } from "@/lib/calc/profit";
import { num, pct } from "@/lib/calc/money";
import { CsvButton, Tip } from "@/components/ui";
import { StorageError } from "@/components/StorageError";
import { combinedTable, combinedTotals, profitPartners, shareLabel, ytdRange, COMBINED_FORMULA } from "@/lib/calc/combined";

const H = ({ label, tip }: { label: string; tip?: string }) => (
  <th className="num"><span className="row" style={{ justifyContent: "flex-end", gap: 2, flexWrap: "nowrap" }}>{label}{tip && <Tip text={tip} />}</span></th>
);
const signed = (v: number) => <span className={v < 0 ? "neg" : v > 0 ? "pos" : ""}>{num(v)}</span>;

function Cells({ r }: { r: MonthProfit | ProfitTotals }) {
  return (
    <>
      <td className="num">{num(r.sales)}</td>
      <td className="num">{num(r.foodCost)}</td>
      <td className="num">{num(r.dailyCosts)}</td>
      <td className="num">{num(r.fixedCosts)}</td>
      <td className="num">{num(r.totalCosts)}</td>
      <td className="num"><b>{signed(r.netProfit)}</b></td>
      <td className="num">{r.netMargin === null ? "-" : pct(r.netProfit, r.sales)}</td>
      {r.partnerShares.map((s) => <td key={s.name} className="num">{num(s.amount)}</td>)}
      <td className="num">{num(r.actualFoodPurchases)}</td>
      <td className="num">{signed(r.foodCostDifference)}</td>
      <td className="num">{num(r.plannedSales)}</td>
      <td className="num">{signed(r.salesVsPlan)}</td>
      <td className="num">{num(r.plannedNetProfit)}</td>
      <td className="num">{signed(r.profitVsPlan)}</td>
    </>
  );
}

export default async function ProfitPage() {
  const user = await requirePage("partner");
  const isOwner = user.owner; // villa figures are for the owner only
  let data;
  try {
    data = await repo.all();
  } catch (e) {
    return <StorageError error={e} />;
  }
  const { settings, orders, dailyCosts, fixedCosts, fixedPayments, villa } = data;
  const input = { orders, dailyCosts, fixedCosts, fixedPayments, settings };
  const t = today(settings);
  const thisMonth = monthOf(t);
  const from = settings.opening_month;
  const to = addMonths(from, 11) > thisMonth ? addMonths(from, 11) : thisMonth;
  const rows = profitTable(from, to, input);
  const toDate = rows.filter((r) => r.month <= thisMonth);
  const ytd = yearToDate(thisMonth < from ? from : thisMonth, input);
  const sinceOpening = totalProfit(toDate, settings);
  const combined = combinedTable(from, to, input, villa);
  const [yf, yt] = ytdRange(thisMonth < from ? from : thisMonth, from);
  const combinedYtd = combinedTotals(combinedTable(yf, yt, input, villa), settings);
  const combinedToDate = combinedTotals(combined.filter((r) => r.month <= thisMonth), settings);
  const csvHeaders = ["month", "closed", "sales", "food_cost_menu", "daily_costs", "fixed_costs", "total_costs", "net_profit", "net_margin_pct",
    ...settings.partners.map((p) => `share_${p.name}`), "actual_food_purchases", "food_cost_difference", "planned_sales", "sales_vs_plan", "planned_net_profit", "profit_vs_plan"];
  const csvRows = rows.map((r) => [r.month, r.closed ? "yes" : "no", r.sales, r.foodCost, r.dailyCosts, r.fixedCosts, r.totalCosts, r.netProfit,
    r.netMargin === null ? "-" : (r.netMargin * 100).toFixed(1), ...r.partnerShares.map((s) => s.amount), r.actualFoodPurchases, r.foodCostDifference,
    r.plannedSales, r.salesVsPlan, r.plannedNetProfit, r.profitVsPlan]);

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>Cafe profit by month</h1>
        <CsvButton filename="monthly-profit" headers={csvHeaders} rows={csvRows} />
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Tap <b>i</b> for the formula. Grey rows are closed months (Settings: closed_months = {settings.closed_months.join(", ")}). All amounts in Rs.
      </p>

      <div className="grid cols-4">
        <div className="card stat"><div className="label">YTD cafe sales</div><div className="value">{num(ytd.sales)}</div><div className="sub">Plan {num(ytd.plannedSales)}</div></div>
        <div className="card stat"><div className="label">YTD cafe net profit <Tip text={FORMULAS.netProfit} /></div><div className={`value ${ytd.netProfit < 0 ? "neg" : ""}`}>{num(ytd.netProfit)}</div><div className="sub">Plan {num(ytd.plannedNetProfit)}</div></div>
        {isOwner && combinedYtd.shares.map((s) => (
          <div key={s.name} className="card stat"><div className="label">YTD {s.name} ({shareLabel(s)}) <Tip text={COMBINED_FORMULA} /></div><div className="value">{num(s.amount)}</div><div className="sub">Cafe + Villa · since opening {num(combinedToDate.shares.find((x) => x.name === s.name)?.amount ?? 0)}</div></div>
        ))}
        {!isOwner && ytd.partnerShares.map((s) => (
          <div key={s.name} className="card stat"><div className="label">YTD {s.name} cafe share ({s.pct}%) <Tip text={FORMULAS.partnerShare} /></div><div className="value">{num(s.amount)}</div><div className="sub">Since opening {num(sinceOpening.partnerShares.find((x) => x.name === s.name)?.amount ?? 0)}</div></div>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <H label="Sales" tip={FORMULAS.sales} />
              <H label="Food cost (menu)" tip={FORMULAS.foodCost} />
              <H label="Daily costs" tip={FORMULAS.dailyCosts} />
              <H label="Fixed costs" tip={FORMULAS.fixedCosts} />
              <H label="Total costs" tip={FORMULAS.totalCosts} />
              <H label="Net profit" tip={FORMULAS.netProfit} />
              <H label="Margin" tip={FORMULAS.netMargin} />
              {settings.partners.map((p) => <H key={p.name} label={`${p.name} ${p.pct}%`} tip={FORMULAS.partnerShare} />)}
              <H label="Actual food & drink buys" tip={`Sum of Daily costs in: ${settings.food_check_categories.join(", ")}`} />
              <H label="Food check diff" tip={FORMULAS.foodCheck} />
              <H label="Planned sales" tip="Targets tab: planned_monthly_sales for the period containing the month (0 for closed months)" />
              <H label="Sales vs plan" tip={FORMULAS.vsPlan} />
              <H label="Planned profit" tip="Targets tab: planned_net_profit for the period containing the month" />
              <H label="Profit vs plan" tip={FORMULAS.vsPlan} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className={r.closed ? "closed" : ""}>
                <td style={{ whiteSpace: "nowrap" }}>{monthLabel(r.month)}{r.closed && <div className="small">closed</div>}{r.month === thisMonth && <div className="small badge">now</div>}</td>
                <Cells r={r} />
              </tr>
            ))}
            <tr className="total"><td>YTD {thisMonth.slice(0, 4)}</td><Cells r={ytd} /></tr>
            <tr className="total"><td>Since opening</td><Cells r={sinceOpening} /></tr>
          </tbody>
        </table>
      </div>

      {isOwner && <>
      <div className="spread">
        <h2>Business profit: Cafe + Villa <Tip text={COMBINED_FORMULA} /></h2>
        <CsvButton
          filename="business-profit"
          headers={["month", "cafe_net_profit", "villa_net_profit", "total_profit", ...profitPartners(settings).map((p) => `share_${p.name}`)]}
          rows={combined.map((r) => [r.month, r.cafe, r.villa, r.total, ...r.shares.map((s) => s.amount)])}
        />
      </div>
      <p className="small muted" style={{ margin: 0 }}>Each partner gets their cafe % of cafe profit plus their villa % of villa profit (Settings: partners, villa_partners). The Villa breakdown is on the MO Villa page.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <H label="Cafe net profit" tip={FORMULAS.netProfit} />
              <H label="Villa net profit" tip="Villa net profit = Gross bookings − Commission − Booking costs − Villa costs" />
              <H label="Total profit" tip={COMBINED_FORMULA} />
              {profitPartners(settings).map((p) => <H key={p.name} label={`${p.name} (${shareLabel(p)})`} tip={COMBINED_FORMULA} />)}
            </tr>
          </thead>
          <tbody>
            {combined.map((r) => (
              <tr key={r.month}>
                <td style={{ whiteSpace: "nowrap" }}>{monthLabel(r.month)}</td>
                <td className="num">{signed(r.cafe)}</td>
                <td className="num">{signed(r.villa)}</td>
                <td className="num"><b>{signed(r.total)}</b></td>
                {r.shares.map((s) => <td key={s.name} className="num">{num(s.amount)}</td>)}
              </tr>
            ))}
            {[["YTD " + thisMonth.slice(0, 4), combinedYtd], ["Since opening", combinedToDate]].map(([label, t]) => {
              const tot = t as typeof combinedYtd;
              return (
                <tr key={label as string} className="total">
                  <td>{label as string}</td>
                  <td className="num">{signed(tot.cafe)}</td>
                  <td className="num">{signed(tot.villa)}</td>
                  <td className="num">{signed(tot.total)}</td>
                  {tot.shares.map((s) => <td key={s.name} className="num">{num(s.amount)}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </>}
    </div>
  );
}
