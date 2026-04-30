import assert from "node:assert/strict";
import { buildSourceReconciliation } from "./source-reconciliation.ts";
import type { TaxDerivedEbitdaResult } from "./tax-ebitda.ts";

const baseTaxResult: TaxDerivedEbitdaResult = {
  companyId: "company-1",
  sourceType: "tax_return",
  sourcePeriodId: "tax-period-1",
  periodLabel: "FY2023",
  periodDate: "2023-12-31",
  entryCount: 5,
  components: {
    rawSigned: {
      grossRevenue: 4600000,
      contraRevenue: 0,
      netRevenue: 4600000,
      cogs: -2500000,
      grossProfit: 2100000,
      officerCompensation: -200000,
      salariesAndWages: -450000,
      rent: -100000,
      advertising: 0,
      repairsAndMaintenance: 0,
      utilities: 0,
      insurance: 0,
      taxesAndLicenses: 0,
      payrollTaxesAndBenefits: 0,
      meals: -10000,
      travel: 0,
      otherDeductions: -90000,
      operatingExpensesOther: 0,
      operatingExpensesBeforeDandA: -850000,
      depreciation: -50000,
      amortization: 0,
      section179: 0,
      interest: -30000,
      incomeTaxes: 0,
      nonOperatingOther: 0
    },
    display: {
      grossRevenue: 4600000,
      contraRevenue: 0,
      netRevenue: 4600000,
      cogs: 2500000,
      grossProfit: 2100000,
      officerCompensation: 200000,
      salariesAndWages: 450000,
      rent: 100000,
      advertising: 0,
      repairsAndMaintenance: 0,
      utilities: 0,
      insurance: 0,
      taxesAndLicenses: 0,
      payrollTaxesAndBenefits: 0,
      meals: 10000,
      travel: 0,
      otherDeductions: 90000,
      operatingExpensesOther: 0,
      operatingExpensesBeforeDandA: 850000,
      depreciation: 50000,
      amortization: 0,
      section179: 0,
      interest: 30000,
      incomeTaxes: 0,
      nonOperatingOther: 0
    }
  },
  formula: {
    signConvention:
      "Revenue is expected as positive. Expense-like inputs such as COGS, operating expenses, depreciation, amortization, and interest are stored as signed negatives in the raw components.",
    humanReadableFormula:
      "EBITDA = Net Revenue - COGS - Operating Expenses (before D&A) + Depreciation + Amortization",
    humanReadableFormulaIncludingInterest:
      "EBITDA + Interest = Net Revenue - COGS - Operating Expenses (before D&A) + Depreciation + Amortization + Interest",
    interestIncludedInStandardEBITDA: false,
    interestIncludedInAlternateMetric: true,
    calculationSteps: []
  },
  taxDerivedEBITDA: 1250000,
  taxDerivedEBITDAIncludingInterest: 1280000,
  normalization: {
    appliedAdjustments: [],
    flaggedCandidates: [],
    normalizedTaxEBITDA: 1250000
  },
  coverage: {
    computable: true,
    status: "complete",
    requiredComponentsFound: [
      "grossRevenue",
      "cogs",
      "operatingExpensesBeforeDandA",
      "depreciation",
      "interest"
    ],
    missingComponents: ["contraRevenue", "amortization", "incomeTaxes"],
    confidenceNote: "Complete enough for comparison.",
    notes: []
  },
  traceRows: []
};

const fullResult = buildSourceReconciliation({
  companyId: "company-1",
  periodId: "reported-period-1",
  reportedPeriod: {
    id: "reported-period-1",
    company_id: "company-1",
    label: "FY2023",
    period_date: "2023-12-31",
    created_at: "2026-04-09T00:00:00.000Z"
  },
  reportedRevenue: 5200000,
  reconstructedEbitda: 900000,
  reportedEbitdaReference: 950000,
  adjustedEbitda: 1400000,
  taxResult: baseTaxResult
});

assert.equal(fullResult.revenue.reported, 5200000);
assert.equal(fullResult.revenue.tax, 4600000);
assert.equal(fullResult.revenue.delta, 600000);
assert.equal(fullResult.revenue.deltaPct, 600000 / 5200000);
assert.equal(fullResult.ebitda.computed, 900000);
assert.equal(fullResult.ebitda.reportedReference, 950000);
assert.equal(fullResult.ebitda.adjusted, 1400000);
assert.equal(fullResult.ebitda.tax, 1250000);
assert.equal(fullResult.comparisons.reportedReferenceVsTax.delta, -300000);
assert.equal(fullResult.comparisons.reportedReferenceVsTax.deltaPct, 300000 / 950000);
assert.equal(fullResult.comparisons.computedVsTax.delta, -350000);
assert.equal(fullResult.comparisons.computedVsTax.deltaPct, 350000 / 900000);
assert.equal(fullResult.comparisons.adjustedVsTax.delta, 150000);
assert.equal(fullResult.addbacks.amount, 500000);
assert.equal(fullResult.addbacks.pctOfComputed, 500000 / 900000);
assert.equal(fullResult.coverage.hasReportedFinancials, true);
assert.equal(fullResult.coverage.hasTaxData, true);
assert.equal(fullResult.coverage.hasAdjustedEBITDA, true);
assert.equal(fullResult.coverage.hasReportedEbitdaReference, true);
assert.equal(fullResult.explainability.taxCoverageStatus, "complete");
assert.deepEqual(fullResult.explainability.requiredComponentsFound, [
  "grossRevenue",
  "cogs",
  "operatingExpensesBeforeDandA",
  "depreciation",
  "interest"
]);
assert.equal(fullResult.explainability.comparisonContext?.reportedEbitdaReference, 950000);
assert.equal(fullResult.explainability.comparisonContext?.taxEbitda, 1250000);
assert.ok(
  fullResult.flags.some((flag) => flag.type === "tax_revenue_lower_than_reported")
);
assert.ok(
  fullResult.flags.some((flag) => flag.type === "high_addback_percentage")
);
assert.equal(fullResult.traceability.taxDerivedEbitdaSource, "taxDerivedEBITDA");
assert.equal(fullResult.traceability.taxDerivedEbitdaIncludingInterest, 1280000);

const missingTaxResult = buildSourceReconciliation({
  companyId: "company-1",
  periodId: "reported-period-1",
  reportedPeriod: {
    id: "reported-period-1",
    company_id: "company-1",
    label: "FY2023",
    period_date: "2023-12-31",
    created_at: "2026-04-09T00:00:00.000Z"
  },
  reportedRevenue: 5200000,
  reconstructedEbitda: 900000,
  reportedEbitdaReference: 950000,
  adjustedEbitda: 1400000,
  taxResult: null
});
assert.equal(missingTaxResult.revenue.tax, null);
assert.equal(missingTaxResult.ebitda.tax, null);
assert.equal(missingTaxResult.coverage.hasTaxData, false);
assert.equal(missingTaxResult.coverage.hasReportedEbitdaReference, true);
assert.equal(missingTaxResult.explainability.taxCoverageStatus, "not_loaded");
assert.equal(missingTaxResult.explainability.comparisonContext, null);
assert.equal(missingTaxResult.flags.length, 1);
assert.equal(missingTaxResult.flags[0]?.type, "high_addback_percentage");

const missingAdjustedResult = buildSourceReconciliation({
  companyId: "company-1",
  periodId: "reported-period-1",
  reportedPeriod: {
    id: "reported-period-1",
    company_id: "company-1",
    label: "FY2023",
    period_date: "2023-12-31",
    created_at: "2026-04-09T00:00:00.000Z"
  },
  reportedRevenue: 5200000,
  reconstructedEbitda: 900000,
  reportedEbitdaReference: 950000,
  adjustedEbitda: null,
  taxResult: baseTaxResult
});
assert.equal(missingAdjustedResult.ebitda.adjusted, null);
assert.equal(missingAdjustedResult.coverage.hasAdjustedEBITDA, false);
assert.equal(missingAdjustedResult.comparisons.adjustedVsTax.delta, null);

const missingComputedResult = buildSourceReconciliation({
  companyId: "company-1",
  periodId: "reported-period-1",
  reportedPeriod: {
    id: "reported-period-1",
    company_id: "company-1",
    label: "FY2023",
    period_date: "2023-12-31",
    created_at: "2026-04-09T00:00:00.000Z"
  },
  reportedRevenue: 5200000,
  reconstructedEbitda: null,
  reportedEbitdaReference: 950000,
  adjustedEbitda: null,
  taxResult: baseTaxResult
});
assert.equal(missingComputedResult.comparisons.computedVsTax.delta, null);
assert.equal(missingComputedResult.addbacks.amount, null);
assert.equal(missingComputedResult.addbacks.pctOfComputed, null);

const zeroRevenueResult = buildSourceReconciliation({
  companyId: "company-1",
  periodId: "reported-period-2",
  reportedPeriod: {
    id: "reported-period-2",
    company_id: "company-1",
    label: "Zero Revenue",
    period_date: "2023-11-30",
    created_at: "2026-04-09T00:00:00.000Z"
  },
  reportedRevenue: 0,
  reconstructedEbitda: 0,
  reportedEbitdaReference: 0,
  adjustedEbitda: 0,
  taxResult: {
    ...baseTaxResult,
    sourcePeriodId: "tax-period-2",
    taxDerivedEBITDA: 0,
    taxDerivedEBITDAIncludingInterest: 0,
    components: {
      ...baseTaxResult.components,
      rawSigned: {
        ...baseTaxResult.components.rawSigned,
        grossRevenue: 0,
        netRevenue: 0
      },
      display: {
        ...baseTaxResult.components.display,
        grossRevenue: 0,
        netRevenue: 0
      }
    }
  }
});
assert.equal(zeroRevenueResult.revenue.deltaPct, null);
assert.equal(zeroRevenueResult.comparisons.computedVsTax.deltaPct, null);

const normalizedSignConventionResult = buildSourceReconciliation({
  companyId: "company-1",
  periodId: "reported-period-3",
  reportedPeriod: {
    id: "reported-period-3",
    company_id: "company-1",
    label: "FY2023 alt signs",
    period_date: "2023-12-31",
    created_at: "2026-04-09T00:00:00.000Z"
  },
  reportedRevenue: -5200000,
  reconstructedEbitda: 900000,
  reportedEbitdaReference: -950000,
  adjustedEbitda: 1400000,
  taxResult: baseTaxResult
});
assert.equal(normalizedSignConventionResult.revenue.reported, 5200000);
assert.equal(
  normalizedSignConventionResult.comparisons.reportedReferenceVsTax.delta,
  fullResult.comparisons.reportedReferenceVsTax.delta
);
assert.equal(
  normalizedSignConventionResult.comparisons.reportedReferenceVsTax.deltaPct,
  fullResult.comparisons.reportedReferenceVsTax.deltaPct
);
assert.equal(
  normalizedSignConventionResult.revenue.deltaPct,
  fullResult.revenue.deltaPct
);

const taxHigherResult = buildSourceReconciliation({
  companyId: "company-1",
  periodId: "reported-period-5",
  reportedPeriod: {
    id: "reported-period-5",
    company_id: "company-1",
    label: "Tax higher",
    period_date: "2023-09-30",
    created_at: "2026-04-09T00:00:00.000Z"
  },
  reportedRevenue: 1000,
  reconstructedEbitda: 1000,
  reportedEbitdaReference: 1000,
  adjustedEbitda: 1000,
  taxResult: {
    ...baseTaxResult,
    sourcePeriodId: "tax-period-5",
    taxDerivedEBITDA: 1200,
    taxDerivedEBITDAIncludingInterest: 1200,
    components: {
      ...baseTaxResult.components,
      rawSigned: {
        ...baseTaxResult.components.rawSigned,
        grossRevenue: 1200,
        netRevenue: 1200
      },
      display: {
        ...baseTaxResult.components.display,
        grossRevenue: 1200,
        netRevenue: 1200
      }
    }
  }
});
assert.equal(taxHigherResult.revenue.delta, -200);
assert.equal(taxHigherResult.revenue.deltaPct, 0.2);
assert.equal(taxHigherResult.comparisons.computedVsTax.delta, -200);
assert.equal(taxHigherResult.comparisons.computedVsTax.deltaPct, 0.2);
assert.ok(
  taxHigherResult.flags.some((flag) => flag.type === "tax_revenue_lower_than_reported")
);
assert.ok(
  taxHigherResult.flags.some((flag) => flag.type === "tax_ebitda_lower_than_computed")
);

const negativeBaseResult = buildSourceReconciliation({
  companyId: "company-1",
  periodId: "reported-period-4",
  reportedPeriod: {
    id: "reported-period-4",
    company_id: "company-1",
    label: "Loss period",
    period_date: "2023-10-31",
    created_at: "2026-04-09T00:00:00.000Z"
  },
  reportedRevenue: 1000,
  reconstructedEbitda: -100,
  reportedEbitdaReference: -100,
  adjustedEbitda: -80,
  taxResult: {
    ...baseTaxResult,
    sourcePeriodId: "tax-period-4",
    taxDerivedEBITDA: -120,
    taxDerivedEBITDAIncludingInterest: -100,
    components: {
      ...baseTaxResult.components,
      rawSigned: {
        ...baseTaxResult.components.rawSigned,
        netRevenue: 1000
      },
      display: {
        ...baseTaxResult.components.display,
        netRevenue: 1000
      }
    }
  }
});
assert.equal(negativeBaseResult.comparisons.computedVsTax.delta, 20);
assert.equal(negativeBaseResult.comparisons.computedVsTax.deltaPct, 0.2);
assert.equal(negativeBaseResult.flags[0]?.type, "tax_ebitda_lower_than_computed");

const reportedSnapshot = {
  revenue: 5200000,
  ebitda: 900000,
  reportedEbitda: 950000,
  adjustedEbitda: 1400000
};
const reportedSnapshotBefore = JSON.stringify(reportedSnapshot);
void buildSourceReconciliation({
  companyId: "company-1",
  periodId: "reported-period-1",
  reportedPeriod: {
    id: "reported-period-1",
    company_id: "company-1",
    label: "FY2023",
    period_date: "2023-12-31",
    created_at: "2026-04-09T00:00:00.000Z"
  },
  reportedRevenue: reportedSnapshot.revenue,
  reconstructedEbitda: reportedSnapshot.ebitda,
  reportedEbitdaReference: reportedSnapshot.reportedEbitda,
  adjustedEbitda: reportedSnapshot.adjustedEbitda,
  taxResult: baseTaxResult
});
assert.equal(JSON.stringify(reportedSnapshot), reportedSnapshotBefore);

console.log("source-reconciliation tests passed");
