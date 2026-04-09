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
  const highCount = flags.filter((flag) => flag.severity === "high").length;
  const mediumCount = flags.filter((flag) => flag.severity === "medium").length;
  const lowCount = flags.filter((flag) => flag.severity === "low").length;

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            Risk Flags
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">
            Deterministic risk readout
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Interpret the existing underwriting, add-back, and data-quality outputs without changing the underlying calculations.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryPill label="High" value={highCount} tone="high" />
          <SummaryPill label="Medium" value={mediumCount} tone="medium" />
          <SummaryPill label="Low" value={lowCount} tone="low" />
        </div>
      </div>

      {flags.length > 0 ? (
        <div className="mt-5 space-y-3">
          {flags.map((flag, index) => {
            const tone = severityTone(flag.severity);
            const isPrimary = index === 0 && flag.severity === "high";

            return (
              <article
                key={`${flag.severity}-${flag.title}`}
                className={`rounded-2xl border px-4 py-4 ${isPrimary ? "shadow-sm" : ""} ${tone.card}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {isPrimary ? (
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">
                        Primary Credit Concern
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
                  <div className="mt-4 rounded-xl border border-white/80 bg-white/70 px-3 py-2">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                      Metric
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{flag.metric}</p>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4">
          <p className="text-sm font-medium text-slate-900">
            No material underwriting exceptions are currently triggered.
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Current coverage, leverage, collateral, and earnings signals remain within the panel&apos;s defined thresholds.
          </p>
        </div>
      )}
    </section>
  );
}

function SummaryPill({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: RiskFlagSeverity;
}) {
  const toneClasses = severityTone(tone);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
          {label}
        </p>
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${toneClasses.badge}`}>
          {value}
        </span>
      </div>
    </div>
  );
}
