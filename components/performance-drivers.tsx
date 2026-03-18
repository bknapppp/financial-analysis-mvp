import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { PeriodDriverAnalysis } from "@/lib/types";

type PerformanceDriversProps = {
  analyses: PeriodDriverAnalysis[];
};

function formatDeltaCurrency(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatCurrency(value)}`;
}

function formatDeltaPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatPercent(value)}`;
}

function directionArrow(value: number | null) {
  if (value === null || !Number.isFinite(value) || value === 0) {
    return "→";
  }

  return value > 0 ? "↑" : "↓";
}

function deltaTone(value: number | null) {
  if (value === null || !Number.isFinite(value) || value === 0) {
    return "text-slate-500";
  }

  return value > 0 ? "text-teal-700" : "text-rose-700";
}

function signalLabel(label: string, percent: number | null, impact: number) {
  if (label === "COGS" && impact < 0) return "pressure";
  if (label === "OpEx" && impact < 0) return "pressure";
  if (label === "Revenue" && impact > 0) return "improvement";
  if (label === "EBITDA" && percent !== null && percent > 0) return "improvement";
  if (label === "EBITDA" && percent !== null && percent < 0) return "pressure";
  return null;
}

function buildDriverRows(analysis: PeriodDriverAnalysis) {
  const rows = [
    {
      label: "Revenue",
      percent: analysis.revenueVariance.percent,
      absolute: analysis.revenueVariance.absolute,
      impact: analysis.revenueImpactOnEbitda
    },
    {
      label: "COGS",
      percent: analysis.cogsVariance.percent,
      absolute: analysis.cogsVariance.absolute,
      impact: analysis.cogsImpactOnEbitda
    },
    {
      label: "OpEx",
      percent: analysis.operatingExpensesVariance.percent,
      absolute: analysis.operatingExpensesVariance.absolute,
      impact: analysis.operatingExpenseImpactOnEbitda
    },
    {
      label: "EBITDA",
      percent: analysis.ebitdaVariance.percent,
      absolute: analysis.ebitdaVariance.absolute,
      impact: analysis.ebitdaVariance.absolute
    }
  ];

  const contributorRows = rows
    .filter((row) => row.label !== "EBITDA")
    .sort((left, right) => Math.abs(right.impact) - Math.abs(left.impact));
  const ebitdaRow = rows.find((row) => row.label === "EBITDA");

  return ebitdaRow ? [...contributorRows, ebitdaRow] : contributorRows;
}

export function PerformanceDrivers({ analyses }: PerformanceDriversProps) {
  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-panel">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          Performance Drivers
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Driver-based explanation of what changed between reporting periods.
        </p>
      </div>

      {analyses.length > 0 ? (
        <div className="space-y-4">
          {analyses.map((analysis) => (
            <article
              key={`${analysis.previousLabel}-${analysis.currentLabel}`}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  {analysis.previousLabel} to {analysis.currentLabel}
                </h3>
                <p className="text-sm text-slate-500">
                  EBITDA change: {formatDeltaCurrency(analysis.ebitdaVariance.absolute)} (
                  {formatDeltaPercent(analysis.ebitdaVariance.percent)})
                </p>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="grid grid-cols-[1.1fr_0.8fr_0.55fr_0.9fr] gap-3 border-b border-slate-200 px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Driver</span>
                  <span className="text-right">Change</span>
                  <span className="text-right">Dir</span>
                  <span className="text-right">Signal</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {buildDriverRows(analysis).map((row) => {
                    const signal = signalLabel(row.label, row.percent, row.impact);

                    return (
                      <div
                        key={`${analysis.previousLabel}-${analysis.currentLabel}-${row.label}`}
                        className="grid grid-cols-[1.1fr_0.8fr_0.55fr_0.9fr] items-center gap-3 px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">{row.label}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatDeltaCurrency(row.absolute)}
                          </p>
                        </div>
                        <p className={`text-right text-sm font-semibold ${deltaTone(row.percent)}`}>
                          {formatDeltaPercent(row.percent)}
                        </p>
                        <p className={`text-right text-sm font-semibold ${deltaTone(row.percent)}`}>
                          {directionArrow(row.percent)}
                        </p>
                        <div className="flex justify-end">
                          {signal ? (
                            <span
                              className={`rounded-full px-2 py-1 text-xs font-medium ${
                                signal === "improvement"
                                  ? "bg-teal-100 text-teal-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {signal}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          Add at least two reporting periods to see performance drivers.
        </div>
      )}
    </section>
  );
}
