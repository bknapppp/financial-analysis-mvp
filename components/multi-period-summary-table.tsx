import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { PeriodSnapshot } from "@/lib/types";

type MultiPeriodSummaryTableProps = {
  snapshots: PeriodSnapshot[];
};

function formatDelta(value: number | null, kind: "percent" | "points") {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }

  const prefix = value > 0 ? "+" : "";
  return kind === "points"
    ? `${prefix}${value.toFixed(1)} pts`
    : `${prefix}${formatPercent(value)}`;
}

export function MultiPeriodSummaryTable({
  snapshots
}: MultiPeriodSummaryTableProps) {
  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-panel">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          Multi-period summary
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Period-level profitability and change versus the prior month.
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Period</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">Revenue</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">Gross Profit</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">Gross Margin %</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">OpEx</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">EBITDA</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">EBITDA Margin %</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">Revenue Growth</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">EBITDA Growth</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">Gross Margin Change</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">EBITDA Margin Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {snapshots.length > 0 ? (
              snapshots.map((snapshot) => (
                <tr key={snapshot.periodId}>
                  <td className="px-3 py-2 text-slate-900">{snapshot.label}</td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {formatCurrency(snapshot.revenue)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {formatCurrency(snapshot.grossProfit)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {formatPercent(snapshot.grossMarginPercent)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {formatCurrency(snapshot.operatingExpenses)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {formatCurrency(snapshot.ebitda)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {formatPercent(snapshot.ebitdaMarginPercent)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {formatDelta(snapshot.revenueGrowthPercent, "percent")}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {formatDelta(snapshot.ebitdaGrowthPercent, "percent")}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {formatDelta(snapshot.grossMarginChange, "points")}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {formatDelta(snapshot.ebitdaMarginChange, "points")}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                  Add multiple reporting periods to unlock trend analysis.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
