import type { DiligenceIssueGroup, DiligenceReadiness } from "@/lib/types";

type DiligenceReadinessPanelProps = {
  readiness: DiligenceReadiness;
  issueGroups: DiligenceIssueGroup[];
  title?: string;
  description?: string;
};

function toneClasses(state: DiligenceReadiness["state"]) {
  if (state === "ready_for_lender" || state === "completed") {
    return "border-teal-200 bg-teal-50 text-teal-900";
  }

  if (state === "ready_for_ic" || state === "structurally_ready") {
    return "border-sky-200 bg-sky-50 text-sky-900";
  }

  if (state === "under_review" || state === "needs_validation") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  return "border-rose-200 bg-rose-50 text-rose-900";
}

export function DiligenceReadinessPanel({
  readiness,
  issueGroups,
  title = "Readiness",
  description = "Deterministic diligence readiness derived from current open issues."
}: DiligenceReadinessPanelProps) {
  const visibleGroups = issueGroups.slice(0, 4);

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            {title}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">
            {readiness.readinessLabel}
          </h2>
          <p className="mt-2 text-sm text-slate-600">{description}</p>
          <p className="mt-2 text-sm font-medium text-slate-900">
            {readiness.readinessReason}
          </p>
        </div>

        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${toneClasses(
            readiness.state
          )}`}
        >
          {readiness.readinessLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            Active Issues
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {readiness.activeIssueCount}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            Critical
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {readiness.criticalIssueCount}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            High
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {readiness.highIssueCount}
          </p>
        </div>
      </div>

      {readiness.primaryBlockerLabel || readiness.primaryBlockerIssueTitle ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            Blocking Context
          </p>
          {readiness.primaryBlockerLabel ? (
            <p className="mt-2 text-sm font-medium text-slate-900">
              {readiness.readinessLabel} - blocked by {readiness.primaryBlockerLabel}
            </p>
          ) : null}
          {readiness.blockerIssueTitles.length > 0 ? (
            <p className="mt-2 text-sm text-slate-700">
              Blocking issues: {readiness.blockerIssueTitles.slice(0, 2).join("; ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {visibleGroups.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {visibleGroups.map((group) => (
            <span
              key={group.groupKey}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
            >
              {group.groupLabel}: {group.issueCount}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
