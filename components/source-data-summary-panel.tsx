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
  const sourceQueue = data.diligenceIssues
    .filter(
      (issue) =>
        (issue.status === "open" || issue.status === "in_review") &&
        (issue.period_id === null || issue.period_id === data.snapshot.periodId) &&
        (
          issue.linked_page === "source_data" ||
          issue.category === "source_data" ||
          issue.category === "reconciliation" ||
          issue.category === "tax"
        )
    )
    .map((issue) => issue.title)
    .slice(0, 3);
  const missingRequirements = data.backing.sourceRequirements.filter(
    (row) => row.status === "unbacked"
  );

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            Step 1
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Data Coverage</h2>
          <p className="mt-1 text-sm text-slate-500">
            Understand what&apos;s missing before moving deeper into issue resolution and reconciliation.
          </p>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
          {formatComparisonStatus(data)}
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid gap-2 md:grid-cols-2">
          <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-2.5 text-sm">
            <span className="font-medium text-slate-900">Mapping %</span>
            <span className="text-slate-700">{Math.round(data.dataQuality.mappingCoveragePercent)}%</span>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-2.5 text-sm">
            <span className="font-medium text-slate-900">Unmapped accounts</span>
            <span className="text-slate-700">{data.dataQuality.mappingBreakdown.unmapped}</span>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-2.5 text-sm">
            <span className="font-medium text-slate-900">Low-confidence rows</span>
            <span className="text-slate-700">{lowConfidenceRows}</span>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-2.5 text-sm">
            <span className="font-medium text-slate-900">Missing documents</span>
            <span className="text-slate-700">{missingRequirements.length}</span>
          </div>
          <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-700 md:col-span-2">
            Missing categories:{" "}
            {data.dataQuality.missingCategories.length > 0
              ? data.dataQuality.missingCategories.join(", ")
              : "None"}
          </div>
          <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-700 md:col-span-2">
            Statement coverage confidence: {data.dataQuality.confidenceLabel}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 px-4 py-4">
          <p className="text-sm font-semibold text-slate-900">Key issues</p>
          <div className="mt-3 space-y-2">
            {sourceQueue.length > 0 ? (
              sourceQueue.map((issue) => (
                <div key={issue} className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-700">
                  {issue}
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-700">
                No open source reconciliation items are currently surfaced.
              </div>
            )}
            <div className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-700">
              {data.periods.length} period(s), {data.entries.length} row(s), {data.documents.length} document(s)
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
