import { buildCreditScenario } from "../credit-scenario.ts";
import type {
  CreditScenarioInputs,
  DataQualityReport,
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
    underwritingInputs,
    ebitdaBasis
  } = params;
  const acceptedAddBackTotal =
    params.acceptedAddBackTotal ?? snapshot.acceptedAddBacks ?? 0;
  const canonicalEbitda = snapshot.ebitda;
  const adjustedEbitda = getAdjustedEbitda({
    canonicalEbitda,
    acceptedAddbacks: acceptedAddBackTotal
  });
  const selectedEbitda = ebitdaBasis === "adjusted" ? adjustedEbitda : canonicalEbitda;
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
