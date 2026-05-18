import assert from "node:assert/strict";
import { buildUnderwritingAnalysis } from "./analysis.ts";
import type {
  CreditScenarioInputs,
  DataQualityReport,
  DataReadiness,
  FinancialEntry,
  PeriodSnapshot,
  ReconciliationReport,
  TaxSourceStatus
} from "../types.ts";

const underwritingInputs: CreditScenarioInputs = {
  loanAmount: 3000000,
  annualInterestRatePercent: 10,
  loanTermYears: 5,
  amortizationYears: 10,
  collateralValue: 5000000
};

const entries: FinancialEntry[] = [
  {
    id: "entry-revenue",
    account_name: "Revenue",
    statement_type: "income",
    amount: 5000000,
    period_id: "period-1",
    category: "Revenue",
    addback_flag: false,
    matched_by: "manual",
    confidence: "high",
    mapping_explanation: null,
    created_at: "2026-05-18T00:00:00.000Z"
  }
];

const dataQuality: DataQualityReport = {
  mappingCoveragePercent: 100,
  mappingBreakdown: {
    saved_mapping: 0,
    keyword_mapping: 0,
    manual_mapping: 1,
    unmapped: 0
  },
  missingCategories: [],
  confidenceScore: 95,
  confidenceLabel: "High",
  hasSinglePeriodWarning: false,
  consistencyIssues: [],
  summaryMessage: "Clean source coverage.",
  issueGroups: []
};

const taxSourceStatus: TaxSourceStatus = {
  documentCount: 1,
  periodCount: 1,
  rowCount: 5,
  mappedLineCount: 5,
  lowConfidenceLineCount: 0,
  broadClassificationCount: 0,
  hasMatchingPeriod: true,
  matchingPeriodLabel: "FY2024",
  comparisonStatus: "ready",
  comparisonComputable: true,
  missingComponents: [],
  notes: [],
  revenueDeltaPercent: null,
  reportedEbitdaDeltaPercent: null,
  computedEbitdaDeltaPercent: null,
  adjustedEbitdaDeltaPercent: null
};

const reconciliation: ReconciliationReport = {
  status: "reconciled",
  label: "Reconciles",
  summaryMessage: "The normalized financial outputs reconcile within tolerance.",
  withinTolerance: true,
  issues: []
};

const readyReadiness: DataReadiness = {
  status: "ready",
  label: "Ready",
  blockingReasons: [],
  cautionReasons: [],
  summaryMessage: "Adjusted EBITDA is ready for decision-grade review."
};

const blockedReadiness: DataReadiness = {
  status: "blocked",
  label: "Not reliable",
  blockingReasons: ["Mapping coverage is below 70%, so adjusted EBITDA is not decision-grade."],
  cautionReasons: [],
  summaryMessage:
    "Adjusted EBITDA is not reliable because critical data quality issues remain unresolved."
};

function buildSnapshot(overrides: Partial<PeriodSnapshot> = {}): PeriodSnapshot {
  return {
    periodId: "period-1",
    label: "FY2024",
    periodDate: "2024-12-31",
    revenue: 5000000,
    cogs: 2000000,
    grossProfit: 3000000,
    operatingExpenses: 2000000,
    depreciationAndAmortization: null,
    nonOperating: null,
    taxExpense: null,
    netIncome: null,
    ebit: null,
    reportedOperatingIncome: null,
    reportedEbitda: null,
    ebitda: 1000000,
    acceptedAddBacks: 250000,
    adjustedEbitda: 1250000,
    grossMarginPercent: 60,
    ebitdaMarginPercent: 20,
    adjustedEbitdaMarginPercent: 25,
    currentAssets: 1000000,
    currentLiabilities: 500000,
    workingCapital: 500000,
    revenueGrowthPercent: null,
    ebitdaGrowthPercent: null,
    adjustedEbitdaGrowthPercent: null,
    grossMarginChange: null,
    ebitdaMarginChange: null,
    ...overrides
  };
}

const readyAnalysis = buildUnderwritingAnalysis({
  snapshot: buildSnapshot(),
  entries,
  dataQuality,
  taxSourceStatus,
  reconciliation,
  readiness: readyReadiness,
  underwritingInputs,
  ebitdaBasis: "adjusted"
});

assert.equal(readyAnalysis.adjustedEbitda, 1250000);
assert.equal(readyAnalysis.selectedEbitda, 1250000);
assert.equal(
  Math.round(((readyAnalysis.creditScenario.metrics.debtToEbitda.value ?? 0) as number) * 100) /
    100,
  2.4
);

const missingReadinessAnalysis = buildUnderwritingAnalysis({
  snapshot: buildSnapshot(),
  entries,
  dataQuality,
  taxSourceStatus,
  reconciliation,
  underwritingInputs,
  ebitdaBasis: "adjusted"
});

assert.equal(missingReadinessAnalysis.adjustedEbitda, 1250000);
assert.equal(missingReadinessAnalysis.selectedEbitda, 1250000);

const blockedAnalysis = buildUnderwritingAnalysis({
  snapshot: buildSnapshot(),
  entries,
  dataQuality,
  taxSourceStatus,
  reconciliation,
  readiness: blockedReadiness,
  underwritingInputs,
  ebitdaBasis: "adjusted"
});

assert.equal(blockedAnalysis.adjustedEbitda, null);
assert.equal(blockedAnalysis.selectedEbitda, 1000000);
assert.equal(
  Math.round(((blockedAnalysis.creditScenario.metrics.debtToEbitda.value ?? 0) as number) * 100) /
    100,
  3
);

const blockedWithoutCanonical = buildUnderwritingAnalysis({
  snapshot: buildSnapshot({
    reportedEbitda: 900000,
    ebitda: null,
    adjustedEbitda: null,
    ebitdaMarginPercent: null,
    adjustedEbitdaMarginPercent: null
  }),
  entries,
  dataQuality,
  taxSourceStatus,
  reconciliation,
  readiness: blockedReadiness,
  underwritingInputs,
  ebitdaBasis: "adjusted",
  acceptedAddBackTotal: 250000
});

assert.equal(blockedWithoutCanonical.adjustedEbitda, null);
assert.equal(blockedWithoutCanonical.selectedEbitda, null);
assert.equal(blockedWithoutCanonical.creditScenario.metrics.dscr.status, "insufficient");
assert.equal(blockedWithoutCanonical.creditScenario.metrics.debtToEbitda.status, "insufficient");
assert.equal(blockedWithoutCanonical.creditScenario.metrics.interestCoverage.status, "insufficient");

console.log("underwriting analysis tests passed");
