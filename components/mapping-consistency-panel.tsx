"use client";

import type { MappingConsistencyIssue } from "@/lib/types";
import { SaveMappingButton } from "@/components/save-mapping-button";

type MappingConsistencyPanelProps = {
  companyId: string | null;
  issues: MappingConsistencyIssue[];
  onMappingSaved: () => void;
};

export function MappingConsistencyPanel({
  companyId,
  issues,
  onMappingSaved
}: MappingConsistencyPanelProps) {
  if (issues.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-panel">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">
          Mapping consistency
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Standardize accounts mapped differently across periods.
        </p>
      </div>

      <div className="space-y-4">
        {issues.slice(0, 6).map((issue) => (
          <div
            key={issue.accountName}
            className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4"
          >
            <p className="font-medium text-slate-900">{issue.accountName}</p>
            <p className="mt-1 text-sm text-slate-600">{issue.message}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {issue.mappings.map((mapping) => (
                <div
                  key={`${issue.accountName}-${mapping.periodLabel}-${mapping.category}-${mapping.statementType}`}
                  className="flex items-center gap-2 rounded-xl border border-white/70 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <span className="font-medium text-slate-900">
                    {mapping.periodLabel}
                  </span>
                  <span>{mapping.category}</span>
                  <span className="text-slate-400">/</span>
                  <span>{mapping.statementType}</span>
                  <SaveMappingButton
                    companyId={companyId}
                    accountName={issue.accountName}
                    category={mapping.category}
                    statementType={mapping.statementType}
                    onSaved={onMappingSaved}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
