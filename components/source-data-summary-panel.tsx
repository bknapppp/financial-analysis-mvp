import type { DashboardData } from "@/lib/types";

type SourceDataSummaryPanelProps = {
  data: DashboardData;
};

function formatComparisonStatus(data: DashboardData) {
  if (data.taxSourceStatus.comparisonStatus === "ready") {
    return "Reported vs tax comparison is computable";
  }

  if (data.taxSourceStatus.comparisonStatus === "partial") {
    return "Tax source exists, but comparison coverage is incomplete";
  }

  return "No matched tax comparison is available";
}

export function SourceDataSummaryPanel({ data }: SourceDataSummaryPanelProps) {
  const selectedEntries = data.entries.filter(
    (entry) => entry.period_id === data.snapshot.periodId
  );
  const lowConfidenceRows = selectedEntries.filter(
    (entry) => entry.confidence === "low"
  ).length;
  const sourceQueue = [
    ...data.readiness.blockingReasons,
    ...data.readiness.cautionReasons,
    ...data.taxSourceStatus.missingComponents
  ].slice(0, 4);

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
          Sources
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-900">
          Source availability
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-sm font-semibold text-slate-900">Reported financials</p>
            <p className="mt-3 text-sm text-slate-700">
              {data.periods.length} period(s) loaded across {data.entries.length} row(s).
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Selected period: {data.snapshot.label || "None"}
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-sm font-semibold text-slate-900">Tax return source</p>
            <p className="mt-3 text-sm text-slate-700">
              {data.taxSourceStatus.documentCount} document(s), {data.taxSourceStatus.periodCount} period(s), {data.taxSourceStatus.rowCount} row(s).
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {data.taxSourceStatus.matchingPeriodLabel
                ? `Matched period: ${data.taxSourceStatus.matchingPeriodLabel}`
                : "No matched tax period"}
            </p>
          </article>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
          Mapping & Coverage
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-900">
          Mapping state
        </h2>
        <div className="mt-4 space-y-2">
          <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span className="font-medium text-slate-900">Mapped coverage</span>
            <span className="text-slate-700">
              {Math.round(data.dataQuality.mappingCoveragePercent)}%
            </span>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span className="font-medium text-slate-900">Unmapped rows</span>
            <span className="text-slate-700">
              {data.dataQuality.mappingBreakdown.unmapped}
            </span>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span className="font-medium text-slate-900">Low-confidence rows</span>
            <span className="text-slate-700">{lowConfidenceRows}</span>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span className="font-medium text-slate-900">Broad classifications</span>
            <span className="text-slate-700">
              {data.taxSourceStatus.broadClassificationCount +
                selectedEntries.filter((entry) =>
                  [
                    "Assets",
                    "Liabilities",
                    "Equity",
                    "current_assets",
                    "non_current_assets",
                    "current_liabilities",
                    "non_current_liabilities",
                    "equity"
                  ].includes(entry.category)
                ).length}
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
          Data Quality / Input Health
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-900">
          Canonical input health
        </h2>
        <div className="mt-4 space-y-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Missing categories:{" "}
            {data.dataQuality.missingCategories.length > 0
              ? data.dataQuality.missingCategories.join(", ")
              : "None"}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Statement coverage confidence: {data.dataQuality.confidenceLabel}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Reconciliation readiness: {formatComparisonStatus(data)}
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
          Source Review Queue
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-900">
          Open Source Items
        </h2>
        <div className="mt-4 space-y-2">
          {(sourceQueue.length > 0
            ? sourceQueue
            : ["No open source reconciliation items are currently surfaced."]).map((item) => (
            <div
              key={item}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
            >
              {item}
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
