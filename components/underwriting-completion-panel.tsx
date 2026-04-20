"use client";

import Link from "next/link";
import { buildFixItHref } from "@/lib/fix-it";
import type { UnderwritingCompletionSummary } from "@/lib/types";

type UnderwritingCompletionPanelProps = {
  companyId?: string | null;
  summary: UnderwritingCompletionSummary;
};

function statusLabel(status: UnderwritingCompletionSummary["completionStatus"]) {
  if (status === "ready") return "Ready";
  if (status === "blocked") return "Blocked";
  return "In progress";
}

function statusClasses(status: UnderwritingCompletionSummary["completionStatus"]) {
  if (status === "ready") {
    return "border-teal-200 bg-teal-50 text-teal-800";
  }

  if (status === "blocked") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function UnderwritingCompletionPanel({
  companyId,
  summary
}: UnderwritingCompletionPanelProps) {
  const orderedActions = summary.nextActions.slice(0, 5);

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel lg:sticky lg:top-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            Underwriting Actions
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">
            Missing Inputs
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Ordered actions tied to the missing inputs and workflow gaps that still prevent a complete underwriting output.
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${statusClasses(
            summary.completionStatus
          )}`}
        >
          {statusLabel(summary.completionStatus)}
        </span>
      </div>

      {orderedActions.length > 0 ? (
        <ol className="mt-5 space-y-2">
          {orderedActions.map((item, index) => (
            <li
              key={item}
              className="flex gap-3 rounded-2xl bg-slate-50 px-3 py-3"
            >
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                {index + 1}
              </span>
              <div>
                {companyId ? (
                  <Link
                    href={buildFixItHref(item, `/deal/${companyId}/underwriting`)}
                    className="inline-flex rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-100"
                  >
                    {item}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-slate-900">{item}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-5 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4 text-sm text-slate-700">
          No additional workflow actions are currently surfaced by the completion rules.
        </div>
      )}
    </section>
  );
}
