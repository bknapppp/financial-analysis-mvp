import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { PeriodSnapshot } from "@/lib/types";

type MultiPeriodSummaryTableProps = {
  snapshots: PeriodSnapshot[];
};

type MetricRow = {
  label: string;
  value: (snapshot: PeriodSnapshot) => number;
  format: "currency" | "percent";
  highlightExtremes?: boolean;
};

const METRIC_ROWS: MetricRow[] = [
  {
    label: "Revenue",
    value: (snapshot) => snapshot.revenue,
    format: "currency"
  },
  {
    label: "COGS",
    value: (snapshot) => snapshot.cogs,
    format: "currency"
  },
  {
    label: "Gross Profit",
    value: (snapshot) => snapshot.grossProfit,
    format: "currency"
  },
  {
    label: "EBITDA",
    value: (snapshot) => snapshot.ebitda,
    format: "currency"
  },
  {
    label: "EBITDA Margin (%)",
    value: (snapshot) => snapshot.ebitdaMarginPercent,
    format: "percent",
    highlightExtremes: true
  }
];

function formatMetricValue(value: number, format: MetricRow["format"]) {
  return format === "currency" ? formatCurrency(value) : formatPercent(value);
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
          Horizontal period comparison for the core operating metrics most relevant to diligence review.
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="sticky left-0 bg-slate-50 px-4 py-3 text-left font-medium text-slate-500">
                Metric
              </th>
              {snapshots.length > 0 ? (
                snapshots.map((snapshot) => (
                  <th
                    key={snapshot.periodId}
                    className="px-4 py-3 text-right font-medium text-slate-500"
                  >
                    {snapshot.label}
                  </th>
                ))
              ) : (
                <th className="px-4 py-3 text-center font-medium text-slate-500">
                  No periods loaded
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {snapshots.length > 0 ? (
              METRIC_ROWS.map((metric) => {
                const values = snapshots.map((snapshot) => metric.value(snapshot));
                const highestValue = metric.highlightExtremes
                  ? Math.max(...values)
                  : null;
                const lowestValue = metric.highlightExtremes
                  ? Math.min(...values)
                  : null;

                return (
                  <tr key={metric.label}>
                    <th className="sticky left-0 bg-white px-4 py-3 text-left font-medium text-slate-900">
                      {metric.label}
                    </th>
                    {snapshots.map((snapshot) => {
                      const value = metric.value(snapshot);
                      const isHighest =
                        metric.highlightExtremes && highestValue !== null && value === highestValue;
                      const isLowest =
                        metric.highlightExtremes && lowestValue !== null && value === lowestValue;

                      return (
                        <td
                          key={`${metric.label}-${snapshot.periodId}`}
                          className={`px-4 py-3 text-right ${
                            isHighest
                              ? "bg-teal-50 font-semibold text-teal-800"
                              : isLowest
                                ? "bg-rose-50 font-semibold text-rose-800"
                                : "text-slate-700"
                          }`}
                        >
                          {formatMetricValue(value, metric.format)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-slate-500">
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
