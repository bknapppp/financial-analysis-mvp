import { formatPercent } from "@/lib/formatters";
import type { DataQualityReport } from "@/lib/types";

type DataQualityPanelProps = {
  report: DataQualityReport;
};

export function DataQualityPanel({ report }: DataQualityPanelProps) {
  const visibleGroups = report.issueGroups.filter((group) => group.issues.length > 0);
  const toneClasses =
    report.confidenceLabel === "High"
      ? {
          badge: "bg-teal-100 text-teal-800",
          progress: "bg-teal-500",
          ring: "border-teal-200 bg-teal-50/60"
        }
      : report.confidenceLabel === "Medium"
        ? {
            badge: "bg-amber-100 text-amber-800",
            progress: "bg-amber-500",
            ring: "border-amber-200 bg-amber-50/60"
          }
        : {
            badge: "bg-rose-100 text-rose-800",
            progress: "bg-rose-500",
            ring: "border-rose-200 bg-rose-50/60"
          };

  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-panel">
      <div className="grid gap-5 xl:grid-cols-[1.05fr_1.5fr]">
        <ScoreCard report={report} toneClasses={toneClasses} />
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Mapping Coverage
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {formatPercent(report.mappingCoveragePercent)} of rows are mapped.
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold text-slate-900">
                  {report.mappingBreakdown.saved_mapping +
                    report.mappingBreakdown.keyword_mapping +
                    report.mappingBreakdown.manual_mapping}
                  /{report.mappingBreakdown.saved_mapping +
                    report.mappingBreakdown.keyword_mapping +
                    report.mappingBreakdown.manual_mapping +
                    report.mappingBreakdown.unmapped}
                </p>
                <p className="text-slate-500">mapped rows</p>
              </div>
            </div>

            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
              <div className="flex h-full">
                <Segment
                  value={report.mappingBreakdown.saved_mapping}
                  total={
                    report.mappingBreakdown.saved_mapping +
                    report.mappingBreakdown.keyword_mapping +
                    report.mappingBreakdown.manual_mapping +
                    report.mappingBreakdown.unmapped
                  }
                  className="bg-teal-500"
                />
                <Segment
                  value={report.mappingBreakdown.keyword_mapping}
                  total={
                    report.mappingBreakdown.saved_mapping +
                    report.mappingBreakdown.keyword_mapping +
                    report.mappingBreakdown.manual_mapping +
                    report.mappingBreakdown.unmapped
                  }
                  className="bg-sky-500"
                />
                <Segment
                  value={report.mappingBreakdown.manual_mapping}
                  total={
                    report.mappingBreakdown.saved_mapping +
                    report.mappingBreakdown.keyword_mapping +
                    report.mappingBreakdown.manual_mapping +
                    report.mappingBreakdown.unmapped
                  }
                  className="bg-slate-500"
                />
                <Segment
                  value={report.mappingBreakdown.unmapped}
                  total={
                    report.mappingBreakdown.saved_mapping +
                    report.mappingBreakdown.keyword_mapping +
                    report.mappingBreakdown.manual_mapping +
                    report.mappingBreakdown.unmapped
                  }
                  className="bg-amber-400"
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <MetricCard label="Saved Mapping" value={String(report.mappingBreakdown.saved_mapping)} />
              <MetricCard label="Keyword Mapping" value={String(report.mappingBreakdown.keyword_mapping)} />
              <MetricCard label="Manual Mapping" value={String(report.mappingBreakdown.manual_mapping)} />
            </div>
          </div>

          {visibleGroups.length > 0 ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {visibleGroups.map((group) => (
                <IssueGroup key={group.key} title={group.title} issues={group.issues} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
              No major data quality issues detected.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
    </article>
  );
}

function ScoreCard({
  report,
  toneClasses
}: {
  report: DataQualityReport;
  toneClasses: { badge: string; progress: string; ring: string };
}) {
  return (
    <div className={`rounded-2xl border p-5 ${toneClasses.ring}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-600">Data Quality Score</p>
          <p className="mt-2 text-5xl font-semibold tracking-tight text-slate-900">
            {report.confidenceScore}
          </p>
        </div>
        <div className={`rounded-full px-3 py-1 text-sm font-medium ${toneClasses.badge}`}>
          {report.confidenceLabel}
        </div>
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/80">
        <div
          className={`h-full rounded-full ${toneClasses.progress}`}
          style={{ width: `${report.confidenceScore}%` }}
        />
      </div>

      <p className="mt-4 text-sm text-slate-700">{report.summaryMessage}</p>
      <p className="mt-2 text-sm text-slate-500">
        Confidence reflects mapping coverage, completeness, anomaly checks, and cross-period consistency.
      </p>
    </div>
  );
}

function IssueGroup({
  title,
  issues
}: {
  title: string;
  issues: Array<{ message: string; severity: "Critical" | "Warning" | "Info" }>;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <ul className="mt-3 space-y-3">
        {issues.slice(0, 3).map((issue) => (
          <li key={`${title}-${issue.message}`} className="flex items-start gap-3">
            <SeverityDot severity={issue.severity} />
            <div>
              <p className="text-sm font-medium text-slate-900">{issue.severity}</p>
              <p className="text-sm text-slate-600">{issue.message}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SeverityDot({
  severity
}: {
  severity: "Critical" | "Warning" | "Info";
}) {
  const colorClass =
    severity === "Critical"
      ? "bg-rose-500"
      : severity === "Warning"
        ? "bg-amber-500"
        : "bg-slate-400";

  return <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${colorClass}`} />;
}

function Segment({
  value,
  total,
  className
}: {
  value: number;
  total: number;
  className: string;
}) {
  if (total === 0 || value === 0) {
    return null;
  }

  return <div className={className} style={{ width: `${(value / total) * 100}%` }} />;
}
