"use client";

import { BackingChip } from "@/components/backing-chip";
import { formatCreditScenarioCurrency } from "@/lib/credit-scenario";
import type {
  BackingStatus,
  CreditScenarioResult,
  PeriodSnapshot,
  UnderwritingEbitdaBasis
} from "@/lib/types";

type UnderwritingSnapshotPanelProps = {
  snapshot: PeriodSnapshot;
  scenario: CreditScenarioResult;
  ebitdaBasis: UnderwritingEbitdaBasis;
  missingInputs: string[];
  canonicalEbitda: number | null;
  adjustedEbitda: number | null;
  backingByMetric?: Partial<Record<"ebitda" | "dscr" | "ltv" | "debtToEbitda", BackingStatus>>;
  onMetricSupportClick?: (metricId: string) => void;
};

type KpiConfig = {
  key: "ebitda" | "dscr" | "ltv" | "debtToEbitda";
  label: string;
  value: string;
  helper: string;
  unavailable: boolean;
};

function formatMultiple(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Pending inputs";
  }

  return `${value.toFixed(2)}x`;
}

export function UnderwritingSnapshotPanel({
  snapshot,
  scenario,
  ebitdaBasis,
  missingInputs,
  canonicalEbitda,
  adjustedEbitda,
  backingByMetric = {},
  onMetricSupportClick
}: UnderwritingSnapshotPanelProps) {
  const selectedEbitda = ebitdaBasis === "adjusted" ? adjustedEbitda : canonicalEbitda;
  const kpis: KpiConfig[] = [
    {
      key: "ebitda",
      label: "EBITDA",
      value: formatCreditScenarioCurrency(selectedEbitda ?? null),
      helper:
        ebitdaBasis === "adjusted"
          ? "Using adjusted underwriting basis"
          : "Using canonical computed basis",
      unavailable: selectedEbitda === null
    },
    {
      key: "dscr",
      label: "DSCR",
      value: formatMultiple(scenario.metrics.dscr.value),
      helper: "EBITDA / annual debt service",
      unavailable: scenario.metrics.dscr.status === "insufficient"
    },
    {
      key: "ltv",
      label: "Leverage",
      value:
        scenario.metrics.ltv.value === null || !Number.isFinite(scenario.metrics.ltv.value)
          ? "Pending inputs"
          : `${(scenario.metrics.ltv.value * 100).toFixed(1)}%`,
      helper: "Loan amount / collateral value",
      unavailable: scenario.metrics.ltv.status === "insufficient"
    },
    {
      key: "debtToEbitda",
      label: "Debt / EBITDA",
      value: formatMultiple(scenario.metrics.debtToEbitda.value),
      helper: "Debt load relative to earnings",
      unavailable: scenario.metrics.debtToEbitda.status === "insufficient"
    }
  ];
  const unavailableLabels = kpis
    .filter((kpi) => kpi.unavailable)
    .map((kpi) => kpi.label);
  const metricsReady = unavailableLabels.length === 0;

  return (
    <details
      className="rounded-[1.6rem] border border-slate-200/80 bg-white px-4 py-3 shadow-panel md:px-5"
      open={metricsReady}
    >
      <summary className="flex cursor-pointer list-none flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            Credit Outputs
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Core underwriting outputs for the current case.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
            {snapshot.label}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
            {ebitdaBasis === "adjusted" ? "Basis: Adjusted EBITDA" : "Basis: Computed EBITDA"}
          </span>
          <span
            className={`rounded-full px-3 py-1 font-medium ${
              metricsReady ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-700"
            }`}
          >
            {metricsReady ? "All core metrics ready" : `${unavailableLabels.length} pending`}
          </span>
        </div>
      </summary>

      <div className="mt-3 flex flex-col gap-3">
        {!metricsReady ? (
          <p className="text-xs text-slate-500">
            Pending inputs for: {missingInputs.join(", ")}.
          </p>
        ) : null}

        <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70">
          <div className="grid divide-y divide-slate-200/70 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="px-4 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    {kpi.label}
                  </p>
                  {backingByMetric[kpi.key] ? (
                    <BackingChip
                      status={backingByMetric[kpi.key]!}
                      size="compact"
                      onClick={
                        onMetricSupportClick ? () => onMetricSupportClick(kpi.key) : undefined
                      }
                    />
                  ) : null}
                </div>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  {kpi.value}
                </p>
                <p className="mt-1 text-xs text-slate-500">{kpi.helper}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
