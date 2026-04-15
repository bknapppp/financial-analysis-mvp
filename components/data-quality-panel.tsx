import type { DataQualityReport } from "@/lib/types";

type DataQualityPanelProps = {
  report: DataQualityReport;
};

type SummaryRow = {
  label: string;
  value: string;
};

function formatConfidenceLabel(label: DataQualityReport["confidenceLabel"]) {
  return label === "Medium" ? "Moderate" : label;
}

function hasMaterialIssues(report: DataQualityReport) {
  return report.issueGroups.some((group) =>
    group.issues.some((issue) => issue.severity !== "Info")
  );
}

export function DataQualityPanel({ report }: DataQualityPanelProps) {
  const rows: SummaryRow[] = [];

  if (report.missingCategories.length > 0) {
    rows.push({
      label: "Missing inputs",
      value: report.missingCategories.join(", ")
    });
  }

  if (report.missingCategories.length > 0 || report.consistencyIssues.length > 0) {
    rows.push({
      label: "Statement coverage",
      value: `${report.missingCategories.length} categories missing`
    });
  }

  rows.push({
    label: "Mapping confidence",
    value: formatConfidenceLabel(report.confidenceLabel)
  });

  const summaryRows = rows.slice(0, 3);

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Data quality</h2>

        {!hasMaterialIssues(report) ? (
          <div className="flex flex-col gap-1 text-sm text-slate-600 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <span className="font-medium text-slate-900">Data quality</span>
            <span>No material issues detected</span>
          </div>
        ) : (
          <div className="space-y-2">
            {summaryRows.map((row) => (
              <div
                key={row.label}
                className="flex flex-col gap-1 border-b border-slate-100 pb-2 text-sm last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <span className="font-medium text-slate-900">{row.label}</span>
                <span className="text-slate-600 sm:text-right">{row.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
