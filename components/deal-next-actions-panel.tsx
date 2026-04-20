"use client";

import Link from "next/link";
import { buildDealActionHref, type DealAction, type DealIssue } from "@/lib/deal-state";

type DealNextActionsPanelProps = {
  companyId: string;
  actions: DealAction[];
  issues: DealIssue[];
  completeness: number;
  trustScore: number;
};

function severityClasses(severity: "blocker" | "warning") {
  return severity === "blocker"
    ? "border-rose-200 bg-rose-50 text-rose-900"
    : "border-amber-200 bg-amber-50 text-amber-900";
}

export function DealNextActionsPanel({
  companyId,
  actions,
  issues,
  completeness,
  trustScore
}: DealNextActionsPanelProps) {
  const actionsWithIssues = actions
    .map((action) => ({
      action,
      issue: issues.find((issue) => issue.id === action.issueId) ?? null
    }))
    .filter((item): item is { action: DealAction; issue: DealIssue } => item.issue !== null);

  const blockerActions = actionsWithIssues.filter((item) => item.issue.severity === "blocker");
  const warningActions = actionsWithIssues.filter((item) => item.issue.severity === "warning");

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            Next Actions
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">
            Deterministic workflow queue
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Current data, reconciliation, mapping, and credit signals rolled up into the next concrete step.
          </p>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">
          {completeness}% complete | {trustScore} trust
        </div>
      </div>

      {actionsWithIssues.length > 0 ? (
        <div className="mt-5 space-y-4">
          {([["Blockers", blockerActions], ["Warnings", warningActions]] as const)
            .filter(([, items]) => items.length > 0)
            .map(([label, items]) => (
              <div key={label}>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  {label}
                </p>

                <div className="mt-2 space-y-2">
                  {items.map(({ action, issue }) => (
                    <div
                      key={action.id}
                      className={`rounded-2xl border px-4 py-3 ${severityClasses(issue.severity)}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="max-w-3xl">
                          <p className="text-sm font-medium text-slate-900">{issue.message}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500">
                            {issue.location === "source" ? "Source data" : "Underwriting"}
                          </p>
                        </div>
                        <Link
                          href={buildDealActionHref(action, companyId)}
                          className="inline-flex rounded-xl bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                        >
                          {action.label}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4 text-sm text-slate-700">
          No deal-state actions are currently required.
        </div>
      )}
    </section>
  );
}
