import assert from "node:assert/strict";
import { computeBenchmarkSummary } from "./deal-memory-benchmark.ts";
import type { DealMemorySnapshot } from "./deal-memory.ts";

function createSnapshot(
  overrides?: Partial<DealMemorySnapshot>
): DealMemorySnapshot {
  return {
    dealId: "deal-1",
    companyId: "company-1",
    snapshotAt: "2026-04-16T12:00:00.000Z",
    revenue: 4_000_000,
    ebitda: 800_000,
    adjustedEbitda: 950_000,
    ebitdaMargin: 20,
    industry: "HVAC",
    businessModel: null,
    revenueBand: "1-5M",
    sourceCompletenessScore: 88,
    hasTaxReturns: true,
    hasFinancialStatements: true,
    reconciliationStatus: "balanced",
    addbackCount: 2,
    addbackValue: 150_000,
    addbackTypes: ["owner_related"],
    riskFlags: [],
    blockerCount: 0,
    completionPercent: 90,
    currentStage: "underwriting",
    isSnapshotReady: true,
    isBenchmarkEligible: true,
    financialsConfidence: "high",
    snapshotReason: null,
    ...overrides
  };
}

{
  const summary = computeBenchmarkSummary([
    createSnapshot({
      dealId: "deal-1",
      revenue: 1_000_000,
      ebitda: null,
      adjustedEbitda: 150_000,
      ebitdaMargin: null,
      addbackValue: null,
      completionPercent: 70
    }),
    createSnapshot({
      dealId: "deal-2",
      revenue: null,
      ebitda: 250_000,
      adjustedEbitda: null,
      ebitdaMargin: 25,
      addbackValue: 50_000,
      completionPercent: 80
    }),
    createSnapshot({
      dealId: "deal-3",
      revenue: 3_000_000,
      ebitda: 300_000,
      adjustedEbitda: 320_000,
      ebitdaMargin: 10,
      addbackValue: 120_000,
      completionPercent: 90
    })
  ]);

  assert.equal(summary.peerCount, 3);
  assert.deepEqual(summary.metrics.revenue, {
    median: 2_000_000,
    min: 1_000_000,
    max: 3_000_000,
    count: 2
  });
  assert.deepEqual(summary.metrics.ebitda, {
    median: 275_000,
    min: 250_000,
    max: 300_000,
    count: 2
  });
  assert.deepEqual(summary.metrics.adjustedEbitda, {
    median: 235_000,
    min: 150_000,
    max: 320_000,
    count: 2
  });
  assert.deepEqual(summary.metrics.ebitdaMargin, {
    median: 17.5,
    min: 10,
    max: 25,
    count: 2
  });
  assert.deepEqual(summary.metrics.addbackValue, {
    median: 85_000,
    min: 50_000,
    max: 120_000,
    count: 2
  });
  assert.deepEqual(summary.metrics.completionPercent, {
    median: 80,
    min: 70,
    max: 90,
    count: 3
  });
}

{
  const summary = computeBenchmarkSummary([
    createSnapshot({
      dealId: "deal-1",
      revenue: null,
      ebitda: null,
      adjustedEbitda: null,
      ebitdaMargin: null,
      addbackValue: null
    }),
    createSnapshot({
      dealId: "deal-2",
      revenue: null,
      ebitda: null,
      adjustedEbitda: null,
      ebitdaMargin: null,
      addbackValue: null
    })
  ]);

  assert.equal(summary.metrics.revenue, null);
  assert.equal(summary.metrics.ebitda, null);
  assert.equal(summary.metrics.adjustedEbitda, null);
  assert.equal(summary.metrics.ebitdaMargin, null);
  assert.equal(summary.metrics.addbackValue, null);
  assert.deepEqual(summary.metrics.completionPercent, {
    median: 90,
    min: 90,
    max: 90,
    count: 2
  });
}

{
  const summary = computeBenchmarkSummary([
    createSnapshot({
      dealId: "deal-1",
      revenue: 5_000_000,
      ebitda: 1_000_000,
      adjustedEbitda: 1_100_000,
      ebitdaMargin: 20,
      addbackValue: 100_000,
      completionPercent: 85
    })
  ]);

  assert.deepEqual(summary.metrics.revenue, {
    median: 5_000_000,
    min: 5_000_000,
    max: 5_000_000,
    count: 1
  });
  assert.deepEqual(summary.metrics.ebitdaMargin, {
    median: 20,
    min: 20,
    max: 20,
    count: 1
  });
}

{
  const summary = computeBenchmarkSummary([
    createSnapshot({
      dealId: "deal-1",
      revenue: 1_000_000,
      ebitda: 100_000,
      adjustedEbitda: 120_000,
      ebitdaMargin: 10,
      addbackValue: 20_000,
      completionPercent: 60
    }),
    createSnapshot({
      dealId: "deal-2",
      revenue: 2_000_000,
      ebitda: 300_000,
      adjustedEbitda: 330_000,
      ebitdaMargin: 15,
      addbackValue: 40_000,
      completionPercent: 80
    }),
    createSnapshot({
      dealId: "deal-3",
      revenue: 4_000_000,
      ebitda: 500_000,
      adjustedEbitda: 520_000,
      ebitdaMargin: 12.5,
      addbackValue: 60_000,
      completionPercent: 100
    }),
    createSnapshot({
      dealId: "deal-4",
      revenue: 8_000_000,
      ebitda: 700_000,
      adjustedEbitda: 760_000,
      ebitdaMargin: 8.75,
      addbackValue: 80_000,
      completionPercent: 90
    })
  ]);

  assert.deepEqual(summary.metrics.revenue, {
    median: 3_000_000,
    min: 1_000_000,
    max: 8_000_000,
    count: 4
  });
  assert.deepEqual(summary.metrics.ebitda, {
    median: 400_000,
    min: 100_000,
    max: 700_000,
    count: 4
  });
  assert.deepEqual(summary.metrics.adjustedEbitda, {
    median: 425_000,
    min: 120_000,
    max: 760_000,
    count: 4
  });
  assert.deepEqual(summary.metrics.ebitdaMargin, {
    median: 11.25,
    min: 8.75,
    max: 15,
    count: 4
  });
  assert.deepEqual(summary.metrics.addbackValue, {
    median: 50_000,
    min: 20_000,
    max: 80_000,
    count: 4
  });
  assert.deepEqual(summary.metrics.completionPercent, {
    median: 85,
    min: 60,
    max: 100,
    count: 4
  });
}

console.log("deal-memory benchmark summary tests passed");
