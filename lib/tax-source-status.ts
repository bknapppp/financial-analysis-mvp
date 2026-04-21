import type { FinancialEntry, SourceFinancialContext, TaxSourceStatus } from "./types.ts";

const BROAD_CATEGORIES = new Set([
  "Assets",
  "Liabilities",
  "Equity",
  "current_assets",
  "non_current_assets",
  "current_liabilities",
  "non_current_liabilities",
  "equity"
]);

function countBroadClassifications(entries: FinancialEntry[]) {
  return entries.filter((entry) => BROAD_CATEGORIES.has(entry.category)).length;
}

export function canComputeTaxComparison(params: {
  hasTaxData: boolean;
  taxEbitda: number | null;
  reportedEbitdaReference: number | null;
  computedEbitda: number | null;
}) {
  const hasComparableReportedBasis = params.reportedEbitdaReference !== null;
  const hasComparableComputedBasis = params.computedEbitda !== null;

  return (
    params.hasTaxData &&
    params.taxEbitda !== null &&
    (hasComparableReportedBasis || hasComparableComputedBasis)
  );
}

export function buildEmptyTaxSourceStatus(): TaxSourceStatus {
  return {
    documentCount: 0,
    periodCount: 0,
    rowCount: 0,
    mappedLineCount: 0,
    lowConfidenceLineCount: 0,
    broadClassificationCount: 0,
    hasMatchingPeriod: false,
    matchingPeriodLabel: null,
    comparisonStatus: "not_loaded",
    comparisonComputable: false,
    missingComponents: [],
    notes: [],
    revenueDeltaPercent: null,
    reportedEbitdaDeltaPercent: null,
    computedEbitdaDeltaPercent: null,
    adjustedEbitdaDeltaPercent: null,
    requiredComponentsFound: [],
    taxCoverageStatus: "not_loaded",
    comparisonContext: null
  };
}

export function buildTaxSourceStatus(params: {
  taxContext: SourceFinancialContext;
  matchedPeriodLabel: string | null;
  comparisonComputable: boolean;
  comparisonMissingComponents: string[];
  comparisonNotes: string[];
  revenueDeltaPercent: number | null;
  reportedEbitdaDeltaPercent?: number | null;
  computedEbitdaDeltaPercent: number | null;
  adjustedEbitdaDeltaPercent: number | null;
  requiredComponentsFound?: string[];
  taxCoverageStatus?: "not_loaded" | "complete" | "partial" | "insufficient";
  comparisonContext?: TaxSourceStatus["comparisonContext"];
}): TaxSourceStatus {
  const { taxContext } = params;
  const comparisonStatus =
    taxContext.entries.length === 0
      ? "not_loaded"
      : params.comparisonComputable
        ? "ready"
        : "partial";

  return {
    documentCount: taxContext.documents.length,
    periodCount: taxContext.periods.length,
    rowCount: taxContext.entries.length,
    mappedLineCount: taxContext.entries.filter(
      (entry) => Boolean(entry.category) && Boolean(entry.statement_type)
    ).length,
    lowConfidenceLineCount: taxContext.entries.filter(
      (entry) => entry.confidence === "low"
    ).length,
    broadClassificationCount: countBroadClassifications(
      taxContext.entries.map((entry) => ({
        ...entry,
        period_id: entry.source_period_id
      })) as FinancialEntry[]
    ),
    hasMatchingPeriod: Boolean(params.matchedPeriodLabel),
    matchingPeriodLabel: params.matchedPeriodLabel,
    comparisonStatus,
    comparisonComputable: params.comparisonComputable,
    missingComponents: params.comparisonMissingComponents,
    notes: params.comparisonNotes,
    revenueDeltaPercent: params.revenueDeltaPercent,
    reportedEbitdaDeltaPercent: params.reportedEbitdaDeltaPercent ?? null,
    computedEbitdaDeltaPercent: params.computedEbitdaDeltaPercent,
    adjustedEbitdaDeltaPercent: params.adjustedEbitdaDeltaPercent,
    requiredComponentsFound: params.requiredComponentsFound ?? [],
    taxCoverageStatus: params.taxCoverageStatus ?? "not_loaded",
    comparisonContext: params.comparisonContext ?? null
  };
}
