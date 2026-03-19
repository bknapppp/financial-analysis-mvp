"use client";

import type { ReconciliationReport } from "@/lib/types";

type ReconciliationPanelProps = {
  report: ReconciliationReport;
};

function toneClasses(status: ReconciliationReport["status"]) {
  if (status === "failed") {
    return {
      panel: "border-rose-200 bg-rose-50",
      badge: "bg-rose-100 text-rose-800"
    };
  }

  if (status === "warning") {
    return {
      panel: "border-amber-200 bg-amber-50",
      badge: "bg-amber-100 text-amber-800"
    };
  }

  return {
    panel: "border-teal-200 bg-teal-50",
    badge: "bg-teal-100 text-teal-800"
  };
}

export function ReconciliationPanel({ report }: ReconciliationPanelProps) {
  const tones = toneClasses(report.status);
  const visibleIssues = report.issues.slice(0, 2);

  return (
    <section className={`rounded-[1.75rem] border p-5 shadow-panel ${tones.panel}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            Reconciliation
          </p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">
            {report.label}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{report.summaryMessage}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${tones.badge}`}>
          {report.withinTolerance ? "Within tolerance" : "Outside tolerance"}
        </span>
      </div>

      {visibleIssues.length > 0 ? (
        <ul className="mt-4 space-y-2 text-sm text-slate-700">
          {visibleIssues.map((issue) => (
            <li key={`${issue.key}-${issue.metric}`} className="flex gap-2">
              <span className="font-medium text-slate-900">{issue.metric}:</span>
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-slate-600">
          Statement outputs and adjusted earnings currently reconcile cleanly.
        </p>
      )}
    </section>
  );
}
