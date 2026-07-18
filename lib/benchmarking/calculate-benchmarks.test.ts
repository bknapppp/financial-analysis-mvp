import assert from "node:assert/strict";
import {
  calculateBenchmarks,
  deriveBenchmarkFinancialCompleteness
} from "./calculate-benchmarks.ts";

{
  const result = calculateBenchmarks({
    industry: "Manufacturing",
    financialCompleteness: "complete",
    metrics: {
      ebitdaMarginPercent: 18,
      evToEbitda: 6.4,
      debtToEbitda: 2.7
    }
  });

  const margin = result.comparisons.find(
    (comparison) => comparison.metricKey === "ebitdaMarginPercent"
  );
  const leverage = result.comparisons.find(
    (comparison) => comparison.metricKey === "debtToEbitda"
  );

  assert.equal(result.industryLabel, "Manufacturing");
  assert.equal(margin?.marketMedian, 14);
  assert.equal(margin?.variance, 4);
  assert.equal(margin?.direction, "above");
  assert.equal(margin?.confidence, "High");
  assert.equal(leverage?.direction, "below");
}

{
  const result = calculateBenchmarks({
    industry: "Unknown",
    financialCompleteness: "complete",
    metrics: {
      ebitdaMarginPercent: 18
    }
  });

  assert.equal(result.supportedComparisons.length, 0);
  assert.equal(result.comparisons[0]?.confidence, "Low");
}

{
  assert.equal(
    deriveBenchmarkFinancialCompleteness({
      revenue: 100,
      ebitda: 20,
      purchasePrice: 110,
      debt: 55
    }),
    "complete"
  );
  assert.equal(
    deriveBenchmarkFinancialCompleteness({
      revenue: 100,
      ebitda: 20,
      purchasePrice: null,
      debt: null
    }),
    "partial"
  );
}

console.log("calculate-benchmarks tests passed");
