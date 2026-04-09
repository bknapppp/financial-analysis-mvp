"use client";

import { buildDealDecision, type DealRecommendation } from "@/lib/deal-decision";
import type { RiskFlag } from "@/lib/risk-flags";
import type { CreditScenarioResult, PeriodSnapshot } from "@/lib/types";

type DealDecisionPanelProps = {
  snapshot: PeriodSnapshot;
  creditScenario: CreditScenarioResult;
  riskFlags: RiskFlag[];
  acceptedAddBackTotal: number;
};

function recommendationTone(recommendation: DealRecommendation) {
  if (recommendation === "approve") {
    return {
      badge: "bg-teal-100 text-teal-800",
      panel: "border-teal-200 bg-teal-50/70",
      accent: "text-teal-800"
    };
  }

  if (recommendation === "caution") {
    return {
      badge: "bg-amber-100 text-amber-800",
      panel: "border-amber-200 bg-amber-50/70",
      accent: "text-amber-800"
    };
  }

  return {
    badge: "bg-rose-100 text-rose-800",
    panel: "border-rose-200 bg-rose-50/70",
    accent: "text-rose-800"
  };
}

function recommendationLabel(recommendation: DealRecommendation) {
  if (recommendation === "approve") {
    return "Approve";
  }

  if (recommendation === "caution") {
    return "Caution";
  }

  return "Decline";
}

export function DealDecisionPanel(props: DealDecisionPanelProps) {
  const decision = buildDealDecision(props);
  const tone = recommendationTone(decision.recommendation);

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            Deal Decision
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">
            {decision.headline}
          </h2>
          <p className="mt-2 text-sm text-slate-600">{decision.summary}</p>
        </div>
        <div className={`rounded-2xl border px-4 py-3 ${tone.panel}`}>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            Recommendation
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone.badge}`}>
              {recommendationLabel(decision.recommendation)}
            </span>
            <span className={`text-sm font-medium ${tone.accent}`}>
              Deterministic credit readout
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
          Primary Reasons
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {decision.primaryReasons.map((reason) => (
            <article
              key={`${decision.recommendation}-${reason.label}`}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <p className="text-sm font-semibold text-slate-900">{reason.label}</p>
              {reason.detail ? (
                <p className="mt-2 text-sm text-slate-600">{reason.detail}</p>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
