import { formatCurrency, formatPercent } from "../formatters.ts";
import type {
  CreditScenarioInputs,
  CreditScenarioResult,
  DataQualityReport,
  InvestmentOverviewSummary,
  PeriodSnapshot,
  ReconciliationReport,
  TaxSourceStatus,
  UnderwritingCompletionSummary,
  UnderwritingEbitdaBasis
} from "../types";
import { getMissingCreditScenarioInputs } from "./completion.ts";

function formatMultiple(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Not available";
  }

  return `${value.toFixed(2)}x`;
}

function formatDeltaPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return formatPercent(Math.abs(value) * 100);
}

function formatMissingFields(inputs: CreditScenarioInputs) {
  const missing = getMissingCreditScenarioInputs(inputs);
  if (missing.length === 0) {
    return null;
  }

  return missing.join(", ");
}

export function buildInvestmentOverview(params: {
  snapshot: PeriodSnapshot;
  acceptedAddBackTotal: number;
  ebitdaBasis: UnderwritingEbitdaBasis;
  underwritingInputs: CreditScenarioInputs;
  creditScenario: CreditScenarioResult;
  dataQuality: DataQualityReport;
  reconciliation: ReconciliationReport;
  taxSourceStatus: TaxSourceStatus;
  completionSummary: UnderwritingCompletionSummary;
}): InvestmentOverviewSummary {
  const {
    snapshot,
    acceptedAddBackTotal,
    ebitdaBasis,
    underwritingInputs,
    creditScenario,
    dataQuality,
    reconciliation,
    taxSourceStatus,
    completionSummary
  } = params;
  const addBackShare =
    snapshot.ebitda !== null && snapshot.ebitda !== 0
      ? acceptedAddBackTotal / Math.abs(snapshot.ebitda)
      : null;
  const missingStructureFields = formatMissingFields(underwritingInputs);
  const earningsQualityItems: string[] = [];
  const financialIntegrityItems: string[] = [];
  const structureReadinessItems: string[] = [];

  earningsQualityItems.push(
    `Underwriting basis currently uses ${
      ebitdaBasis === "adjusted" ? "adjusted EBITDA" : "computed EBITDA"
    }.`
  );

  if (acceptedAddBackTotal > 0 && addBackShare !== null) {
    earningsQualityItems.push(
      `Accepted add-backs total ${formatCurrency(acceptedAddBackTotal)}, equal to ${formatPercent(
        addBackShare * 100
      )} of EBITDA.`
    );

    if (addBackShare >= 0.25) {
      earningsQualityItems.push("Adjusted EBITDA is materially add-back driven.");
    }
  } else {
    earningsQualityItems.push(
      "Adjusted EBITDA is not currently supported by a material add-back layer."
    );
  }

  if (snapshot.ebitdaExplainability?.basisLabel) {
    earningsQualityItems.push(snapshot.ebitdaExplainability.basisLabel);
  }

  if (reconciliation.status !== "reconciled") {
    financialIntegrityItems.push(reconciliation.summaryMessage);
  } else {
    financialIntegrityItems.push("Statement outputs currently reconcile within tolerance.");
  }

  if (
    taxSourceStatus.comparisonComputable &&
    taxSourceStatus.computedEbitdaDeltaPercent !== null &&
    Math.abs(taxSourceStatus.computedEbitdaDeltaPercent) >= 0.1
  ) {
    financialIntegrityItems.push(
      `Tax vs computed EBITDA divergence is ${formatDeltaPercent(
        taxSourceStatus.computedEbitdaDeltaPercent
      )} for the matched period.`
    );
  } else if (taxSourceStatus.comparisonStatus === "partial") {
    financialIntegrityItems.push(
      "Tax-source comparison is not yet fully supported by the matched source coverage."
    );
  } else if (taxSourceStatus.comparisonStatus === "not_loaded") {
    financialIntegrityItems.push(
      "Tax-source comparison is not available for the selected period."
    );
  }

  if (dataQuality.missingCategories.length > 0) {
    financialIntegrityItems.push(
      `Statement coverage remains incomplete across ${dataQuality.missingCategories.join(", ")}.`
    );
  }

  if (dataQuality.mappingCoveragePercent < 90) {
    financialIntegrityItems.push(
      `Mapping coverage is ${Math.round(
        dataQuality.mappingCoveragePercent
      )}%, so some outputs still depend on unresolved classification work.`
    );
  }

  if (missingStructureFields) {
    structureReadinessItems.push(
      `Debt sizing cannot be fully evaluated because the following structure fields are missing: ${missingStructureFields}.`
    );
  } else {
    structureReadinessItems.push(
      `Current structure outputs show DSCR ${formatMultiple(
        creditScenario.metrics.dscr.value
      )}, Debt / EBITDA ${formatMultiple(
        creditScenario.metrics.debtToEbitda.value
      )}, and LTV ${
        creditScenario.metrics.ltv.value === null
          ? "Not available"
          : formatPercent(creditScenario.metrics.ltv.value * 100)
      }.`
    );
  }

  if (underwritingInputs.collateralValue === null) {
    structureReadinessItems.push("LTV cannot be assessed without purchase price or collateral support.");
  }

  if (creditScenario.metrics.dscr.status === "insufficient") {
    structureReadinessItems.push("Debt service coverage cannot be computed on the current structure inputs.");
  }

  return {
    title: "Investment Overview",
    summary:
      completionSummary.completionStatus === "ready"
        ? "The current underwriting package is complete and traceable across earnings, integrity, and structure checks."
        : completionSummary.completionStatus === "blocked"
          ? "The current underwriting package remains incomplete across one or more required inputs or validation checks."
          : "The current underwriting package supports a partial read, with remaining gaps still visible in the workflow.",
    sections: [
      {
        key: "earnings_quality",
        title: "Earnings Quality",
        items: earningsQualityItems.slice(0, 3)
      },
      {
        key: "financial_integrity",
        title: "Financial Integrity",
        items: financialIntegrityItems.slice(0, 3)
      },
      {
        key: "structure_readiness",
        title: "Structure Readiness",
        items: structureReadinessItems.slice(0, 3)
      },
      {
        key: "key_underwriting_gaps",
        title: "Key Underwriting Gaps",
        items:
          completionSummary.blockers.length > 0
            ? completionSummary.blockers.slice(0, 4)
            : completionSummary.missingItems.slice(0, 4)
      }
    ]
  };
}
