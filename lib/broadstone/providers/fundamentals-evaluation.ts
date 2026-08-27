import type { CanonicalFinancialObservation } from "../canonical/index.ts";
import type { CanonicalMetricCode } from "../calculations/contracts.ts";

export type FundamentalsCoverageMetric =
  | "revenue"
  | "public_reported_ebitda"
  | "public_ltm_ebitda"
  | "operating_income"
  | "net_income"
  | "total_debt"
  | "cash_and_cash_equivalents"
  | "preferred_equity"
  | "non_controlling_interest";

export type FundamentalsCoverage = {
  metricCode: FundamentalsCoverageMetric;
  observedCompanies: number;
  totalCompanies: number;
  coveragePercent: number;
};

export function calculateFundamentalsCoverage(
  companies: readonly (readonly CanonicalFinancialObservation[])[],
  metrics: readonly FundamentalsCoverageMetric[]
): FundamentalsCoverage[] {
  return metrics.map((metricCode) => {
    const observedCompanies = companies.filter((observations) =>
      observations.some((observation) => observation.metricCode === metricCode)
    ).length;
    return {
      metricCode,
      observedCompanies,
      totalCompanies: companies.length,
      coveragePercent: companies.length === 0 ? 0 : observedCompanies / companies.length * 100
    };
  });
}

export type FundamentalComparisonClassification =
  | "same"
  | "within_tolerance"
  | "material_unexplained_difference"
  | "missing_on_one_side";

export type FundamentalComparison = {
  metricCode: CanonicalMetricCode;
  secValue: number | null;
  providerValue: number | null;
  differencePercent: number | null;
  classification: FundamentalComparisonClassification;
};

export function compareCanonicalFundamentals(params: {
  sec: readonly CanonicalFinancialObservation[];
  provider: readonly CanonicalFinancialObservation[];
  metricCodes: readonly CanonicalMetricCode[];
  tolerancePercent?: number;
}): FundamentalComparison[] {
  const tolerance = params.tolerancePercent ?? 0.01;
  return params.metricCodes.map((metricCode) => {
    const sec = params.sec.find((item) => item.metricCode === metricCode);
    const provider = params.provider.find((item) => item.metricCode === metricCode);
    if (!sec || !provider) return {
      metricCode,
      secValue: sec?.value ?? null,
      providerValue: provider?.value ?? null,
      differencePercent: null,
      classification: "missing_on_one_side"
    };
    const denominator = Math.max(Math.abs(sec.value), 1);
    const differencePercent = Math.abs(provider.value - sec.value) / denominator;
    return {
      metricCode,
      secValue: sec.value,
      providerValue: provider.value,
      differencePercent,
      classification: differencePercent === 0
        ? "same"
        : differencePercent <= tolerance
          ? "within_tolerance"
          : "material_unexplained_difference"
    };
  });
}
