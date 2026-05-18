import { buildCreditScenario } from "../credit-scenario.ts";
import type {
  CreditScenarioInputs,
  DataQualityReport,
  DataReadiness,
  FinancialEntry,
  PeriodSnapshot,
  ReconciliationReport,
  TaxSourceStatus,
  UnderwritingAnalysis,
  UnderwritingEbitdaBasis
} from "../types.ts";
import { getAdjustedEbitda } from "./ebitda.ts";
import { buildUnderwritingCompletion, getMissingCreditScenarioInputs } from "./completion.ts";
import { buildInvestmentOverview } from "./investment-overview.ts";

export function buildUnderwritingAnalysis(params: {
  snapshot: PeriodSnapshot;
  entries: FinancialEntry[];
  dataQuality: DataQualityReport;
  taxSourceStatus: TaxSourceStatus;
  reconciliation: ReconciliationReport;
  readiness?: DataReadiness | null;
  underwritingInputs: CreditScenarioInputs;
  ebitdaBasis: UnderwritingEbitdaBasis;
  acceptedAddBackTotal?: number;
}): UnderwritingAnalysis {
  const {
    snapshot,
    entries,
    dataQuality,
    taxSourceStatus,
    reconciliation,
    readiness,
    underwritingInputs,
    ebitdaBasis
  } = params;
  const acceptedAddBackTotal =
    params.acceptedAddBackTotal ?? snapshot.acceptedAddBacks ?? 0;
  const canonicalEbitda = snapshot.ebitda;
  const rawAdjustedEbitda = getAdjustedEbitda({
    canonicalEbitda,
    acceptedAddbacks: acceptedAddBackTotal
  });
  const adjustedEbitda = readiness?.status === "blocked" ? null : rawAdjustedEbitda;
  const selectedEbitda =
    ebitdaBasis === "adjusted"
      ? adjustedEbitda ?? (isValidCreditEbitda(canonicalEbitda) ? canonicalEbitda : null)
      : canonicalEbitda;
  const creditScenario = buildCreditScenario({
    inputs: underwritingInputs,
    ebitda: selectedEbitda
  });
  const missingInputs = getMissingCreditScenarioInputs(underwritingInputs);
  const completionSummary = buildUnderwritingCompletion({
    snapshot,
    entries,
    dataQuality,
    taxSourceStatus,
    underwritingInputs,
    creditScenario,
    reconciliation
  });
  const investmentOverview = buildInvestmentOverview({
    snapshot,
    acceptedAddBackTotal,
    ebitdaBasis,
    underwritingInputs,
    creditScenario,
    dataQuality,
    reconciliation,
    taxSourceStatus,
    completionSummary
  });

  return {
    ebitdaBasis,
    canonicalEbitda,
    adjustedEbitda,
    selectedEbitda,
    underwritingInputs,
    missingInputs,
    acceptedAddBackTotal,
    creditScenario,
    completionSummary,
    investmentOverview
  };
}

function isValidCreditEbitda(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}
