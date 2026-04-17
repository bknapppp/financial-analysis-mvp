"use client";

import { formatCreditScenarioCurrency } from "@/lib/credit-scenario";
import { formatCurrency } from "@/lib/formatters";
import type {
  CreditScenarioResult,
  PeriodSnapshot,
  UnderwritingEbitdaBasis
} from "@/lib/types";

type UnderwritingSnapshotPanelProps = {
  snapshot: PeriodSnapshot;
  scenario: CreditScenarioResult;
  ebitdaBasis: UnderwritingEbitdaBasis;
  missingInputs: string[];
};

type SnapshotStatus = "strong" | "moderate" | "weak";

type KpiConfig = {
  label: string;
  value: string;
  status: SnapshotStatus;
  helper: string;
};

function statusLabel(status: SnapshotStatus) {
  if (status === "strong") return "Strong";
  if (status === "moderate") return "Moderate";
  return "Weak";
}

function statusClass(status: SnapshotStatus) {
  if (status === "strong") {
    return "border-teal-200 bg-teal-50 text-teal-800";
  }

  if (status === "moderate") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-rose-200 bg-rose-50 text-rose-800";
}

function formatMultiple(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return `${value.toFixed(2)}x`;
}

function valuePresenceStatus(value: number | null | undefined): SnapshotStatus {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "weak";
  }

  if (value > 0) {
    return "strong";
  }

  if (value === 0) {
    return "moderate";
  }

  return "weak";
}

function dscrStatus(value: number | null): SnapshotStatus {
  if (value === null || !Number.isFinite(value)) {
    return "weak";
  }

  if (value >= 1.5) {
    return "strong";
  }

  if (value >= 1.25) {
    return "moderate";
  }

  return "weak";
}

function debtToEbitdaStatus(value: number | null): SnapshotStatus {
  if (value === null || !Number.isFinite(value)) {
    return "weak";
  }

  if (value <= 3) {
    return "strong";
  }

  if (value <= 5) {
    return "moderate";
  }

  return "weak";
}

export function UnderwritingSnapshotPanel({
  snapshot,
  scenario,
  ebitdaBasis,
  missingInputs
}: UnderwritingSnapshotPanelProps) {
  const selectedEbitda =
    ebitdaBasis === "adjusted" ? snapshot.adjustedEbitda : snapshot.ebitda;
  const kpis: KpiConfig[] = [
    {
      label: "Revenue",
      value: formatCurrency(snapshot.revenue),
      status: valuePresenceStatus(snapshot.revenue),
      helper: "Selected reporting period"
    },
    {
      label: "EBITDA",
      value: formatCreditScenarioCurrency(selectedEbitda ?? null),
      status: valuePresenceStatus(selectedEbitda),
      helper:
        ebitdaBasis === "adjusted"
          ? "Using adjusted underwriting basis"
          : "Using canonical computed basis"
    },
    {
      label: "Adjusted EBITDA",
      value: formatCreditScenarioCurrency(snapshot.adjustedEbitda ?? null),
      status: valuePresenceStatus(snapshot.adjustedEbitda),
      helper: "EBITDA plus accepted add-backs"
    },
    {
      label: "DSCR",
      value: formatMultiple(scenario.metrics.dscr.value),
      status: dscrStatus(scenario.metrics.dscr.value),
      helper: "EBITDA / annual debt service"
    },
    {
      label: "Leverage",
      value: formatMultiple(scenario.metrics.debtToEbitda.value),
      status: debtToEbitdaStatus(scenario.metrics.debtToEbitda.value),
      helper: "Loan amount / EBITDA"
    }
  ];
  const metricsReady = missingInputs.length === 0;

  return (
    <section className="rounded-[1.9rem] border border-slate-200 bg-white px-5 py-4 shadow-panel md:px-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
              Underwriting Snapshot
            </p>
            <p className="mt-1 text-sm text-slate-600 md:text-base">
              Compact underwriting snapshot for the selected period.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 text-sm text-slate-600">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700">
              {snapshot.label}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700">
              {ebitdaBasis === "adjusted" ? "Basis: Adjusted EBITDA" : "Basis: Computed EBITDA"}
            </span>
            <span
              className={`rounded-full px-3 py-1.5 font-medium ${
                metricsReady
                  ? "bg-teal-50 text-teal-700"
                  : "bg-amber-50 text-amber-800"
              }`}
            >
              {metricsReady
                ? "All core metrics ready"
                : `${missingInputs.length} input gap${missingInputs.length === 1 ? "" : "s"}`}
            </span>
          </div>
        </div>

        <div className="grid gap-x-5 gap-y-4 border-t border-slate-200 pt-4 md:grid-cols-2 xl:grid-cols-5">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  {kpi.label}
                </p>
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusClass(
                    kpi.status
                  )}`}
                >
                  {statusLabel(kpi.status)}
                </span>
              </div>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 xl:text-[2.2rem]">
                {kpi.value}
              </p>
              <p className="mt-1 text-xs text-slate-500">{kpi.helper}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
