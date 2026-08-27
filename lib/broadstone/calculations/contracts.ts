export type CanonicalMetricCode =
  | "revenue"
  | "reported_ebitda"
  | "calculated_ebitda"
  | "selected_ebitda"
  | "normalized_ebitda"
  | "accepted_adjustments"
  | "operating_income"
  | "net_income"
  | "total_debt"
  | "cash_and_cash_equivalents"
  | "preferred_equity"
  | "non_controlling_interest"
  | "public_reported_ebitda"
  | "public_ltm_ebitda";

export type EbitdaBasis = "reported" | "calculated" | "unavailable";

export type PrivateCalculationReference = {
  calculator: "buildSnapshots";
  field:
    | "revenue"
    | "reportedEbitda"
    | "ebitdaExplainability.computedEbitda"
    | "ebitda"
    | "adjustedEbitda"
    | "acceptedAddBacks";
};

export type MarketCalculationReference = {
  calculator: "market_engine";
  methodologyId: string;
  methodologyVersion: string;
  observationBundleHash: string;
  inputObservationIds: readonly string[];
};

export type CalculationReference = PrivateCalculationReference | MarketCalculationReference;

export type CalculationResult<
  TCode extends string = CanonicalMetricCode
> = {
  metricCode: TCode;
  value: number | null;
  reference: CalculationReference;
};

export type PrivateCompanyPeriodCalculations = {
  periodId: string;
  ebitdaBasis: EbitdaBasis;
  revenue: CalculationResult<"revenue">;
  reportedEbitda: CalculationResult<"reported_ebitda">;
  calculatedEbitda: CalculationResult<"calculated_ebitda">;
  selectedEbitda: CalculationResult<"selected_ebitda">;
  normalizedEbitda: CalculationResult<"normalized_ebitda">;
  acceptedAdjustments: CalculationResult<"accepted_adjustments">;
};
