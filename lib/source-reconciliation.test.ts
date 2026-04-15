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
  reportedEbitda: 900000,
  adjustedEbitda: 1400000,
  taxResult: baseTaxResult
});

assert.equal(fullResult.revenue.reported, 5200000);
assert.equal(fullResult.revenue.tax, 4600000);
assert.equal(fullResult.revenue.delta, 600000);
assert.equal(fullResult.revenue.deltaPct, 600000 / 5200000);
assert.equal(fullResult.ebitda.reported, 900000);
assert.equal(fullResult.ebitda.adjusted, 1400000);
assert.equal(fullResult.ebitda.tax, 1250000);
assert.equal(fullResult.comparisons.reportedVsTax.delta, -350000);
assert.equal(fullResult.comparisons.adjustedVsTax.delta, 150000);
assert.equal(fullResult.addbacks.amount, 500000);
assert.equal(fullResult.addbacks.pctOfReported, 500000 / 900000);
assert.equal(fullResult.coverage.hasReportedFinancials, true);
assert.equal(fullResult.coverage.hasTaxData, true);
assert.equal(fullResult.coverage.hasAdjustedEBITDA, true);
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
  reportedEbitda: 900000,
  adjustedEbitda: 1400000,
  taxResult: null
});
assert.equal(missingTaxResult.revenue.tax, null);
assert.equal(missingTaxResult.ebitda.tax, null);
assert.equal(missingTaxResult.coverage.hasTaxData, false);
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
  reportedEbitda: 900000,
  adjustedEbitda: null,
  taxResult: baseTaxResult
});
assert.equal(missingAdjustedResult.ebitda.adjusted, null);
assert.equal(missingAdjustedResult.coverage.hasAdjustedEBITDA, false);
assert.equal(missingAdjustedResult.comparisons.adjustedVsTax.delta, null);

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
  reportedEbitda: 0,
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
assert.equal(zeroRevenueResult.comparisons.reportedVsTax.deltaPct, null);

const reportedSnapshot = {
  revenue: 5200000,
  ebitda: 900000,
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
  reportedEbitda: reportedSnapshot.ebitda,
  adjustedEbitda: reportedSnapshot.adjustedEbitda,
  taxResult: baseTaxResult
});
assert.equal(JSON.stringify(reportedSnapshot), reportedSnapshotBefore);

console.log("source-reconciliation tests passed");
