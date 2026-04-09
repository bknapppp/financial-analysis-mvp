"use client";

import { formatCreditScenarioCurrency } from "@/lib/credit-scenario";
import { formatCurrency, formatPercent } from "@/lib/formatters";
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

function formatRatio(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return formatPercent(value * 100);
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

function ltvStatus(value: number | null): SnapshotStatus {
  if (value === null || !Number.isFinite(value)) {
    return "weak";
  }

  if (value <= 0.6) {
    return "strong";
  }

  if (value <= 0.8) {
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
  const addBackAmount = snapshot.acceptedAddBacks ?? 0;
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
      label: "Debt / EBITDA",
      value: formatMultiple(scenario.metrics.debtToEbitda.value),
      status: debtToEbitdaStatus(scenario.metrics.debtToEbitda.value),
      helper: "Loan amount / EBITDA"
    },
    {
      label: "LTV",
      value: formatRatio(scenario.metrics.ltv.value),
      status: ltvStatus(scenario.metrics.ltv.value),
      helper: "Loan amount / collateral value"
    }
  ];

  const creditSignals: string[] = [];

  if (dscrStatus(scenario.metrics.dscr.value) === "weak") {
    creditSignals.push("Insufficient cash flow coverage");
  }

  if (debtToEbitdaStatus(scenario.metrics.debtToEbitda.value) === "weak") {
    creditSignals.push("Elevated leverage vs typical thresholds");
  }

  if (missingInputs.length > 0) {
    creditSignals.push("Incomplete underwriting inputs");
  }

  const contextItems = [
    `Basis: ${ebitdaBasis === "adjusted" ? "Adjusted EBITDA" : "Computed EBITDA"}`,
    `Add-backs: ${formatCreditScenarioCurrency(addBackAmount)}`,
    missingInputs.length > 0 ? `Missing inputs: ${missingInputs.join(", ")}` : "Missing inputs: None"
  ];

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            Underwriting Snapshot
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">
            Deal viability at a glance
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Summarize earnings strength, coverage, leverage, and collateral support without changing core calculations.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            Selected Period
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{snapshot.label}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-6 md:grid-cols-2">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">{kpi.label}</p>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(
                  kpi.status
                )}`}
              >
                {statusLabel(kpi.status)}
              </span>
            </div>
            <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
              {kpi.value}
            </p>
            <p className="mt-1 text-xs text-slate-500">{kpi.helper}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            Credit Signals
          </p>
          <div className="mt-3 space-y-2">
            {creditSignals.length > 0 ? (
              creditSignals.map((signal) => (
                <div
                  key={signal}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  {signal}
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm text-slate-700">
                Coverage, leverage, and collateral signals are currently within target ranges.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            Data Context
          </p>
          <div className="mt-3 space-y-2">
            {contextItems.map((item) => (
              <div
                key={item}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              >
                {item}
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
