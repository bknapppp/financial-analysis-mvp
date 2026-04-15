"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { focusFixItTarget } from "@/components/fix-it-focus";
import { formatCreditScenarioCurrency } from "@/lib/credit-scenario";
import { UNDERWRITING_WORKBENCH_SECTION_ID } from "@/lib/fix-it";
import type {
  CreditScenarioInputs,
  CreditScenarioResult,
  CreditScenarioMetric,
  PeriodSnapshot,
  UnderwritingEbitdaBasis
} from "@/lib/types";

type CreditScenarioPanelProps = {
  snapshot: PeriodSnapshot;
  inputValues: CreditScenarioInputValues;
  onInputValuesChange: (values: CreditScenarioInputValues) => void;
  ebitdaBasis: UnderwritingEbitdaBasis;
  onEbitdaBasisChange: (basis: UnderwritingEbitdaBasis) => void;
  scenario: CreditScenarioResult;
  missingInputs: string[];
};

export type InputFieldKey = keyof CreditScenarioInputs;
export type CreditScenarioInputValues = Record<InputFieldKey, string>;

export const DEFAULT_CREDIT_SCENARIO_INPUT_VALUES: CreditScenarioInputValues = {
  loanAmount: "",
  annualInterestRatePercent: "",
  loanTermYears: "",
  amortizationYears: "",
  collateralValue: ""
};

const FIELD_CONFIG: Array<{
  key: InputFieldKey;
  label: string;
  placeholder: string;
  suffix?: string;
}> = [
  { key: "loanAmount", label: "Loan Amount", placeholder: "0" },
  {
    key: "annualInterestRatePercent",
    label: "Annual Interest Rate",
    placeholder: "0.00",
    suffix: "%"
  },
  { key: "loanTermYears", label: "Loan Term", placeholder: "0", suffix: "yrs" },
  {
    key: "amortizationYears",
    label: "Amortization",
    placeholder: "0",
    suffix: "yrs"
  },
  {
    key: "collateralValue",
    label: "Purchase Price / Collateral Value",
    placeholder: "0"
  }
];

function parseNullableNumber(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed.replace(/,/g, ""));

  return Number.isFinite(parsed) ? parsed : null;
}

function statusClass(metric: CreditScenarioMetric) {
  if (metric.status === "strong") {
    return "border-teal-200 bg-teal-50 text-teal-800";
  }

  if (metric.status === "moderate") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (metric.status === "weak") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function metricValueDisplay(metric: CreditScenarioMetric) {
  return metric.status === "insufficient" ? "—" : metric.display;
}

function metricDescription(metric: CreditScenarioMetric) {
  return metric.status === "insufficient"
    ? "Awaiting required inputs"
    : metric.description;
}

function buildReasonText(metric: "DSCR" | "Leverage" | "LTV", missingInputs: string[]) {
  if (metric === "DSCR") {
    return missingInputs.length > 0
      ? `Requires ${missingInputs.join(", ").toLowerCase()}.`
      : "Debt service inputs are incomplete.";
  }

  if (metric === "Leverage") {
    return missingInputs.length > 0
      ? "Requires debt sizing inputs and a usable EBITDA basis."
      : "Debt sizing or EBITDA support is incomplete.";
  }

  return missingInputs.includes("Purchase price / collateral support")
    ? "Requires purchase price or collateral support."
    : "Collateral support is incomplete.";
}

export function parseCreditScenarioInputValues(
  inputValues: CreditScenarioInputValues
): CreditScenarioInputs {
  return {
    loanAmount: parseNullableNumber(inputValues.loanAmount),
    annualInterestRatePercent: parseNullableNumber(inputValues.annualInterestRatePercent),
    loanTermYears: parseNullableNumber(inputValues.loanTermYears),
    amortizationYears: parseNullableNumber(inputValues.amortizationYears),
    collateralValue: parseNullableNumber(inputValues.collateralValue)
  };
}

export function CreditScenarioPanel({
  snapshot,
  inputValues,
  onInputValuesChange,
  ebitdaBasis,
  onEbitdaBasisChange,
  scenario,
  missingInputs
}: CreditScenarioPanelProps) {
  const selectedEbitda =
    ebitdaBasis === "adjusted" ? snapshot.adjustedEbitda : snapshot.ebitda;
  const parsedInputs = useMemo<CreditScenarioInputs>(
    () => ({
      ...parseCreditScenarioInputValues(inputValues)
    }),
    [inputValues]
  );

  const metrics = [
    scenario.metrics.dscr,
    scenario.metrics.debtToEbitda,
    scenario.metrics.interestCoverage,
    scenario.metrics.ltv
  ];
  const hasAnyAssumption = Object.values(inputValues).some((value) => value.trim().length > 0);
  const hasDebtServiceOutputs =
    scenario.annualInterestExpense !== null ||
    scenario.annualPrincipalPayment !== null ||
    scenario.annualDebtService !== null;
  const hasRatioOutputs = metrics.some((metric) => metric.status !== "insufficient");
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
  const maturityBalanceDisplay = scenario.balanceAtMaturity === null
    ? "—"
    : formatCreditScenarioCurrency(scenario.balanceAtMaturity);
  const searchParams = useSearchParams();
  const requestedFixSection = searchParams.get("fixSection");
  const requestedFixField = searchParams.get("fixField");

  useEffect(() => {
    if (requestedFixSection !== UNDERWRITING_WORKBENCH_SECTION_ID) {
      return;
    }

    const timer = window.setTimeout(() => {
      focusFixItTarget(requestedFixSection, requestedFixField);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [requestedFixField, requestedFixSection]);

  return (
    <section
      id={UNDERWRITING_WORKBENCH_SECTION_ID}
      data-fix-section={UNDERWRITING_WORKBENCH_SECTION_ID}
      className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            Income Statement Analysis
          </p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">
            Underwriting Workbench
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Size a financing case directly against the selected period&apos;s earnings base.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              EBITDA Basis
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {formatCreditScenarioCurrency(selectedEbitda)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {ebitdaBasis === "adjusted"
                ? "Adjusted earnings base"
                : "Canonical computed EBITDA"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              EBIT Reference
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {formatCreditScenarioCurrency(snapshot.ebit ?? null)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Operating earnings reference
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                Assumptions
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Enter debt sizing, pricing, and amortization assumptions for the current case.
              </p>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
              Local scenario
            </span>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-sm font-medium text-slate-900">Use EBITDA</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-3 py-3">
                <input
                  type="radio"
                  name="underwriting-ebitda-basis"
                  checked={ebitdaBasis === "computed"}
                  onChange={() => onEbitdaBasisChange("computed")}
                  className="mt-1 h-4 w-4 border-slate-300 text-slate-900 focus:ring-slate-400"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">Computed</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {formatCreditScenarioCurrency(snapshot.ebitda)}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-3 py-3">
                <input
                  type="radio"
                  name="underwriting-ebitda-basis"
                  checked={ebitdaBasis === "adjusted"}
                  onChange={() => onEbitdaBasisChange("adjusted")}
                  className="mt-1 h-4 w-4 border-slate-300 text-slate-900 focus:ring-slate-400"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">Adjusted</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {formatCreditScenarioCurrency(snapshot.adjustedEbitda)}
                  </span>
                </span>
              </label>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Approved add-backs: {formatCreditScenarioCurrency(snapshot.acceptedAddBacks)}
            </p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {FIELD_CONFIG.map((field) => (
              <label key={field.key} className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  {field.label}
                </span>
                <div className="relative">
                  <input
                    id={`underwriting-${field.key}`}
                    data-fix-field={`underwriting-${field.key}`}
                    inputMode="decimal"
                    value={inputValues[field.key]}
                    onChange={(event) =>
                      onInputValuesChange({
                        ...inputValues,
                        [field.key]: event.target.value
                      })
                    }
                    placeholder={field.placeholder}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-slate-400"
                  />
                  {field.suffix ? (
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium uppercase tracking-[0.08em] text-slate-400">
                      {field.suffix}
                    </span>
                  ) : null}
                </div>
              </label>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Annual debt service uses a standard amortizing payment formula based on the stated interest rate and amortization period.
          </p>
        </section>

        <div className="space-y-4">
          {!hasAnyAssumption ? (
            <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-sm font-medium text-slate-900">
                Enter financing assumptions to evaluate debt service capacity and leverage.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Once loan amount, rate, term, amortization, and collateral value are entered, the workbench will calculate annual debt service, coverage, leverage, and LTV against the selected EBITDA basis.
              </p>
            </section>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Debt Service Summary
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  First-year scheduled debt burden based on the stated financing structure.
                </p>
              </div>
              {hasDebtServiceOutputs ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  Formula-driven
                </span>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <MetricTile
                label="Annual Interest"
                value={formatCreditScenarioCurrency(scenario.annualInterestExpense)}
                helper="First-year cash interest"
                muted={!hasDebtServiceOutputs}
              />
              <MetricTile
                label="Annual Principal"
                value={formatCreditScenarioCurrency(scenario.annualPrincipalPayment)}
                helper="Scheduled amortization"
                muted={!hasDebtServiceOutputs}
              />
              <MetricTile
                label="Annual Debt Service"
                value={formatCreditScenarioCurrency(scenario.annualDebtService)}
                helper="Interest + principal"
                muted={!hasDebtServiceOutputs}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Key Credit Ratios
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Coverage, leverage, and collateral metrics sized off the selected EBITDA basis.
                </p>
              </div>
              {hasRatioOutputs ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  Strong / Moderate / Weak
                </span>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{metric.label}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {metricDescription(metric)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(
                        metric
                      )}`}
                    >
                      {metric.statusLabel}
                    </span>
                  </div>
                  <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
                    {metricValueDisplay(metric)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Maturity Profile
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {scenario.canComputeDebtService
                    ? "Balance at stated term highlights residual principal if amortization extends beyond maturity."
                    : "Term and amortization inputs will size any remaining balance at maturity."}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Balance at Maturity
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {maturityBalanceDisplay}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Structure Readiness
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Keep financing outputs in the same workflow as the inputs that unlock them.
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  blockedItems.length === 0
                    ? "bg-teal-100 text-teal-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {blockedItems.length === 0
                  ? "All core metrics ready"
                  : `${blockedItems.length} blocked`}
              </span>
            </div>

            {blockedItems.length > 0 ? (
              <div className="mt-4 space-y-2">
                {blockedItems.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl bg-white px-3 py-3"
                  >
                    <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {buildReasonText(item.label, missingInputs)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-white px-3 py-3">
                <p className="text-sm font-medium text-slate-900">
                  All core structure metrics are currently computable from the entered inputs.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}

function MetricTile({
  label,
  value,
  helper,
  muted = false
}: {
  label: string;
  value: string;
  helper: string;
  muted?: boolean;
}) {
  const displayValue = muted && value === "Insufficient data" ? "—" : value;

  return (
    <div
      className={`rounded-2xl border p-4 ${
        muted ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
        {displayValue}
      </p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </div>
  );
}
