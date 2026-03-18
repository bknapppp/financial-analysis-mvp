"use client";

import { formatCurrency } from "@/lib/formatters";
import type { AuditMetric, KpiTraceabilityBadge, TraceableEntry } from "@/lib/types";
import { SaveMappingButton } from "@/components/save-mapping-button";

type AuditDrilldownPanelProps = {
  metric: AuditMetric | null;
  companyId: string | null;
  onClose: () => void;
  onMappingSaved: () => void;
};

function badgeClass(label: KpiTraceabilityBadge["label"]) {
  if (label === "Partial mapping") {
    return "bg-amber-100 text-amber-800";
  }

  if (label === "Unmapped data" || label === "Low confidence") {
    return "bg-rose-100 text-rose-800";
  }

  return "bg-slate-100 text-slate-700";
}

function matchLabel(row: TraceableEntry) {
  if (row.matchedBy === "saved_mapping") {
    return "Saved mapping";
  }

  if (row.matchedBy === "keyword") {
    return "Keyword match";
  }

  if (row.matchedBy === "csv_value") {
    return "CSV value";
  }

  return "Manual";
}

function matchClass(value: TraceableEntry["matchedBy"]) {
  if (value === "saved_mapping") return "bg-slate-100 text-slate-600";
  if (value === "keyword") return "bg-slate-100 text-slate-600";
  if (value === "csv_value") return "bg-slate-100 text-slate-600";
  return "bg-slate-100 text-slate-600";
}

function confidenceLabel(value: TraceableEntry["confidence"]) {
  if (value === "high") return "High confidence";
  if (value === "medium") return "Medium confidence";
  return "Low confidence";
}

function formatStatementType(value: TraceableEntry["statementType"]) {
  return value === "balance_sheet" ? "Balance sheet" : "Income";
}

function detailLabel(row: TraceableEntry) {
  const parts = [
    row.category,
    formatStatementType(row.statementType),
    row.addbackFlag ? "Add-back" : null
  ].filter(Boolean);

  return parts.join(" • ");
}

function mappedPercent(metric: AuditMetric) {
  if (metric.rowCount === 0) {
    return 0;
  }

  return Math.round((metric.mappedCount / metric.rowCount) * 100);
}

export function AuditDrilldownPanel({
  metric,
  companyId,
  onClose,
  onMappingSaved
}: AuditDrilldownPanelProps) {
  if (!metric) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35">
      <button
        type="button"
        aria-label="Close audit panel"
        className="flex-1"
        onClick={onClose}
      />
      <aside className="h-full w-full max-w-3xl overflow-y-auto border-l border-slate-200 bg-white px-6 py-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
              Audit trail
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-900">
              {metric.label}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Every displayed row reconciles directly to the total.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Total
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              {formatCurrency(metric.total)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <span>
              {metric.rowCount} row{metric.rowCount === 1 ? "" : "s"} • {mappedPercent(metric)}% mapped
            </span>
            {metric.badge ? (
              <span
                className={`rounded-full px-3 py-1.5 font-medium ${badgeClass(metric.badge.label)}`}
              >
                {metric.badge.label}
              </span>
            ) : null}
            {metric.manualCount > 0 ? (
              <span>{metric.manualCount} manual</span>
            ) : null}
          </div>
        </div>

        <div className="mt-6 space-y-8">
          {metric.groups.map((group) => (
            <section key={group.label}>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">
                    {group.label}
                  </h4>
                  <p className="mt-1 text-sm text-slate-500">
                    {group.rows.length} contributing row{group.rows.length === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="text-lg font-semibold text-slate-900">
                  {formatCurrency(group.subtotal)}
                </p>
              </div>

              <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
                {group.rows.map((row) => (
                  <details key={row.id} className="group">
                    <summary className="list-none cursor-pointer px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {row.accountName}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span
                              className={`rounded-full px-2 py-1 font-medium ${matchClass(row.matchedBy)}`}
                              title={row.mappingExplanation}
                            >
                              {matchLabel(row)}
                            </span>
                            <span className="text-slate-400">{confidenceLabel(row.confidence)}</span>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-lg font-semibold text-slate-900">
                            {formatCurrency(row.displayAmount)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Status
                          </p>
                        </div>
                      </div>
                    </summary>

                    <div className="border-t border-slate-100 px-4 pb-4">
                      <div className="flex flex-col gap-3 pt-3 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1 text-sm text-slate-600">
                          <p>{detailLabel(row)}</p>
                          <p>{row.mappingExplanation}</p>
                        </div>

                        <SaveMappingButton
                          companyId={companyId}
                          accountName={row.accountName}
                          category={row.category}
                          statementType={row.statementType}
                          onSaved={onMappingSaved}
                        />
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}
