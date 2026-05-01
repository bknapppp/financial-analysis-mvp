"use client";

import { useMemo } from "react";
import {
  parseCreditScenarioInputValues,
  type CreditScenarioInputValues
} from "@/components/credit-scenario-panel";
import { buildCreditScenario, formatCreditScenarioCurrency } from "@/lib/credit-scenario";
import { formatCurrency } from "@/lib/formatters";
import { buildEbitdaChain } from "@/lib/underwriting/ebitda";
import type {
  UnderwritingScenario,
  UnderwritingScenarioKey,
  UnderwritingScenarioState
} from "@/lib/types";

type ProFormaPanelProps = {
  canonicalEbitda: number | null;
  reportedEbitda: number | null;
  workbenchInputValues: CreditScenarioInputValues;
  acceptedAddBackTotal: number;
  scenarioState: UnderwritingScenarioState;
  onScenarioStateChange: (value: UnderwritingScenarioState) => void;
  ebitdaContextMessage?: string | null;
};

type ProFormaMetricKey = "dscr" | "debtToEbitda" | "interestCoverage";

const SCENARIO_LABELS: Record<UnderwritingScenarioKey, string> = {
  base: "Base",
  upside: "Upside",
  downside: "Downside"
};

function formatMultiple(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Pending inputs";
  }

  return `${value.toFixed(2)}x`;
}

function formatDeltaCurrency(value: number) {
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";

  return `${prefix}${formatCreditScenarioCurrency(Math.abs(value))}`;
}

function buildUnsupportedReason(params: {
  metric: ProFormaMetricKey;
  proFormaEbitda: number | null;
  debt: number | null;
  interestRate: number | null;
  interestExpense: number | null;
  amortization: number | null;
}) {
  const { metric, proFormaEbitda, debt, interestRate, interestExpense, amortization } = params;

  if (proFormaEbitda === null) {
    return "Adjusted EBITDA from adjustments is unavailable.";
  }

  if (proFormaEbitda <= 0) {
    return "Pro forma EBITDA must be positive.";
  }

  if (debt === null) {
    return "Debt / loan amount is missing in the selected scenario or Workbench fallback.";
  }

  if (metric === "debtToEbitda") {
    return "Debt / EBITDA requires debt and positive pro forma EBITDA.";
  }

  if (interestRate === null) {
    return metric === "dscr"
      ? "DSCR requires interest rate from the selected scenario or Workbench fallback."
      : "Interest coverage requires interest rate from the selected scenario or Workbench fallback.";
  }

  if (metric === "interestCoverage") {
    if (interestExpense === null || interestExpense <= 0) {
      return "Interest coverage requires positive interest expense.";
    }

    return "Interest coverage could not be computed.";
  }

  if (amortization === null) {
    return "DSCR requires amortization from the underwriting workbench.";
  }

  return "Debt service could not be computed.";
}

function ScheduleRow(props: {
  label: string;
  value: string;
  prefix?: "+" | "=";
  emphasized?: boolean;
  subtle?: boolean;
}) {
  const { label, value, prefix, emphasized = false, subtle = false } = props;

  return (
    <div
      className={`grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-slate-200/70 py-1.5 ${
        emphasized ? "text-slate-950" : subtle ? "text-slate-600" : "text-slate-800"
      }`}
    >
      <span className="text-xs font-semibold tabular-nums text-slate-400">{prefix ?? ""}</span>
      <span className={`${emphasized ? "text-sm font-semibold" : "text-sm"}`}>{label}</span>
      <span
        className={`text-right tabular-nums ${
          emphasized ? "text-lg font-semibold tracking-tight" : "text-sm font-medium"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function ModelRow(props: {
  label: string;
  value: string;
  helper?: string;
  muted?: boolean;
  emphasized?: boolean;
}) {
  const { label, value, helper, muted = false, emphasized = false } = props;

  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-200/70 py-2.5 last:border-b-0">
      <span>
        <span
          className={`block text-sm ${
            emphasized ? "font-semibold text-slate-900" : muted ? "text-slate-500" : "text-slate-700"
          }`}
        >
          {label}
        </span>
        {helper ? <span className="mt-0.5 block text-xs text-slate-500">{helper}</span> : null}
      </span>
      <span
        className={`tabular-nums ${
          emphasized
            ? "text-base font-semibold text-slate-950"
            : muted
              ? "text-sm font-medium text-slate-600"
              : "text-sm font-medium text-slate-950"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function AssumptionReadOnly(props: {
  label: string;
  value: string;
  suffix?: string;
  helper?: string;
}) {
  const { label, value, suffix, helper } = props;

  return (
    <div className="grid gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>
      <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100 px-3 py-2">
        <span className="w-full text-right text-sm font-medium tabular-nums text-slate-700">
          {value}
        </span>
        {suffix ? <span className="ml-2 text-sm text-slate-500">{suffix}</span> : null}
      </div>
      {helper ? <span className="text-xs text-slate-500">{helper}</span> : null}
    </div>
  );
}

function AssumptionField(props: {
  label: string;
  value: string;
  placeholder: string;
  suffix?: string;
  helper?: string;
  emphasized?: boolean;
  onChange: (value: string) => void;
}) {
  const { label, value, placeholder, suffix, helper, emphasized = false, onChange } = props;

  return (
    <label className="grid gap-1.5">
      <span
        className={`text-[11px] uppercase tracking-[0.14em] ${
          emphasized ? "font-semibold text-slate-700" : "font-medium text-slate-500"
        }`}
      >
        {label}
      </span>
      <div
        className={`flex items-center rounded-xl bg-white px-3 ${
          emphasized
            ? "border border-slate-300 py-3 shadow-sm"
            : "border border-slate-200 py-2"
        }`}
      >
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          placeholder={placeholder}
          className={`w-full bg-transparent text-right tabular-nums text-slate-950 outline-none placeholder:text-slate-400 ${
            emphasized ? "text-base font-semibold" : "text-sm font-medium"
          }`}
        />
        {suffix ? <span className="ml-2 text-sm text-slate-500">{suffix}</span> : null}
      </div>
      {helper ? <span className="text-xs text-slate-500">{helper}</span> : null}
    </label>
  );
}

export function ProFormaPanel({
  canonicalEbitda,
  reportedEbitda,
  workbenchInputValues,
  acceptedAddBackTotal,
  scenarioState,
  onScenarioStateChange,
  ebitdaContextMessage = null
}: ProFormaPanelProps) {
  const isDevelopment = process.env.NODE_ENV !== "production";
  const parsedInputs = useMemo(
    () => parseCreditScenarioInputValues(workbenchInputValues),
    [workbenchInputValues]
  );
  const selectedScenario = scenarioState.scenarios[scenarioState.selected];
  const selectedScenarioCanOverrideStructure = scenarioState.selected !== "base";
  const selectedScenarioUplift = scenarioState.selected === "base" ? 0 : selectedScenario.uplift;
  const hasCanonicalEbitda = canonicalEbitda !== null;
  const ebitdaChain = buildEbitdaChain({
    canonicalEbitda,
    acceptedAddbacks: acceptedAddBackTotal,
    uplift: selectedScenarioUplift
  });
  const reportedEbitdaDisplayValue = reportedEbitda ?? canonicalEbitda;
  const acceptedAddBacks = ebitdaChain.acceptedAddbacks;
  const adjustedEbitda = ebitdaChain.adjustedEbitda;
  const proFormaEbitda = ebitdaChain.proFormaEbitda;
  const workbenchDebt = parsedInputs.loanAmount;
  const workbenchInterestRate = parsedInputs.annualInterestRatePercent;
  const scenarioDebtOverride = selectedScenarioCanOverrideStructure ? selectedScenario.debt : null;
  const scenarioInterestRateOverride = selectedScenarioCanOverrideStructure
    ? selectedScenario.interestRate
    : null;
  const effectiveDebt = scenarioDebtOverride ?? workbenchDebt;
  const effectiveInterestRate = scenarioInterestRateOverride ?? workbenchInterestRate;
  const debtSource = scenarioDebtOverride !== null ? "Scenario override" : "From Workbench";
  const interestRateSource =
    scenarioInterestRateOverride !== null ? "Scenario override" : "From Workbench";
  const debtOverrideHelper =
    scenarioDebtOverride === null
      ? `Using Workbench default${workbenchDebt !== null ? ` (${formatCreditScenarioCurrency(workbenchDebt)})` : ""}.`
      : "Scenario override.";
  const interestRateOverrideHelper =
    scenarioInterestRateOverride === null
      ? `Using Workbench default${workbenchInterestRate !== null ? ` (${workbenchInterestRate.toFixed(2)}%)` : ""}.`
      : "Scenario override.";
  const effectiveInputs = {
    ...parsedInputs,
    loanAmount: effectiveDebt,
    annualInterestRatePercent: effectiveInterestRate
  };
  const adjustedEbitdaDisplay = adjustedEbitda !== null
    ? formatCreditScenarioCurrency(adjustedEbitda)
    : "Pending inputs";
  const proFormaEbitdaDisplay = proFormaEbitda !== null
    ? formatCreditScenarioCurrency(proFormaEbitda)
    : "Pending inputs";
  const baseProFormaEbitda = useMemo(
    () =>
      buildEbitdaChain({
        canonicalEbitda,
        acceptedAddbacks: acceptedAddBackTotal,
        uplift: 0
      }).proFormaEbitda,
    [acceptedAddBackTotal, canonicalEbitda]
  );
  const impactVsBase =
    scenarioState.selected !== "base" &&
    proFormaEbitda !== null &&
    baseProFormaEbitda !== null
      ? proFormaEbitda - baseProFormaEbitda
      : null;
  const heroMetricDisplay = proFormaEbitdaDisplay;
  const heroSupportNote =
    proFormaEbitda !== null
      ? ebitdaContextMessage ?? "Adjusted EBITDA plus scenario uplift."
      : hasCanonicalEbitda
        ? "Based on partial financial support."
        : "Canonical EBITDA is not available.";
  const proFormaScenario = useMemo(
    () =>
      buildCreditScenario({
        inputs: effectiveInputs,
        ebitda: proFormaEbitda
      }),
    [effectiveInputs, proFormaEbitda]
  );

  const purchasePrice = parsedInputs.collateralValue;
  const debt = effectiveDebt;
  const equity =
    purchasePrice !== null && debt !== null ? purchasePrice - debt : null;
  const interestRate = effectiveInterestRate;
  const amortization = parsedInputs.amortizationYears;
  const comparisonItems = useMemo(
    () => {
      const baseValue = buildEbitdaChain({
        canonicalEbitda,
        acceptedAddbacks: acceptedAddBackTotal,
        uplift: 0
      }).proFormaEbitda;

      return (Object.keys(SCENARIO_LABELS) as UnderwritingScenarioKey[]).map((key) => {
        const scenario = scenarioState.scenarios[key];
        const scenarioProForma = buildEbitdaChain({
          canonicalEbitda,
          acceptedAddbacks: acceptedAddBackTotal,
          uplift: key === "base" ? 0 : scenario.uplift
        }).proFormaEbitda;
        const scenarioDebt = key === "base" ? parsedInputs.loanAmount : scenario.debt ?? parsedInputs.loanAmount;
        const scenarioInterestRate =
          key === "base"
            ? parsedInputs.annualInterestRatePercent
            : scenario.interestRate ?? parsedInputs.annualInterestRatePercent;
        const scenarioCredit = buildCreditScenario({
          inputs: {
            ...parsedInputs,
            loanAmount: scenarioDebt,
            annualInterestRatePercent: scenarioInterestRate
          },
          ebitda: scenarioProForma
        });

        return {
          key,
          label: SCENARIO_LABELS[key],
          value:
            scenarioProForma === null
              ? "Pending inputs"
              : formatCreditScenarioCurrency(scenarioProForma),
          dscrValue:
            scenarioCredit.metrics.dscr.value === null
              ? "DSCR pending"
              : formatMultiple(scenarioCredit.metrics.dscr.value),
          debtToEbitdaValue:
            scenarioCredit.metrics.debtToEbitda.value === null
              ? null
              : formatMultiple(scenarioCredit.metrics.debtToEbitda.value),
          delta:
            key === "base" || scenarioProForma === null || baseValue === null
              ? null
              : scenarioProForma - baseValue
        };
      });
    },
    [acceptedAddBackTotal, canonicalEbitda, parsedInputs, scenarioState.scenarios]
  );

  function updateSelectedScenario(
    updater: (scenario: UnderwritingScenario) => UnderwritingScenario
  ) {
    onScenarioStateChange({
      ...scenarioState,
      scenarios: {
        ...scenarioState.scenarios,
        [scenarioState.selected]: updater(selectedScenario)
      }
    });
  }

  function parseNullableInputValue(value: string) {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed.replace(/,/g, ""));

    return Number.isFinite(parsed) ? parsed : null;
  }

  function scenarioFieldValue(value: number | null) {
    if (value !== null) {
      return String(value);
    }

    return "";
  }

  const outputRows = [
    {
      label: "DSCR",
      value:
        proFormaScenario.metrics.dscr.value === null
          ? "Pending inputs"
          : formatMultiple(proFormaScenario.metrics.dscr.value),
      reason:
        proFormaScenario.metrics.dscr.value === null
          ? buildUnsupportedReason({
              metric: "dscr",
              proFormaEbitda,
              debt,
              interestRate,
              interestExpense: proFormaScenario.annualInterestExpense,
              amortization
            })
          : undefined
    },
    {
      label: "Debt / EBITDA",
      value:
        proFormaScenario.metrics.debtToEbitda.value === null
          ? "Pending inputs"
          : formatMultiple(proFormaScenario.metrics.debtToEbitda.value),
      reason:
        proFormaScenario.metrics.debtToEbitda.value === null
          ? buildUnsupportedReason({
              metric: "debtToEbitda",
              proFormaEbitda,
              debt,
              interestRate,
              interestExpense: proFormaScenario.annualInterestExpense,
              amortization
            })
          : undefined
    },
    {
      label: "Interest Coverage",
      value:
        proFormaScenario.metrics.interestCoverage.value === null
          ? "Pending inputs"
          : formatMultiple(proFormaScenario.metrics.interestCoverage.value),
      reason:
        proFormaScenario.metrics.interestCoverage.value === null
          ? buildUnsupportedReason({
              metric: "interestCoverage",
              proFormaEbitda,
              debt,
              interestRate,
              interestExpense: proFormaScenario.annualInterestExpense,
              amortization
            })
          : undefined
    }
  ];
  const unsupportedReason = outputRows.find((row) => row.reason)?.reason ?? null;

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
          Pro Forma Model
        </p>
        <h2 className="text-lg font-semibold text-slate-900">Pro Forma Model</h2>
        <p className="text-sm text-slate-500">
          View modeled outcome
        </p>
        <p className="text-sm text-slate-500">
          Reconciled underwriting flow across reported earnings, accepted add-backs, shared structure inputs, and pro forma credit outputs.
        </p>
      </div>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SCENARIO_LABELS) as UnderwritingScenarioKey[]).map((key) => {
            const isSelected = key === scenarioState.selected;
            const baseClasses =
              key === "base"
                ? isSelected
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                : key === "upside"
                  ? isSelected
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300"
                  : isSelected
                    ? "border-rose-700 bg-rose-700 text-white"
                    : "border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-300";

            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  onScenarioStateChange({
                    ...scenarioState,
                    selected: key
                  })
                }
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${baseClasses}`}
              >
                {SCENARIO_LABELS[key]}
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {comparisonItems.map((item) => (
            <div
              key={item.key}
              className={`rounded-xl border px-3 py-2 ${
                item.key === scenarioState.selected
                  ? "border-slate-300 bg-white"
                  : "border-slate-200/80 bg-slate-100/70"
              }`}
            >
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                {item.label}
              </p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-slate-950">
                EBITDA {item.value}
              </p>
              <p className="mt-1 text-xs font-medium tabular-nums text-slate-700">
                {item.dscrValue}
              </p>
              {item.debtToEbitdaValue !== null ? (
                <p className="mt-0.5 text-xs font-medium tabular-nums text-slate-700">
                  Debt/EBITDA {item.debtToEbitdaValue}
                </p>
              ) : null}
              {item.delta !== null ? (
                <p
                  className={`mt-0.5 text-xs font-medium tabular-nums ${
                    item.delta > 0
                      ? "text-emerald-700"
                      : item.delta < 0
                        ? "text-rose-700"
                        : "text-slate-500"
                  }`}
                >
                  ({formatDeltaCurrency(item.delta)} vs Base)
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs text-slate-500">
            Scenario assumptions override base underwriting inputs
          </p>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            Scenario Assumptions
          </p>
          <p className="text-sm text-slate-600">
            {scenarioState.selected === "base"
              ? "Base uses Workbench debt, rate, and amortization directly."
              : `${SCENARIO_LABELS[scenarioState.selected]} can model EBITDA uplift and optional debt or rate overrides.`}
          </p>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {selectedScenarioCanOverrideStructure ? (
            <>
              <AssumptionField
                label="EBITDA Uplift"
                value={String(selectedScenario.uplift)}
                placeholder="0"
                emphasized
                onChange={(value) =>
                  updateSelectedScenario((scenario) => ({
                    ...scenario,
                    uplift: parseNullableInputValue(value) ?? 0
                  }))
                }
                helper="Primary scenario lever. Applied after adjusted EBITDA."
              />
              <AssumptionField
                label="Override Debt"
                value={scenarioFieldValue(selectedScenario.debt)}
                placeholder={
                  parsedInputs.loanAmount !== null
                    ? formatCreditScenarioCurrency(parsedInputs.loanAmount)
                    : "Workbench"
                }
                onChange={(value) =>
                  updateSelectedScenario((scenario) => ({
                    ...scenario,
                    debt: parseNullableInputValue(value)
                  }))
                }
                helper={debtOverrideHelper}
              />
              <AssumptionField
                label="Override Interest Rate"
                value={scenarioFieldValue(selectedScenario.interestRate)}
                placeholder={parsedInputs.annualInterestRatePercent?.toFixed(2) ?? "Workbench"}
                suffix="%"
                onChange={(value) =>
                  updateSelectedScenario((scenario) => ({
                    ...scenario,
                    interestRate: parseNullableInputValue(value)
                  }))
                }
                helper={interestRateOverrideHelper}
              />
            </>
          ) : (
            <>
              <AssumptionReadOnly
                label="Debt"
                value={formatCreditScenarioCurrency(parsedInputs.loanAmount)}
                helper="(from Workbench)"
              />
              <AssumptionReadOnly
                label="Interest Rate"
                value={
                  parsedInputs.annualInterestRatePercent === null
                    ? "Pending inputs"
                    : parsedInputs.annualInterestRatePercent.toFixed(2)
                }
                suffix={parsedInputs.annualInterestRatePercent === null ? undefined : "%"}
                helper="(from Workbench)"
              />
              <AssumptionReadOnly
                label="Amortization"
                value={
                  parsedInputs.amortizationYears === null
                    ? "Pending inputs"
                    : parsedInputs.amortizationYears.toFixed(1)
                }
                suffix={parsedInputs.amortizationYears === null ? undefined : "yrs"}
                helper="(from Workbench)"
              />
            </>
          )}
        </div>
      </section>

      <section className="mt-2 rounded-2xl border border-slate-200 bg-slate-950 px-5 py-4 text-white">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-300">
          Pro Forma EBITDA
        </p>
        <p className="mt-2 text-4xl font-semibold tracking-tight">
          {heroMetricDisplay}
        </p>
        {impactVsBase !== null ? (
          <p
            className={`mt-2 text-sm font-medium tabular-nums ${
              impactVsBase > 0
                ? "text-emerald-300"
                : impactVsBase < 0
                  ? "text-rose-300"
                  : "text-slate-300"
            }`}
          >
            {formatDeltaCurrency(impactVsBase)} vs Base
          </p>
        ) : null}
        <p className="mt-2 text-sm text-slate-300">{heroSupportNote}</p>
      </section>

      <section className="mt-3 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            Earnings Reconciliation
          </p>
          <p className="text-sm text-slate-600">
            Accepted add-backs from Required Adjustments roll directly into adjusted and pro forma EBITDA.
          </p>
        </div>

        <div className="mt-3 rounded-2xl border border-slate-200/70 bg-white px-4">
          <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] gap-3 border-b border-slate-200/70 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
            <span />
            <span>Line Item</span>
            <span className="text-right">Amount</span>
          </div>

          <ScheduleRow
            label="Reported EBITDA"
            value={
              reportedEbitdaDisplayValue !== null
                ? formatCreditScenarioCurrency(reportedEbitdaDisplayValue)
                : "Pending inputs"
            }
            subtle
          />
          <ScheduleRow
            label="Accepted add-backs"
            value={formatCurrency(acceptedAddBacks)}
            prefix="+"
          />
          <ScheduleRow
            label="Adjusted EBITDA from adjustments"
            value={adjustedEbitdaDisplay}
            prefix="="
          />
          <ScheduleRow
            label="Pro Forma Uplift"
            value={formatCurrency(selectedScenarioUplift)}
            prefix="+"
          />
          <ScheduleRow
            label="Pro Forma EBITDA"
            value={proFormaEbitdaDisplay}
            prefix="="
            emphasized
          />
        </div>
      </section>

      <details
        className="mt-3 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4"
        open={unsupportedReason === null}
      >
        <summary className="flex cursor-pointer list-none flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            Capital Structure + Credit Outputs
          </p>
          <p className="text-sm text-slate-600">
            Credit outputs based on pro forma EBITDA and mirrored underwriting workbench inputs.
          </p>
        </summary>

        <div className="mt-3 rounded-2xl border border-slate-200/70 bg-white px-4 py-3">
          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                Capital Structure
              </p>
              <div className="mt-3">
                <ModelRow label="Purchase Price" value={formatCreditScenarioCurrency(purchasePrice)} />
                <ModelRow
                  label="Debt"
                  value={formatCreditScenarioCurrency(debt)}
                  helper={debtSource}
                />
                <ModelRow
                  label="Equity"
                  value={
                    purchasePrice !== null && debt !== null
                      ? formatCreditScenarioCurrency(equity)
                      : "Pending inputs"
                  }
                  muted={purchasePrice === null || debt === null}
                />
                <ModelRow
                  label="Interest Rate"
                  value={interestRate === null ? "Pending inputs" : `${interestRate.toFixed(2)}%`}
                  helper={interestRateSource}
                  muted={interestRate === null}
                />
                <ModelRow
                  label="Amortization"
                  value={amortization === null ? "Pending inputs" : `${amortization.toFixed(1)} yrs`}
                  helper="From Workbench"
                  muted={amortization === null}
                />
              </div>
              <p className="mt-3 border-t border-slate-200/70 pt-3 text-xs text-slate-500">
                Debt and interest rate can be scenario-specific. Purchase price and amortization continue to mirror Workbench in V1.
              </p>
            </section>

            <section className="border-t border-slate-200/70 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                Credit Outputs
              </p>
              <div className="mt-3">
                {outputRows.map((row) => (
                  <ModelRow
                    key={row.label}
                    label={row.label}
                    value={row.value}
                    muted={row.value === "Pending inputs"}
                  />
                ))}
                <ModelRow
                  label="Pro Forma EBITDA"
                  value={proFormaEbitdaDisplay}
                  muted={proFormaEbitda === null}
                  emphasized
                />
              </div>

              {unsupportedReason ? (
                <p className="mt-3 border-t border-slate-200/70 pt-3 text-xs text-slate-500">
                  Some outputs are pending until all required workbench inputs are available. {unsupportedReason}
                </p>
              ) : (
                <p className="mt-3 border-t border-slate-200/70 pt-3 text-xs text-slate-500">
                  Credit outputs based on pro forma EBITDA.
                </p>
              )}
            </section>
          </div>
        </div>
      </details>

      {isDevelopment ? (
        <section className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-700">
          <p className="font-medium uppercase tracking-[0.12em] text-slate-500">
            Assumption Debug
          </p>
          <div className="mt-2 grid gap-1 md:grid-cols-2">
            <p>workbenchDebt: {formatCreditScenarioCurrency(workbenchDebt)}</p>
            <p>scenarioDebtOverride: {formatCreditScenarioCurrency(scenarioDebtOverride)}</p>
            <p>effectiveDebt: {formatCreditScenarioCurrency(effectiveDebt)}</p>
            <p>
              workbenchInterestRate:{" "}
              {workbenchInterestRate === null ? "null" : `${workbenchInterestRate.toFixed(2)}%`}
            </p>
            <p>
              scenarioInterestRateOverride:{" "}
              {scenarioInterestRateOverride === null
                ? "null"
                : `${scenarioInterestRateOverride.toFixed(2)}%`}
            </p>
            <p>
              effectiveInterestRate:{" "}
              {effectiveInterestRate === null ? "null" : `${effectiveInterestRate.toFixed(2)}%`}
            </p>
            <p>selectedScenario: {scenarioState.selected}</p>
          </div>
        </section>
      ) : null}
    </section>
  );
}
