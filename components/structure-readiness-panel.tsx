"use client";

import type { CreditScenarioResult } from "@/lib/types";

type StructureReadinessPanelProps = {
  scenario: CreditScenarioResult;
  missingInputs: string[];
};

function buildReasonText(metric: "DSCR" | "Leverage" | "LTV", missingInputs: string[]) {
  if (metric === "DSCR") {
    return missingInputs.length > 0
      ? `Cannot be computed until ${missingInputs.join(", ").toLowerCase()} ${missingInputs.length === 1 ? "is" : "are"} entered.`
      : "Cannot be computed because debt service inputs are incomplete.";
  }

  if (metric === "Leverage") {
    return missingInputs.length > 0
      ? `Cannot be computed until the debt sizing inputs are complete and the EBITDA basis remains available.`
      : "Cannot be computed because debt sizing or EBITDA support is incomplete.";
  }

  return missingInputs.includes("Purchase price / collateral support")
    ? "Cannot be computed until purchase price or collateral support is entered."
    : "Cannot be computed because collateral support is incomplete.";
}

export function StructureReadinessPanel({
  scenario,
  missingInputs
}: StructureReadinessPanelProps) {
  const readinessItems = [
    {
      label: "DSCR" as const,
      isComputable: scenario.metrics.dscr.status !== "insufficient"
    },
    {
      label: "Leverage" as const,
      isComputable: scenario.metrics.debtToEbitda.status !== "insufficient"
    },
    {
      label: "LTV" as const,
      isComputable: scenario.metrics.ltv.status !== "insufficient"
    }
  ];
  const blockedItems = readinessItems.filter((item) => !item.isComputable);

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <div className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
          Structure Readiness
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-900">
          Structure Readiness
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Structure outputs that still cannot be computed, and the missing support behind each gap.
        </p>
      </div>

      <div className="mt-5 space-y-3">
        {blockedItems.length > 0 ? (
          blockedItems.map((item) => (
            <article
              key={item.label}
              className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4"
            >
              <p className="text-base font-semibold text-slate-900">{item.label}</p>
              <p className="mt-2 text-sm text-slate-700">
                {buildReasonText(item.label, missingInputs)}
              </p>
            </article>
          ))
        ) : (
          <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4">
            <p className="text-sm font-medium text-slate-900">
              All core structure metrics are currently computable from the entered inputs.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
