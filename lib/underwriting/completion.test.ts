import assert from "node:assert/strict";
import { buildCreditScenario } from "../credit-scenario.ts";
import { buildUnderwritingCompletion } from "./completion.ts";
import type {
  DataQualityReport,
  FinancialEntry,
  PeriodSnapshot,
  TaxSourceStatus
} from "../types.ts";

const snapshot: PeriodSnapshot = {
  periodId: "period-1",
  label: "FY2024",
  periodDate: "2024-12-31",
  revenue: 5000000,
  cogs: 2000000,
  grossProfit: 3000000,
  operatingExpenses: 1800000,
  ebitda: 1200000,
  acceptedAddBacks: 150000,
  adjustedEbitda: 1350000,
  grossMarginPercent: 60,
  ebitdaMarginPercent: 24,
  adjustedEbitdaMarginPercent: 27,
  currentAssets: 1200000,
  currentLiabilities: 700000,
  workingCapital: 500000,
  revenueGrowthPercent: 5,
  ebitdaGrowthPercent: 3,
  adjustedEbitdaGrowthPercent: 4,
  grossMarginChange: 1,
  ebitdaMarginChange: 0.5,
  ebitdaExplainability: {
    basis: "computed",
    basisLabel: "Computed from bottom-up inputs",
    note: "",
    netIncome: null,
    interestAddBack: null,
    taxAddBack: null,
    depreciationAndAmortizationAddBack: null,
    computedEbitda: 1200000,
    reportedEbitda: null,
    selectedLabels: [],
    excludedLabels: [],
    missingComponents: []
  }
};

const entries: FinancialEntry[] = [
  {
    id: "1",
    account_name: "Revenue",
    statement_type: "income",
    amount: 5000000,
    period_id: "period-1",
    category: "Revenue",
    addback_flag: false,
    matched_by: "manual",
    confidence: "high",
    mapping_explanation: null,
    created_at: "2026-04-13T00:00:00.000Z"
  },
  {
    id: "2",
    account_name: "COGS",
    statement_type: "income",
    amount: -2000000,
    period_id: "period-1",
    category: "COGS",
    addback_flag: false,
    matched_by: "manual",
    confidence: "high",
    mapping_explanation: null,
    created_at: "2026-04-13T00:00:00.000Z"
  },
  {
    id: "3",
    account_name: "Operating expense",
    statement_type: "income",
    amount: -1800000,
    period_id: "period-1",
    category: "Operating Expenses",
    addback_flag: false,
    matched_by: "manual",
    confidence: "high",
    mapping_explanation: null,
    created_at: "2026-04-13T00:00:00.000Z"
  },
  {
    id: "4",
    account_name: "Cash",
    statement_type: "balance_sheet",
    amount: 400000,
    period_id: "period-1",
    category: "current_assets.cash",
    addback_flag: false,
    matched_by: "manual",
    confidence: "high",
    mapping_explanation: null,
    created_at: "2026-04-13T00:00:00.000Z"
  },
  {
    id: "5",
    account_name: "Debt",
    statement_type: "balance_sheet",
    amount: -300000,
    period_id: "period-1",
    category: "non_current_liabilities.long_term_debt",
    addback_flag: false,
    matched_by: "manual",
    confidence: "high",
    mapping_explanation: null,
    created_at: "2026-04-13T00:00:00.000Z"
  },
  {
    id: "6",
    account_name: "Retained earnings",
    statement_type: "balance_sheet",
    amount: 100000,
    period_id: "period-1",
    category: "equity.retained_earnings",
    addback_flag: false,
    matched_by: "manual",
    confidence: "high",
    mapping_explanation: null,
    created_at: "2026-04-13T00:00:00.000Z"
  }
];

const dataQuality: DataQualityReport = {
  mappingCoveragePercent: 100,
  mappingBreakdown: {
    saved_mapping: 0,
    keyword_mapping: 0,
    manual_mapping: 6,
    unmapped: 0
  },
  missingCategories: [],
  confidenceScore: 90,
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
  revenueDeltaPercent: 0.02,
  reportedEbitdaDeltaPercent: 0.03,
  adjustedEbitdaDeltaPercent: 0.08
};

const completeScenario = buildCreditScenario({
  inputs: {
    loanAmount: 3000000,
    annualInterestRatePercent: 10,
    loanTermYears: 5,
    amortizationYears: 10,
    collateralValue: 5000000
  },
  ebitda: snapshot.adjustedEbitda
});

const completeSummary = buildUnderwritingCompletion({
  snapshot,
  entries,
  dataQuality,
  taxSourceStatus,
  underwritingInputs: {
    loanAmount: 3000000,
    annualInterestRatePercent: 10,
    loanTermYears: 5,
    amortizationYears: 10,
    collateralValue: 5000000
  },
  creditScenario: completeScenario
});

assert.equal(completeSummary.completionStatus, "ready");
assert.equal(completeSummary.completionPercent, 100);
assert.equal(completeSummary.blockers.length, 0);

const partialScenario = buildCreditScenario({
  inputs: {
    loanAmount: null,
    annualInterestRatePercent: null,
    loanTermYears: null,
    amortizationYears: null,
    collateralValue: null
  },
  ebitda: snapshot.adjustedEbitda
});

const blockedSummary = buildUnderwritingCompletion({
  snapshot,
  entries,
  dataQuality: {
    ...dataQuality,
    mappingCoveragePercent: 60,
    mappingBreakdown: {
      ...dataQuality.mappingBreakdown,
      unmapped: 2
    }
  },
  taxSourceStatus: {
    ...taxSourceStatus,
    comparisonStatus: "partial",
    comparisonComputable: false
  },
  underwritingInputs: {
    loanAmount: null,
    annualInterestRatePercent: null,
    loanTermYears: null,
    amortizationYears: null,
    collateralValue: null
  },
  creditScenario: partialScenario
});

assert.equal(blockedSummary.completionStatus, "blocked");
assert.ok(blockedSummary.blockers.includes("Coverage supports usable outputs"));
assert.ok(blockedSummary.missingItems.includes("Loan amount"));
assert.ok(blockedSummary.nextActions.includes("Enter the proposed loan amount"));

console.log("underwriting completion tests passed");
