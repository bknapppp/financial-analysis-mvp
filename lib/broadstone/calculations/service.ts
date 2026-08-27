import { buildSnapshots } from "../../calculations.ts";
import type { AddBack, FinancialEntry, PeriodSnapshot, ReportingPeriod } from "../../types";
import type {
  CalculationReference,
  CalculationResult,
  CanonicalMetricCode,
  EbitdaBasis,
  PrivateCompanyPeriodCalculations
} from "./contracts.ts";

type LegacyCalculationReference = Extract<CalculationReference, { calculator: "buildSnapshots" }>;

const reference = (
  field: LegacyCalculationReference["field"]
): LegacyCalculationReference => ({ calculator: "buildSnapshots", field });

function result<TCode extends CanonicalMetricCode>(
  metricCode: TCode,
  value: number | null,
  field: LegacyCalculationReference["field"]
): CalculationResult<TCode> {
  return { metricCode, value, reference: reference(field) };
}

function getEbitdaBasis(snapshot: PeriodSnapshot): EbitdaBasis {
  if (snapshot.reportedEbitda !== null && snapshot.reportedEbitda !== undefined) {
    return "reported";
  }

  return snapshot.ebitda === null ? "unavailable" : "calculated";
}

function fromLegacySnapshot(
  snapshot: PeriodSnapshot
): PrivateCompanyPeriodCalculations {
  return {
    periodId: snapshot.periodId,
    ebitdaBasis: getEbitdaBasis(snapshot),
    revenue: result("revenue", snapshot.revenue, "revenue"),
    reportedEbitda: result(
      "reported_ebitda",
      snapshot.reportedEbitda ?? null,
      "reportedEbitda"
    ),
    calculatedEbitda: result(
      "calculated_ebitda",
      snapshot.ebitdaExplainability?.computedEbitda ?? null,
      "ebitdaExplainability.computedEbitda"
    ),
    selectedEbitda: result("selected_ebitda", snapshot.ebitda, "ebitda"),
    normalizedEbitda: result(
      "normalized_ebitda",
      snapshot.adjustedEbitda,
      "adjustedEbitda"
    ),
    acceptedAdjustments: result(
      "accepted_adjustments",
      snapshot.acceptedAddBacks,
      "acceptedAddBacks"
    )
  };
}

export function calculatePrivateCompanyPeriods(params: {
  periods: ReportingPeriod[];
  entries: FinancialEntry[];
  addBacks?: AddBack[];
}): PrivateCompanyPeriodCalculations[] {
  return buildSnapshots(
    params.periods,
    params.entries,
    params.addBacks ?? []
  ).map(fromLegacySnapshot);
}
