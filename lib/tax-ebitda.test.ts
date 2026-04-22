import assert from "node:assert/strict";
import { buildManualTaxDevFixtures, buildManualTaxIngestionPlan } from "./manual-tax-ingestion.ts";
import { calculateTaxDerivedEbitda, classifyTaxEbitdaBucket } from "./tax-ebitda.ts";
import type { SourceFinancialEntry } from "./types.ts";

async function buildSourceEntriesFromFixture(params: {
  companyId: string;
  fixtureIndex: number;
  periodLabel: string;
}) {
  const fixture = buildManualTaxDevFixtures(params.companyId)[params.fixtureIndex];
  assert.ok(fixture, "Expected tax dev fixture");

  const plan = await buildManualTaxIngestionPlan(fixture, {
    savedMappings: []
  });
  const period = plan.periods.find((candidate) => candidate.label === params.periodLabel);
  assert.ok(period, `Expected period ${params.periodLabel}`);

  const sourcePeriodId = `source-period-${params.periodLabel}`;
  const entries: SourceFinancialEntry[] = period!.entries.map((entry, index) => ({
    id: `entry-${params.periodLabel}-${index + 1}`,
    account_name: entry.rawAccountName,
    statement_type: "income",
    amount: entry.amount,
    category: entry.mappedCategory,
    addback_flag: false,
    matched_by: entry.mappingMethod,
    confidence: entry.mappingConfidence,
    mapping_explanation: entry.mappingExplanation,
    created_at: "2026-04-09T00:00:00.000Z",
    source_period_id: sourcePeriodId,
    source_document_id: "source-document-1",
    source_type: "tax_return",
    source_file_name: fixture.sourceFileName ?? null,
    upload_id: fixture.uploadId ?? null,
    source_period_label: period!.sourcePeriodLabel,
    source_year: period!.sourceYear,
    source_currency: fixture.sourceCurrency ?? null,
    source_confidence: fixture.sourceConfidence ?? null
  }));

  return {
    sourcePeriodId,
    period: {
      label: period!.label,
      period_date: period!.periodDate
    },
    entries
  };
}

const companyId = "company-ebitda-test";
const fy2023 = await buildSourceEntriesFromFixture({
  companyId,
  fixtureIndex: 1,
  periodLabel: "FY2023"
});

const fy2023Result = calculateTaxDerivedEbitda({
  companyId,
  sourcePeriodId: fy2023.sourcePeriodId,
  period: fy2023.period,
  entries: fy2023.entries
});

assert.equal(fy2023Result.components.rawSigned.grossRevenue, 5200000);
assert.equal(fy2023Result.components.rawSigned.contraRevenue, -100000);
assert.equal(fy2023Result.components.rawSigned.netRevenue, 5100000);
assert.equal(fy2023Result.components.rawSigned.cogs, -2800000);
assert.equal(fy2023Result.components.rawSigned.grossProfit, 2300000);
assert.equal(fy2023Result.components.rawSigned.officerCompensation, -450000);
assert.equal(fy2023Result.components.rawSigned.salariesAndWages, -600000);
assert.equal(fy2023Result.components.rawSigned.rent, -120000);
assert.equal(fy2023Result.components.rawSigned.meals, -20000);
assert.equal(fy2023Result.components.rawSigned.otherDeductions, -150000);
assert.equal(fy2023Result.components.rawSigned.operatingExpensesBeforeDandA, -1340000);
assert.equal(fy2023Result.components.rawSigned.depreciation, -90000);
assert.equal(fy2023Result.components.rawSigned.interest, -70000);
assert.equal(fy2023Result.components.display.cogs, 2800000);
assert.equal(fy2023Result.components.display.operatingExpensesBeforeDandA, 1340000);
assert.equal(fy2023Result.components.display.depreciation, 90000);
assert.equal(fy2023Result.components.display.interest, 70000);
assert.equal(fy2023Result.taxDerivedEBITDA, 1050000);
assert.equal(fy2023Result.taxDerivedEBITDAIncludingInterest, 1120000);
assert.equal(fy2023Result.normalization.normalizedTaxEBITDA, 1050000);
assert.equal(fy2023Result.coverage.status, "complete");
assert.equal(
  fy2023Result.formula.humanReadableFormula,
  "EBITDA = Net Revenue - COGS - Operating Expenses (before D&A) + Depreciation + Amortization"
);
assert.equal(
  fy2023Result.formula.humanReadableFormulaIncludingInterest,
  "EBITDA + Interest = Net Revenue - COGS - Operating Expenses (before D&A) + Depreciation + Amortization + Interest"
);
assert.equal(fy2023Result.formula.interestIncludedInStandardEBITDA, false);
assert.equal(fy2023Result.formula.interestIncludedInAlternateMetric, true);

const normalizationTypes = fy2023Result.normalization.flaggedCandidates.map(
  (candidate) => candidate.type
);
assert.ok(normalizationTypes.includes("officer_compensation"));
assert.ok(normalizationTypes.includes("meals"));
assert.ok(normalizationTypes.includes("other_deductions"));

const depreciationTrace = fy2023Result.traceRows.find(
  (row) => row.accountName === "Depreciation"
);
assert.equal(depreciationTrace?.bucket, "depreciation");

const interestTrace = fy2023Result.traceRows.find((row) => row.accountName === "Interest");
assert.equal(interestTrace?.bucket, "interest");

const cogsPriorityOverRevenueResult = classifyTaxEbitdaBucket({
  id: "cogs-priority-1",
  account_name: "Cost of sales",
  statement_type: "income",
  amount: -125000,
  category: "Revenue",
  addback_flag: false,
  matched_by: "keyword_rule",
  confidence: "high",
  mapping_explanation: "Broad sales matcher might otherwise map this to Revenue.",
  created_at: "2026-04-09T00:00:00.000Z",
  source_period_id: "priority-period",
  source_document_id: "priority-doc",
  source_type: "tax_return",
  source_file_name: "priority.json",
  upload_id: "priority-upload",
  source_period_label: "Tax Year 2023",
  source_year: 2023,
  source_currency: "USD",
  source_confidence: "unknown"
});
assert.equal(
  cogsPriorityOverRevenueResult.bucket,
  "cogs",
  "Cost of sales must classify as COGS before any broad sales-based revenue rule."
);

const costOfRevenueClassification = classifyTaxEbitdaBucket({
  id: "cogs-priority-2",
  account_name: "Cost of revenue",
  statement_type: "income",
  amount: -90000,
  category: "Revenue",
  addback_flag: false,
  matched_by: "keyword_rule",
  confidence: "high",
  mapping_explanation: "Explicit COGS synonym should not fall through to Revenue.",
  created_at: "2026-04-09T00:00:00.000Z",
  source_period_id: "priority-period",
  source_document_id: "priority-doc",
  source_type: "tax_return",
  source_file_name: "priority.json",
  upload_id: "priority-upload",
  source_period_label: "Tax Year 2023",
  source_year: 2023,
  source_currency: "USD",
  source_confidence: "unknown"
});
assert.equal(costOfRevenueClassification.bucket, "cogs");

const cogsAcronymClassification = classifyTaxEbitdaBucket({
  id: "cogs-priority-3",
  account_name: "COGS",
  statement_type: "income",
  amount: -50000,
  category: "Revenue",
  addback_flag: false,
  matched_by: "keyword_rule",
  confidence: "high",
  mapping_explanation: "Acronym must map to COGS regardless of upstream category noise.",
  created_at: "2026-04-09T00:00:00.000Z",
  source_period_id: "priority-period",
  source_document_id: "priority-doc",
  source_type: "tax_return",
  source_file_name: "priority.json",
  upload_id: "priority-upload",
  source_period_label: "Tax Year 2023",
  source_year: 2023,
  source_currency: "USD",
  source_confidence: "unknown"
});
assert.equal(cogsAcronymClassification.bucket, "cogs");

const partialEntries: SourceFinancialEntry[] = [
  {
    id: "partial-1",
    account_name: "Gross receipts",
    statement_type: "income",
    amount: 1000000,
    category: "Revenue",
    addback_flag: false,
    matched_by: "keyword_rule",
    confidence: "high",
    mapping_explanation: "Mapped tax revenue line to canonical Revenue.",
    created_at: "2026-04-09T00:00:00.000Z",
    source_period_id: "partial-period",
    source_document_id: "partial-doc",
    source_type: "tax_return",
    source_file_name: "partial.json",
    upload_id: "partial-upload",
    source_period_label: "Tax Year 2023",
    source_year: 2023,
    source_currency: "USD",
    source_confidence: "unknown"
  },
  {
    id: "partial-2",
    account_name: "Rent",
    statement_type: "income",
    amount: -100000,
    category: "Operating Expenses",
    addback_flag: false,
    matched_by: "keyword_rule",
    confidence: "high",
    mapping_explanation: "Mapped rent tax line to Operating Expenses.",
    created_at: "2026-04-09T00:00:00.000Z",
    source_period_id: "partial-period",
    source_document_id: "partial-doc",
    source_type: "tax_return",
    source_file_name: "partial.json",
    upload_id: "partial-upload",
    source_period_label: "Tax Year 2023",
    source_year: 2023,
    source_currency: "USD",
    source_confidence: "unknown"
  }
];

const partialResult = calculateTaxDerivedEbitda({
  companyId,
  sourcePeriodId: "partial-period",
  period: {
    label: "FY2023 Partial",
    period_date: "2023-12-31"
  },
  entries: partialEntries
});

assert.equal(partialResult.taxDerivedEBITDA, null);
assert.equal(partialResult.coverage.status, "partial");
assert.ok(partialResult.coverage.missingComponents.includes("cogs"));
assert.ok(
  partialResult.coverage.notes.some((note) => note.includes("not complete"))
);

const fy2022 = await buildSourceEntriesFromFixture({
  companyId,
  fixtureIndex: 1,
  periodLabel: "FY2022"
});
const fy2022Result = calculateTaxDerivedEbitda({
  companyId,
  sourcePeriodId: fy2022.sourcePeriodId,
  period: fy2022.period,
  entries: fy2022.entries
});

assert.equal(fy2022Result.taxDerivedEBITDA, 1370000);
assert.equal(fy2022Result.taxDerivedEBITDAIncludingInterest, 1434000);
assert.notEqual(fy2022Result.taxDerivedEBITDA, fy2023Result.taxDerivedEBITDA);

const reportedFinancialsSnapshot = {
  sourceType: "reported_financials" as const,
  ebitda: 123456,
  entries: [{ accountName: "Revenue", amount: 1000 }]
};
const reportedSnapshotBefore = JSON.stringify(reportedFinancialsSnapshot);
void calculateTaxDerivedEbitda({
  companyId,
  sourcePeriodId: fy2023.sourcePeriodId,
  period: fy2023.period,
  entries: fy2023.entries
});
assert.equal(JSON.stringify(reportedFinancialsSnapshot), reportedSnapshotBefore);

const emptyResult = calculateTaxDerivedEbitda({
  companyId,
  sourcePeriodId: "empty-period",
  period: {
    label: "Empty",
    period_date: "2023-12-31"
  },
  entries: []
});
assert.equal(emptyResult.taxDerivedEBITDA, null);
assert.equal(emptyResult.taxDerivedEBITDAIncludingInterest, null);
assert.equal(emptyResult.coverage.computable, false);
assert.equal(emptyResult.coverage.status, "insufficient");
assert.equal(emptyResult.normalization.normalizedTaxEBITDA, null);

const explicitZeroComponentResult = calculateTaxDerivedEbitda({
  companyId,
  sourcePeriodId: "zero-components-period",
  period: {
    label: "Zero Components",
    period_date: "2023-12-31"
  },
  entries: [
    {
      id: "zero-1",
      account_name: "Gross receipts",
      statement_type: "income",
      amount: 0,
      category: "Revenue",
      addback_flag: false,
      matched_by: "keyword_rule",
      confidence: "high",
      mapping_explanation: "Zero revenue line is explicitly present.",
      created_at: "2026-04-09T00:00:00.000Z",
      source_period_id: "zero-components-period",
      source_document_id: "zero-doc",
      source_type: "tax_return",
      source_file_name: "zero.json",
      upload_id: "zero-upload",
      source_period_label: "Tax Year 2023",
      source_year: 2023,
      source_currency: "USD",
      source_confidence: "unknown"
    },
    {
      id: "zero-2",
      account_name: "Cost of goods sold",
      statement_type: "income",
      amount: 0,
      category: "COGS",
      addback_flag: false,
      matched_by: "keyword_rule",
      confidence: "high",
      mapping_explanation: "Zero COGS line is explicitly present.",
      created_at: "2026-04-09T00:00:00.000Z",
      source_period_id: "zero-components-period",
      source_document_id: "zero-doc",
      source_type: "tax_return",
      source_file_name: "zero.json",
      upload_id: "zero-upload",
      source_period_label: "Tax Year 2023",
      source_year: 2023,
      source_currency: "USD",
      source_confidence: "unknown"
    },
    {
      id: "zero-3",
      account_name: "Rent",
      statement_type: "income",
      amount: 0,
      category: "Operating Expenses",
      addback_flag: false,
      matched_by: "keyword_rule",
      confidence: "high",
      mapping_explanation: "Zero operating expense line is explicitly present.",
      created_at: "2026-04-09T00:00:00.000Z",
      source_period_id: "zero-components-period",
      source_document_id: "zero-doc",
      source_type: "tax_return",
      source_file_name: "zero.json",
      upload_id: "zero-upload",
      source_period_label: "Tax Year 2023",
      source_year: 2023,
      source_currency: "USD",
      source_confidence: "unknown"
    }
  ]
});
assert.equal(explicitZeroComponentResult.taxDerivedEBITDA, 0);
assert.equal(explicitZeroComponentResult.coverage.computable, true);
assert.equal(explicitZeroComponentResult.coverage.status, "complete");
assert.ok(explicitZeroComponentResult.coverage.requiredComponentsFound.includes("grossRevenue"));
assert.ok(explicitZeroComponentResult.coverage.requiredComponentsFound.includes("cogs"));
assert.ok(
  explicitZeroComponentResult.coverage.requiredComponentsFound.includes(
    "operatingExpensesBeforeDandA"
  )
);
assert.ok(!explicitZeroComponentResult.coverage.missingComponents.includes("cogs"));

const explicitSignConventionResult = calculateTaxDerivedEbitda({
  companyId,
  sourcePeriodId: "sign-test-period",
  period: {
    label: "Sign Test",
    period_date: "2023-12-31"
  },
  entries: [
    {
      id: "sign-1",
      account_name: "Gross receipts",
      statement_type: "income",
      amount: 1000,
      category: "Revenue",
      addback_flag: false,
      matched_by: "keyword_rule",
      confidence: "high",
      mapping_explanation: "Revenue sign test",
      created_at: "2026-04-09T00:00:00.000Z",
      source_period_id: "sign-test-period",
      source_document_id: "sign-test-doc",
      source_type: "tax_return",
      source_file_name: "sign-test.json",
      upload_id: "sign-test-upload",
      source_period_label: "Tax Year 2023",
      source_year: 2023,
      source_currency: "USD",
      source_confidence: "unknown"
    },
    {
      id: "sign-2",
      account_name: "Cost of goods sold",
      statement_type: "income",
      amount: -400,
      category: "COGS",
      addback_flag: false,
      matched_by: "keyword_rule",
      confidence: "high",
      mapping_explanation: "COGS sign test",
      created_at: "2026-04-09T00:00:00.000Z",
      source_period_id: "sign-test-period",
      source_document_id: "sign-test-doc",
      source_type: "tax_return",
      source_file_name: "sign-test.json",
      upload_id: "sign-test-upload",
      source_period_label: "Tax Year 2023",
      source_year: 2023,
      source_currency: "USD",
      source_confidence: "unknown"
    },
    {
      id: "sign-3",
      account_name: "Rent",
      statement_type: "income",
      amount: -300,
      category: "Operating Expenses",
      addback_flag: false,
      matched_by: "keyword_rule",
      confidence: "high",
      mapping_explanation: "OpEx sign test",
      created_at: "2026-04-09T00:00:00.000Z",
      source_period_id: "sign-test-period",
      source_document_id: "sign-test-doc",
      source_type: "tax_return",
      source_file_name: "sign-test.json",
      upload_id: "sign-test-upload",
      source_period_label: "Tax Year 2023",
      source_year: 2023,
      source_currency: "USD",
      source_confidence: "unknown"
    },
    {
      id: "sign-4",
      account_name: "Depreciation",
      statement_type: "income",
      amount: -50,
      category: "Depreciation / Amortization",
      addback_flag: false,
      matched_by: "keyword_rule",
      confidence: "high",
      mapping_explanation: "Depreciation sign test",
      created_at: "2026-04-09T00:00:00.000Z",
      source_period_id: "sign-test-period",
      source_document_id: "sign-test-doc",
      source_type: "tax_return",
      source_file_name: "sign-test.json",
      upload_id: "sign-test-upload",
      source_period_label: "Tax Year 2023",
      source_year: 2023,
      source_currency: "USD",
      source_confidence: "unknown"
    },
    {
      id: "sign-5",
      account_name: "Interest",
      statement_type: "income",
      amount: -20,
      category: "Non-operating",
      addback_flag: false,
      matched_by: "keyword_rule",
      confidence: "high",
      mapping_explanation: "Interest sign test",
      created_at: "2026-04-09T00:00:00.000Z",
      source_period_id: "sign-test-period",
      source_document_id: "sign-test-doc",
      source_type: "tax_return",
      source_file_name: "sign-test.json",
      upload_id: "sign-test-upload",
      source_period_label: "Tax Year 2023",
      source_year: 2023,
      source_currency: "USD",
      source_confidence: "unknown"
    }
  ]
});
assert.equal(
  explicitSignConventionResult.taxDerivedEBITDA,
  350,
  "Standard tax-derived EBITDA excludes interest, so 1000 - 400 - 300 + 50 + 0 = 350."
);
assert.equal(
  explicitSignConventionResult.taxDerivedEBITDAIncludingInterest,
  370,
  "The alternate interest-inclusive metric adds interest back on top of standard EBITDA, so 350 + 20 = 370."
);
assert.equal(explicitSignConventionResult.components.rawSigned.cogs, -400);
assert.equal(explicitSignConventionResult.components.display.cogs, 400);
assert.equal(explicitSignConventionResult.components.rawSigned.depreciation, -50);
assert.equal(explicitSignConventionResult.components.display.depreciation, 50);
assert.equal(explicitSignConventionResult.components.rawSigned.interest, -20);
assert.equal(explicitSignConventionResult.components.display.interest, 20);

const unknownLineResult = calculateTaxDerivedEbitda({
  companyId,
  sourcePeriodId: "unknown-line-period",
  period: {
    label: "Unknown Line",
    period_date: "2023-12-31"
  },
  entries: [
    ...fy2023.entries,
    {
      id: "unknown-1",
      account_name: "Mystery local tax adjustment",
      statement_type: "income",
      amount: -25000,
      category: null,
      addback_flag: false,
      matched_by: null,
      confidence: "unknown",
      mapping_explanation: null,
      created_at: "2026-04-09T00:00:00.000Z",
      source_period_id: "unknown-line-period",
      source_document_id: "unknown-doc",
      source_type: "tax_return",
      source_file_name: "unknown.json",
      upload_id: "unknown-upload",
      source_period_label: "Tax Year 2023",
      source_year: 2023,
      source_currency: "USD",
      source_confidence: "unknown"
    }
  ]
});
assert.equal(
  unknownLineResult.taxDerivedEBITDA,
  fy2023Result.taxDerivedEBITDA,
  "Unknown lines must not contribute to EBITDA."
);
assert.equal(unknownLineResult.coverage.computable, true);
assert.equal(
  unknownLineResult.coverage.status,
  "partial",
  "Unknown lines must reduce completeness."
);
assert.equal(unknownLineResult.coverage.unknownEntryCount, 1);
assert.ok(
  unknownLineResult.coverage.notes.some((note) => note.includes("excluded from EBITDA"))
);
const unknownTrace = unknownLineResult.traceRows.find(
  (row) => row.accountName === "Mystery local tax adjustment"
);
assert.equal(unknownTrace?.bucket, null);
assert.equal(unknownTrace?.classification, "unknown");

console.log("tax-ebitda tests passed");
