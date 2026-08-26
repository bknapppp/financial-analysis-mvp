export type CanonicalMetricCode =
  | "revenue"
  | "reported_ebitda"
  | "calculated_ebitda"
  | "selected_ebitda"
  | "normalized_ebitda"
  | "accepted_adjustments";

export type EbitdaBasis = "reported" | "calculated" | "unavailable";

export type CalculationReference = {
  calculator: "buildSnapshots";
  field:
    | "revenue"
    | "reportedEbitda"
    | "ebitdaExplainability.computedEbitda"
    | "ebitda"
    | "adjustedEbitda"
    | "acceptedAddBacks";
};

export type CalculationResult<
  TCode extends CanonicalMetricCode = CanonicalMetricCode
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
