"use client";

import { buildRiskFlags, type RiskFlag, type RiskFlagSeverity } from "@/lib/risk-flags";
import type {
  AddBackReviewItem,
  CreditScenarioResult,
  DataQualityReport,
  DataReadiness,
  PeriodSnapshot
} from "@/lib/types";

type RiskFlagsPanelProps = {
  snapshot: PeriodSnapshot;
  creditScenario: CreditScenarioResult;
  readiness: DataReadiness;
  dataQuality: DataQualityReport;
  acceptedAddBackItems: AddBackReviewItem[];
  blockers?: string[];
};

function severityTone(severity: RiskFlagSeverity) {
  if (severity === "high") {
    return {
      badge: "bg-rose-100 text-rose-800",
      card: "border-rose-200 bg-rose-50/60"
    };
  }

  if (severity === "medium") {
    return {
      badge: "bg-amber-100 text-amber-800",
      card: "border-amber-200 bg-amber-50/60"
    };
  }

  return {
    badge: "bg-slate-200 text-slate-700",
    card: "border-slate-200 bg-slate-50"
  };
}

function severityLabel(severity: RiskFlagSeverity) {
  if (severity === "high") return "High";
  if (severity === "medium") return "Medium";
  return "Low";
}

export function RiskFlagsPanel(props: RiskFlagsPanelProps) {
  const flags = buildRiskFlags(props);
  const topFlags = flags.slice(0, 3);
  const gapItems = (props.blockers ?? []).slice(0, Math.max(0, 3 - topFlags.length));

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <div>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            Key Risks & Gaps
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">
            Key Risks & Gaps
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            The highest-impact underwriting exceptions, ordered from most material to least material.
          </p>
        </div>
      </div>

      {topFlags.length > 0 || gapItems.length > 0 ? (
        <div className="mt-5 divide-y divide-slate-200 rounded-2xl bg-slate-50">
          {topFlags.map((flag, index) => {
            const tone = severityTone(flag.severity);
            const rank = index + 1;

            return (
              <article
                key={`${flag.severity}-${flag.title}`}
                className={`px-4 py-3 ${tone.card}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {rank === 1 ? (
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">
                        Highest impact
                      </p>
                    ) : null}
                    <p className="text-base font-semibold text-slate-900">{flag.title}</p>
                    <p className="mt-2 text-sm text-slate-700">{flag.description}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone.badge}`}
                  >
                    {severityLabel(flag.severity)}
                  </span>
                </div>
                {flag.metric ? (
                  <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                    Metric:{" "}
                    <span className="normal-case tracking-normal text-slate-700">
                      {flag.metric}
                    </span>
                  </p>
                ) : null}
              </article>
            );
          })}
          {gapItems.map((item) => (
            <article key={item} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item}</p>
                  <p className="mt-1 text-sm text-slate-700">
                    This gap is still blocking parts of the underwriting workflow from completing.
                  </p>
                </div>
                <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                  Gap
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4">
          <p className="text-sm font-medium text-slate-900">
            No material underwriting exceptions are currently triggered.
          </p>
        </div>
      )}
    </section>
  );
}
