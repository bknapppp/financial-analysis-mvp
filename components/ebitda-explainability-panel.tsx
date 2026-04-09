"use client";

import { formatCurrency } from "@/lib/formatters";
import type { EbitdaExplainability } from "@/lib/types";

type EbitdaExplainabilityPanelProps = {
  explainability: EbitdaExplainability | null | undefined;
};

function formatOptionalCurrency(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : formatCurrency(value);
}

function basisBadgeClass(basis: NonNullable<EbitdaExplainability["basis"]>) {
  if (basis === "computed") {
    return "border-teal-200 bg-teal-50 text-teal-800";
  }

  if (basis === "reported_fallback") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function BridgeRow({
  label,
  value,
  emphasis = false,
  prefix = ""
}: {
  label: string;
  value: number | null | undefined;
  emphasis?: boolean;
  prefix?: string;
}) {
  const display = formatOptionalCurrency(value);

  return (
    <div className="flex items-center justify-between gap-4 border-b border-dashed border-slate-200 py-3 last:border-b-0 last:pb-0">
      <p className={`text-sm ${emphasis ? "font-semibold text-slate-900" : "text-slate-700"}`}>
        {label}
      </p>
      <p
        className={`text-lg ${emphasis ? "font-semibold text-slate-950" : "font-medium text-slate-900"}`}
      >
        {display === "—" ? display : `${prefix}${display}`}
      </p>
    </div>
  );
}

export function EbitdaExplainabilityPanel({
  explainability
}: EbitdaExplainabilityPanelProps) {
  if (!explainability) {
    return null;
  }

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            EBITDA Construction
          </p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">
            Canonical EBITDA build
          </h2>
          <p className="mt-1 text-sm text-slate-500">{explainability.note}</p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium ${basisBadgeClass(
            explainability.basis
          )}`}
        >
          {explainability.basisLabel}
        </span>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2">
          <BridgeRow label="Net Income" value={explainability.netIncome} />
          <BridgeRow
            label="Interest Add-back"
            value={explainability.interestAddBack}
            prefix="+"
          />
          <BridgeRow
            label="Tax Add-back"
            value={explainability.taxAddBack}
            prefix="+"
          />
          <BridgeRow
            label="Depreciation & Amortization"
            value={explainability.depreciationAndAmortizationAddBack}
            prefix="+"
          />
          <BridgeRow
            label="EBITDA"
            value={
              explainability.basis === "computed"
                ? explainability.computedEbitda
                : explainability.reportedEbitda
            }
            emphasis
            prefix="="
          />
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              Reported EBITDA
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              {formatOptionalCurrency(explainability.reportedEbitda)}
            </p>
            <p className="mt-1 text-sm text-slate-500">Reference only</p>
          </div>

          {explainability.missingComponents.length > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-amber-900">
                Missing bottom-up inputs
              </p>
              <p className="mt-1 text-sm text-amber-800">
                {explainability.missingComponents.join(", ")}
              </p>
            </div>
          ) : null}

          {explainability.selectedLabels.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                Labels Used
              </p>
              <p className="mt-2 text-sm text-slate-700">
                {explainability.selectedLabels.join(", ")}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
