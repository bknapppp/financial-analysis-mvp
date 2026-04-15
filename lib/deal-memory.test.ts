import assert from "node:assert/strict";
import {
  buildDealMemorySnapshotWithHelpers,
  type DealAddbackSummary,
  type DealDataQualitySummary,
  type DealFinancialOutputs,
  type DealRiskSummary,
  type DealWorkflowState
} from "./deal-memory.ts";

function buildHelpers(params?: {
  financialOutputs?: DealFinancialOutputs;
  addbackSummary?: DealAddbackSummary;
  riskSummary?: DealRiskSummary;
  workflowState?: DealWorkflowState;
  dataQualitySummary?: DealDataQualitySummary;
}) {
  return {
    getDealFinancialOutputs: async () =>
      params?.financialOutputs ?? {
        companyId: "company-1",
        revenue: 4_000_000,
        ebitda: 800_000,
        adjustedEbitda: 950_000,
        industry: "HVAC",
        businessModel: "Service",
        reconciliationStatus: "balanced",
        financialsConfidence: "high"
      },
    getDealAddbackSummary: async () =>
      params?.addbackSummary ?? {
        items: []
      },
    getDealRiskSummary: async () =>
      params?.riskSummary ?? {
        riskFlags: [],
        blockerCount: 0
      },
    getDealWorkflowState: async () =>
      params?.workflowState ?? {
        companyId: "company-1",
        completionPercent: 85,
        currentStage: "underwriting",
        snapshotReason: "Quarterly refresh"
      },
    getDealDataQualitySummary: async () =>
      params?.dataQualitySummary ?? {
        sourceCompletenessScore: 88,
        hasTaxReturns: true,
        hasFinancialStatements: true,
        financialsConfidence: "high",
        reconciliationStatus: "balanced"
      },
    now: () => new Date("2026-04-14T21:45:00.000Z")
  };
}

{
  const snapshot = await buildDealMemorySnapshotWithHelpers(
    "deal-missing-ebitda",
    buildHelpers({
      financialOutputs: {
        companyId: "company-1",
        revenue: 4_000_000,
        ebitda: null,
        adjustedEbitda: null,
        industry: "HVAC",
        reconciliationStatus: "partial"
      }
    })
  );

  assert.equal(snapshot.ebitda, null);
  assert.equal(snapshot.ebitdaMargin, null);
}

{
  const snapshot = await buildDealMemorySnapshotWithHelpers(
    "deal-missing-revenue",
    buildHelpers({
      financialOutputs: {
        companyId: "company-1",
        revenue: null,
        ebitda: 500_000,
        adjustedEbitda: 600_000,
        industry: "HVAC",
        reconciliationStatus: "balanced"
      }
    })
  );

  assert.equal(snapshot.revenue, null);
  assert.equal(snapshot.ebitdaMargin, null);
  assert.equal(snapshot.revenueBand, null);
}

{
  const eligibleSnapshot = await buildDealMemorySnapshotWithHelpers(
    "deal-eligible",
    buildHelpers()
  );

  assert.equal(eligibleSnapshot.isSnapshotReady, true);
  assert.equal(eligibleSnapshot.isBenchmarkEligible, true);

  const ineligibleSnapshot = await buildDealMemorySnapshotWithHelpers(
    "deal-ineligible",
    buildHelpers({
      financialOutputs: {
        companyId: "company-1",
        revenue: 4_000_000,
        ebitda: 800_000,
        adjustedEbitda: 950_000,
        industry: null,
        reconciliationStatus: "balanced"
      }
    })
  );

  assert.equal(ineligibleSnapshot.isSnapshotReady, true);
  assert.equal(ineligibleSnapshot.isBenchmarkEligible, false);
  assert.equal(
    ineligibleSnapshot.snapshotReason,
    "Industry is missing, so peer benchmarking would not be comparable."
  );
}

{
  const snapshot = await buildDealMemorySnapshotWithHelpers(
    "deal-addbacks",
    buildHelpers({
      addbackSummary: {
        items: [
          { type: "owner_related", amount: 25_000, status: "accepted" },
          { type: "non_recurring", amount: 15_000, status: "accepted" },
          { type: "owner_related", amount: 10_000, status: "accepted" },
          { type: "discretionary", amount: 8_000, status: "suggested" },
          { type: "non_operating", amount: 12_000, status: "rejected" }
        ]
      }
    })
  );

  assert.equal(snapshot.addbackCount, 3);
  assert.equal(snapshot.addbackValue, 50_000);
  assert.deepEqual(snapshot.addbackTypes, ["non_recurring", "owner_related"]);
}

console.log("deal-memory tests passed");
