import assert from "node:assert/strict";
import { buildEmptyTaxSourceStatus, buildTaxSourceStatus } from "./tax-source-status.ts";
import type { SourceFinancialContext } from "./types.ts";

const taxContext: SourceFinancialContext = {
  sourceType: "tax_return",
  periods: [
    {
      id: "tax-period-1",
      source_document_id: "doc-1",
      label: "FY2024",
      period_date: "2024-12-31",
      source_period_label: "FY2024",
      source_year: 2024,
      created_at: "2026-04-20T00:00:00.000Z",
      source_type: "tax_return",
      source_file_name: "tax.pdf",
      upload_id: "upload-1",
      source_currency: "USD",
      source_confidence: "high"
    }
  ],
  documents: [
    {
      id: "doc-1",
      company_id: "company-1",
      source_type: "tax_return",
      source_file_name: "tax.pdf",
      upload_id: "upload-1",
      source_currency: "USD",
      source_confidence: "high",
      created_at: "2026-04-20T00:00:00.000Z"
    }
  ],
  entries: [
    {
      id: "entry-1",
      account_name: "Gross receipts",
      statement_type: "income",
      amount: 1000,
      category: "Revenue",
      addback_flag: false,
      matched_by: "manual",
      confidence: "high",
      mapping_explanation: "Mapped revenue line.",
      created_at: "2026-04-20T00:00:00.000Z",
      source_period_id: "tax-period-1",
      source_document_id: "doc-1",
      source_type: "tax_return",
      source_file_name: "tax.pdf",
      upload_id: "upload-1",
      source_period_label: "FY2024",
      source_year: 2024,
      source_currency: "USD",
      source_confidence: "high"
    }
  ]
};

const empty = buildEmptyTaxSourceStatus();
assert.equal(empty.comparisonComputable, false);
assert.equal(empty.taxCoverageStatus, "not_loaded");
assert.deepEqual(empty.requiredComponentsFound, []);
assert.equal(empty.comparisonContext, null);

const missingReportedSide = buildTaxSourceStatus({
  taxContext,
  matchedPeriodLabel: "FY2024",
  comparisonComputable: false,
  comparisonMissingComponents: ["Reported EBITDA reference is missing for the matched period."],
  comparisonNotes: ["Tax-side coverage is complete, but the reported side is incomplete."],
  revenueDeltaPercent: 0.02,
  reportedEbitdaDeltaPercent: null,
  computedEbitdaDeltaPercent: null,
  adjustedEbitdaDeltaPercent: null,
  requiredComponentsFound: ["grossRevenue", "cogs", "operatingExpensesBeforeDandA"],
  taxCoverageStatus: "complete",
  comparisonContext: {
    reportedRevenue: 1200,
    taxRevenue: 1000,
    computedEbitda: 300,
    reportedEbitdaReference: null,
    adjustedEbitda: 320,
    taxEbitda: 280,
    taxEbitdaIncludingInterest: 290
  }
});

assert.equal(missingReportedSide.comparisonStatus, "partial");
assert.equal(missingReportedSide.comparisonComputable, false);
assert.ok(
  missingReportedSide.missingComponents.includes(
    "Reported EBITDA reference is missing for the matched period."
  )
);
assert.deepEqual(missingReportedSide.requiredComponentsFound, [
  "grossRevenue",
  "cogs",
  "operatingExpensesBeforeDandA"
]);
assert.equal(missingReportedSide.taxCoverageStatus, "complete");
assert.equal(missingReportedSide.comparisonContext?.taxEbitda, 280);
assert.equal(missingReportedSide.notes[0], "Tax-side coverage is complete, but the reported side is incomplete.");

const ready = buildTaxSourceStatus({
  taxContext,
  matchedPeriodLabel: "FY2024",
  comparisonComputable: true,
  comparisonMissingComponents: [],
  comparisonNotes: ["Coverage is complete on both sides."],
  revenueDeltaPercent: 0.02,
  reportedEbitdaDeltaPercent: 0.04,
  computedEbitdaDeltaPercent: 0.06,
  adjustedEbitdaDeltaPercent: 0.1,
  requiredComponentsFound: ["grossRevenue", "cogs", "operatingExpensesBeforeDandA"],
  taxCoverageStatus: "complete",
  comparisonContext: {
    reportedRevenue: 1200,
    taxRevenue: 1000,
    computedEbitda: 300,
    reportedEbitdaReference: 310,
    adjustedEbitda: 320,
    taxEbitda: 280,
    taxEbitdaIncludingInterest: 290
  }
});

assert.equal(ready.comparisonStatus, "ready");
assert.equal(ready.comparisonComputable, true);
assert.equal(ready.reportedEbitdaDeltaPercent, 0.04);
assert.equal(ready.comparisonContext?.reportedEbitdaReference, 310);

console.log("tax-source-status tests passed");
