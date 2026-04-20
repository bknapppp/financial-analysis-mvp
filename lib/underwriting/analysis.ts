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
  const selectedEbitda =
    ebitdaBasis === "adjusted" ? snapshot.adjustedEbitda : snapshot.ebitda;
  const creditScenario = buildCreditScenario({
    inputs: underwritingInputs,
    ebitda: selectedEbitda
  });
  const missingInputs = getMissingCreditScenarioInputs(underwritingInputs);
  const acceptedAddBackTotal =
    params.acceptedAddBackTotal ?? snapshot.acceptedAddBacks ?? 0;
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
    selectedEbitda,
    underwritingInputs,
    missingInputs,
    acceptedAddBackTotal,
    creditScenario,
    completionSummary,
    investmentOverview
  };
}
