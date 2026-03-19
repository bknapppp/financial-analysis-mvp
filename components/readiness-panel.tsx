"use client";

import type { DataReadiness } from "@/lib/types";

type ReadinessPanelProps = {
  readiness: DataReadiness;
};

export function ReadinessPanel({ readiness }: ReadinessPanelProps) {
  const tone =
    readiness.status === "ready"
      ? {
          ring: "border-teal-200 bg-teal-50/70",
          badge: "bg-teal-600 text-white",
          heading: "text-teal-900"
        }
      : readiness.status === "caution"
        ? {
            ring: "border-amber-200 bg-amber-50/70",
            badge: "bg-amber-500 text-slate-950",
            heading: "text-amber-900"
          }
        : {
            ring: "border-rose-200 bg-rose-50/70",
            badge: "bg-rose-600 text-white",
            heading: "text-rose-900"
          };
  const primaryReasons =
    readiness.status === "blocked"
      ? readiness.blockingReasons
      : readiness.cautionReasons;

  return (
    <section className={`rounded-[1.75rem] border p-5 shadow-panel ${tone.ring}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            Readiness
          </p>
          <h2 className={`mt-2 text-xl font-semibold ${tone.heading}`}>
            {readiness.label}
          </h2>
          <p className="mt-2 text-sm text-slate-700">{readiness.summaryMessage}</p>
        </div>
        <div className={`rounded-full px-4 py-2 text-sm font-semibold ${tone.badge}`}>
          {readiness.label}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {readiness.status === "blocked" ? "Blocking reasons" : "Primary cautions"}
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {primaryReasons.length > 0 ? (
              primaryReasons.slice(0, 4).map((reason) => <li key={reason}>• {reason}</li>)
            ) : (
              <li>No material readiness issues were detected.</li>
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/70 p-4">
          <p className="text-sm font-semibold text-slate-900">Implication</p>
          <p className="mt-3 text-sm text-slate-700">
            {readiness.status === "ready"
              ? "Adjusted EBITDA can be used as decision-grade output based on current validation checks."
              : readiness.status === "caution"
                ? "Adjusted EBITDA remains visible, but the output should be reviewed alongside the listed caution items."
                : "Adjusted EBITDA should not be relied on as decision-grade until the blocking issues are resolved."}
          </p>
        </div>
      </div>
    </section>
  );
}
