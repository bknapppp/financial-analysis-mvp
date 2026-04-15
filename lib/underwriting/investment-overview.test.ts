import assert from "node:assert/strict";
import { buildCreditScenario } from "../credit-scenario.ts";
import { buildInvestmentOverview } from "./investment-overview.ts";
import type {
  DataQualityReport,
  PeriodSnapshot,
  ReconciliationReport,
  TaxSourceStatus,
  UnderwritingCompletionSummary
} from "../types.ts";

const snapshot: PeriodSnapshot = {
  periodId: "period-1",
  label: "FY2024",
  periodDate: "2024-12-31",
  revenue: 5200000,
  cogs: 2100000,
  grossProfit: 3100000,
  operatingExpenses: 1900000,
  ebitda: 1200000,
  acceptedAddBacks: 400000,
  adjustedEbitda: 1600000,
  grossMarginPercent: 59.6,
  ebitdaMarginPercent: 23.1,
  adjustedEbitdaMarginPercent: 30.8,
  currentAssets: 900000,
  currentLiabilities: 600000,
  workingCapital: 300000,
  revenueGrowthPercent: 0.05,
  ebitdaGrowthPercent: -0.02,
  adjustedEbitdaGrowthPercent: 0.04,
  grossMarginChange: 1,
  ebitdaMarginChange: -0.5,
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

const dataQuality: DataQualityReport = {
  mappingCoveragePercent: 82,
  mappingBreakdown: {
    saved_mapping: 0,
    keyword_mapping: 0,
    manual_mapping: 10,
    unmapped: 2
  },
  missingCategories: ["Balance sheet components"],
  confidenceScore: 68,
  confidenceLabel: "Medium",
  hasSinglePeriodWarning: false,
  consistencyIssues: [],
  summaryMessage: "Some issues may affect insights",
  issueGroups: []
};

const reconciliation: ReconciliationReport = {
  status: "warning",
  label: "Reconciles with warnings",
  summaryMessage: "Statement outputs reconcile with qualification items.",
  withinTolerance: true,
  issues: []
};

const taxSourceStatus: TaxSourceStatus = {
  documentCount: 1,
  periodCount: 1,
  rowCount: 8,
  mappedLineCount: 8,
  lowConfidenceLineCount: 0,
  broadClassificationCount: 1,
  hasMatchingPeriod: true,
  matchingPeriodLabel: "FY2024",
  comparisonStatus: "ready",
  comparisonComputable: true,
  missingComponents: [],
  notes: [],
  revenueDeltaPercent: 0.04,
  reportedEbitdaDeltaPercent: 0.18,
  adjustedEbitdaDeltaPercent: 0.32
};

const completionSummary: UnderwritingCompletionSummary = {
  completionPercent: 62,
  completionStatus: "blocked",
  blockers: ["Interest rate entered", "Amortization entered"],
  missingItems: ["Interest rate", "Amortization"],
  completedItems: ["Loan amount entered"],
  nextActions: ["Enter the interest rate assumption", "Enter the amortization period"],
  sections: []
};

const overview = buildInvestmentOverview({
  snapshot,
  acceptedAddBackTotal: 400000,
  ebitdaBasis: "adjusted",
  underwritingInputs: {
    loanAmount: 3500000,
    annualInterestRatePercent: null,
    loanTermYears: 5,
    amortizationYears: null,
    collateralValue: null
  },
  creditScenario: buildCreditScenario({
    inputs: {
      loanAmount: 3500000,
      annualInterestRatePercent: null,
      loanTermYears: 5,
      amortizationYears: null,
      collateralValue: null
    },
    ebitda: snapshot.adjustedEbitda
  }),
  dataQuality,
  reconciliation,
  taxSourceStatus,
  completionSummary
});

assert.equal(overview.title, "Investment Overview");
assert.equal(overview.sections.length, 4);
assert.ok(
  overview.sections[0]?.items.some((item) =>
    item.includes("materially add-back driven")
  )
);
assert.ok(
  overview.sections[1]?.items.some((item) =>
    item.includes("Tax vs reported EBITDA divergence")
  )
);
assert.ok(
  overview.sections[2]?.items.some((item) =>
    item.includes("Debt sizing cannot be fully evaluated")
  )
);
assert.deepEqual(overview.sections[3]?.items, completionSummary.blockers);

console.log("investment overview tests passed");
