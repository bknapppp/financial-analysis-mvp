import assert from "node:assert/strict";
import {
  buildDealAddbackSummaryFromRuntime,
  buildDealDataQualitySummaryFromRuntime,
  buildDealFinancialOutputsFromRuntime,
  buildDealRiskSummaryFromRuntime,
  buildDealWorkflowStateFromRuntime,
  type DealMemoryRuntimeContext
} from "./deal-memory.ts";

function createRuntimeContext(): DealMemoryRuntimeContext {
  return {
    dealId: "company-1",
    data: {
      company: {
        id: "company-1",
        industry: "HVAC"
      },
      periods: [{ id: "period-1" }],
      entries: [{ id: "entry-1" }],
      snapshot: {
        periodId: "period-1",
        revenue: 4_000_000,
        ebitda: 800_000,
        adjustedEbitda: 950_000,
        ebitdaMarginPercent: 20,
        acceptedAddBacks: 150_000
      },
      addBackReviewItems: [
        {
          periodId: "period-1",
          status: "accepted",
          type: "owner_related",
          amount: 100_000
        },
        {
          periodId: "period-1",
          status: "accepted",
          type: "non_recurring",
          amount: 50_000
        },
        {
          periodId: "period-1",
          status: "suggested",
          type: "discretionary",
          amount: 20_000
        }
      ],
      dataQuality: {
        confidenceScore: 84,
        confidenceLabel: "High",
        summaryMessage: "Financial package is reliable."
      },
      readiness: {
        status: "ready",
        label: "Ready",
        blockingReasons: [],
        cautionReasons: [],
        summaryMessage: "Ready for review."
      },
      reconciliation: {
        status: "reconciled",
        summaryMessage: "Reconciles within tolerance."
      },
      taxSourceStatus: {
        documentCount: 1,
        rowCount: 5,
        comparisonStatus: "ready"
      },
      completionSummary: {
        completionPercent: 92,
        completionStatus: "ready",
        blockers: []
      }
    },
    acceptedAddBackItems: [
      {
        periodId: "period-1",
        status: "accepted",
        type: "owner_related",
        amount: 100_000
      },
      {
        periodId: "period-1",
        status: "accepted",
        type: "non_recurring",
        amount: 50_000
      }
    ],
    riskFlags: [
      {
        severity: "medium",
        title: "Adjusted EBITDA depends materially on add-backs",
        description: "Adjustment layer is meaningful."
      }
    ],
    portfolioState: {
      status: "Ready for output",
      currentBlocker: "Ready for output",
      nextAction: "Prepare output",
      nextActionHref: "/deal/company-1",
      hasCriticalInputsMissing: false,
      hasAddBacks: true,
      addBacksPercentOfEbitda: 18.75,
      addBacksAboveThreshold: false
    }
  };
}

{
  const context = createRuntimeContext();
  const financialOutputs = buildDealFinancialOutputsFromRuntime(context);
  const addbackSummary = buildDealAddbackSummaryFromRuntime(context);
  const riskSummary = buildDealRiskSummaryFromRuntime(context);
  const workflowState = buildDealWorkflowStateFromRuntime(context);
  const dataQualitySummary = buildDealDataQualitySummaryFromRuntime(context);

  assert.equal(financialOutputs.companyId, "company-1");
  assert.equal(financialOutputs.revenue, 4_000_000);
  assert.equal(financialOutputs.ebitdaMargin, 20);
  assert.equal(financialOutputs.reconciliationStatus, "reconciled");

  assert.equal(addbackSummary.addbackCount, 2);
  assert.equal(addbackSummary.addbackValue, 150_000);
  assert.deepEqual(addbackSummary.addbackTypes, ["non_recurring", "owner_related"]);

  assert.equal(riskSummary.blockerCount, 0);
  assert.equal(Array.isArray(riskSummary.riskFlags), true);
  assert.equal((riskSummary.riskFlags ?? []).length, 1);

  assert.equal(workflowState.completionPercent, 92);
  assert.equal(workflowState.currentStage, "underwriting");

  assert.equal(dataQualitySummary.sourceCompletenessScore, 84);
  assert.equal(dataQualitySummary.hasTaxReturns, true);
  assert.equal(dataQualitySummary.hasFinancialStatements, true);
  assert.equal(dataQualitySummary.financialsConfidence, "high");
  assert.equal(dataQualitySummary.isSnapshotReady, true);
  assert.equal(dataQualitySummary.isBenchmarkEligible, true);
}

{
  const context = createRuntimeContext();
  context.data.snapshot = {
    ...context.data.snapshot,
    periodId: "",
    revenue: 0,
    ebitda: null,
    adjustedEbitda: null,
    ebitdaMarginPercent: null
  };

  const financialOutputs = buildDealFinancialOutputsFromRuntime(context);
  const dataQualitySummary = buildDealDataQualitySummaryFromRuntime(context);

  assert.equal(financialOutputs.revenue, null);
  assert.equal(financialOutputs.ebitda, null);
  assert.equal(dataQualitySummary.snapshotReason, "Insufficient financial data");
}

{
  const context = createRuntimeContext();
  context.data.readiness = {
    status: "blocked",
    label: "Not reliable",
    blockingReasons: ["Revenue is missing for the selected period."],
    cautionReasons: [],
    summaryMessage: "Blocked."
  };
  context.data.completionSummary = {
    completionPercent: 48,
    completionStatus: "blocked",
    blockers: ["Revenue available"]
  };
  context.portfolioState = {
    ...context.portfolioState,
    status: "Needs source data",
    currentBlocker: "Missing: Financials"
  };

  const riskSummary = buildDealRiskSummaryFromRuntime(context);
  const workflowState = buildDealWorkflowStateFromRuntime(context);
  const dataQualitySummary = buildDealDataQualitySummaryFromRuntime(context);

  assert.equal(riskSummary.blockerCount, 2);
  assert.equal(workflowState.currentStage, "ingestion");
  assert.equal(dataQualitySummary.isSnapshotReady, false);
  assert.equal(dataQualitySummary.snapshotReason, "Revenue available");
}

console.log("deal-memory runtime tests passed");
