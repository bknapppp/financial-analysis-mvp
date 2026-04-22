import { formatCurrency, formatPercent } from "./formatters.ts";
import type {
  CreditScenarioInputs,
  CreditScenarioMetric,
  CreditScenarioMetricStatus,
  CreditScenarioResult
} from "./types.ts";

function isPositiveNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0;
}

function formatMultiple(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Unsupported";
  }

  return `${value.toFixed(2)}x`;
}

function formatOptionalCurrency(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Unsupported";
  }

  return formatCurrency(value);
}

function formatRatioPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Unsupported";
  }

  return formatPercent(value * 100);
}

function statusLabel(status: CreditScenarioMetricStatus) {
  if (status === "strong") return "Strong";
  if (status === "moderate") return "Moderate";
  if (status === "weak") return "Weak";
  return "Insufficient data";
}

function buildMetric(params: {
  label: string;
  value: number | null;
  display: string;
  description: string;
  status: CreditScenarioMetricStatus;
}): CreditScenarioMetric {
  return {
    ...params,
    statusLabel: statusLabel(params.status)
  };
}

function evaluateDscr(value: number | null) {
  if (value === null) return "insufficient" as const;
  if (value > 1.5) return "strong" as const;
  if (value >= 1.2) return "moderate" as const;
  return "weak" as const;
}

function evaluateDebtToEbitda(value: number | null) {
  if (value === null) return "insufficient" as const;
  if (value < 3) return "strong" as const;
  if (value <= 4.5) return "moderate" as const;
  return "weak" as const;
}

function evaluateInterestCoverage(value: number | null) {
  if (value === null) return "insufficient" as const;
  if (value > 3) return "strong" as const;
  if (value >= 1.5) return "moderate" as const;
  return "weak" as const;
}

function evaluateLtv(value: number | null) {
  if (value === null) return "insufficient" as const;
  if (value < 0.7) return "strong" as const;
  if (value <= 0.85) return "moderate" as const;
  return "weak" as const;
}

function calculateAnnualPayment(params: {
  loanAmount: number;
  annualRateDecimal: number;
  amortizationYears: number;
}) {
  const { loanAmount, annualRateDecimal, amortizationYears } = params;

  if (annualRateDecimal === 0) {
    return loanAmount / amortizationYears;
  }

  return (
    (loanAmount * annualRateDecimal) /
    (1 - Math.pow(1 + annualRateDecimal, -amortizationYears))
  );
}

function calculateBalanceAfterYears(params: {
  loanAmount: number;
  annualRateDecimal: number;
  annualPayment: number;
  years: number;
}) {
  const { loanAmount, annualRateDecimal, annualPayment, years } = params;

  if (years <= 0) {
    return loanAmount;
  }

  if (annualRateDecimal === 0) {
    return Math.max(0, loanAmount - annualPayment * years);
  }

  return Math.max(
    0,
    loanAmount * Math.pow(1 + annualRateDecimal, years) -
      annualPayment * ((Math.pow(1 + annualRateDecimal, years) - 1) / annualRateDecimal)
  );
}

export function buildCreditScenario(params: {
  inputs: CreditScenarioInputs;
  ebitda: number | null | undefined;
}): CreditScenarioResult {
  const { inputs, ebitda } = params;
  const validLoanAmount = isPositiveNumber(inputs.loanAmount) ? inputs.loanAmount : null;
  const validInterestRate =
    isPositiveNumber(inputs.annualInterestRatePercent) || inputs.annualInterestRatePercent === 0
      ? (inputs.annualInterestRatePercent ?? null)
      : null;
  const validTermYears = isPositiveNumber(inputs.loanTermYears) ? inputs.loanTermYears : null;
  const validAmortizationYears = isPositiveNumber(inputs.amortizationYears)
    ? inputs.amortizationYears
    : null;
  const validCollateralValue = isPositiveNumber(inputs.collateralValue)
    ? inputs.collateralValue
    : null;
  const annualRateDecimal =
    validInterestRate === null ? null : validInterestRate / 100;

  const canComputeDebtService =
    validLoanAmount !== null &&
    annualRateDecimal !== null &&
    validAmortizationYears !== null;

  const annualDebtService = canComputeDebtService
    ? calculateAnnualPayment({
        loanAmount: validLoanAmount,
        annualRateDecimal,
        amortizationYears: validAmortizationYears
      })
    : null;
  const annualInterestExpense =
    canComputeDebtService && annualRateDecimal !== null
      ? validLoanAmount * annualRateDecimal
      : null;
  const annualPrincipalPayment =
    annualDebtService !== null && annualInterestExpense !== null
      ? Math.max(0, annualDebtService - annualInterestExpense)
      : null;
  const balanceAtMaturity =
    canComputeDebtService && validTermYears !== null && annualDebtService !== null
      ? calculateBalanceAfterYears({
          loanAmount: validLoanAmount,
          annualRateDecimal: annualRateDecimal ?? 0,
          annualPayment: annualDebtService,
          years: validTermYears
        })
      : null;
  const hasEbitdaInput = ebitda !== null && ebitda !== undefined && Number.isFinite(ebitda);
  const hasNonPositiveEbitda = hasEbitdaInput && (ebitda as number) <= 0;

  const dscr =
    isPositiveNumber(ebitda ?? null) && isPositiveNumber(annualDebtService)
      ? (ebitda as number) / annualDebtService
      : null;
  const debtToEbitda =
    validLoanAmount !== null && isPositiveNumber(ebitda ?? null)
      ? validLoanAmount / (ebitda as number)
      : null;
  const interestCoverage =
    isPositiveNumber(ebitda ?? null) && isPositiveNumber(annualInterestExpense)
      ? (ebitda as number) / annualInterestExpense
      : null;
  const ltv =
    validLoanAmount !== null && validCollateralValue !== null
      ? validLoanAmount / validCollateralValue
      : null;
  const adverseSignals: string[] = [];

  if (hasEbitdaInput && (ebitda as number) < 0) {
    adverseSignals.push("Negative EBITDA");
    adverseSignals.push("Coverage unsupported due to non-positive earnings");
    if (annualDebtService !== null) {
      adverseSignals.push("Debt service not supported");
    }
  } else if (hasEbitdaInput && (ebitda as number) === 0) {
    adverseSignals.push("Zero EBITDA");
    adverseSignals.push("Coverage unsupported due to non-positive earnings");
    if (annualDebtService !== null) {
      adverseSignals.push("Debt service not supported");
    }
  }

  return {
    annualInterestExpense,
    annualPrincipalPayment,
    annualDebtService,
    balanceAtMaturity,
    canComputeDebtService,
    adverseSignals,
    metrics: {
      dscr: buildMetric({
        label: "DSCR",
        value: dscr,
        display: formatMultiple(dscr),
        description: hasNonPositiveEbitda
          ? "Unsupported with non-positive EBITDA"
          : "EBITDA / Annual Debt Service",
        status: hasNonPositiveEbitda ? "weak" : evaluateDscr(dscr)
      }),
      debtToEbitda: buildMetric({
        label: "Debt / EBITDA",
        value: debtToEbitda,
        display: formatMultiple(debtToEbitda),
        description: hasNonPositiveEbitda
          ? "Unsupported with non-positive EBITDA"
          : "Loan Amount / EBITDA",
        status: hasNonPositiveEbitda ? "weak" : evaluateDebtToEbitda(debtToEbitda)
      }),
      interestCoverage: buildMetric({
        label: "Interest Coverage",
        value: interestCoverage,
        display: formatMultiple(interestCoverage),
        description: hasNonPositiveEbitda
          ? "Unsupported with non-positive EBITDA"
          : "EBITDA / Annual Interest Expense",
        status: hasNonPositiveEbitda ? "weak" : evaluateInterestCoverage(interestCoverage)
      }),
      ltv: buildMetric({
        label: "LTV",
        value: ltv,
        display: formatRatioPercent(ltv),
        description: "Loan Amount / Purchase Price or Collateral Value",
        status: evaluateLtv(ltv)
      })
    }
  };
}

export function formatCreditScenarioCurrency(value: number | null) {
  return formatOptionalCurrency(value);
}
