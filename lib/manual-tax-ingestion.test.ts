import assert from "node:assert/strict";
import {
  applyManualTaxIngestionPlanToStore,
  buildManualTaxDevFixtures,
  buildManualTaxIngestionPlan,
  buildManualTaxPreviewRows,
  createEmptyInMemoryTaxStore,
  mapManualTaxEntry,
  resolveManualTaxEntries
} from "./manual-tax-ingestion.ts";
import { normalizeMappingLabel } from "./mapping-memory.ts";
import type { AccountMapping } from "./types.ts";

const grossReceipts = mapManualTaxEntry({
  accountName: "Gross receipts",
  amount: 5200000
});
assert.equal(grossReceipts.statementType, "income");
assert.equal(grossReceipts.mappedCategory, "Revenue");
assert.equal(grossReceipts.mappingMethod, "keyword_rule");
assert.equal(grossReceipts.mappingConfidence, "high");

const officerComp = mapManualTaxEntry({
  accountName: "Officer compensation",
  amount: -450000
});
assert.equal(officerComp.mappedCategory, "Operating Expenses");
assert.ok(officerComp.mappingExplanation.includes("future normalization"));

const section179 = mapManualTaxEntry({
  accountName: "Section 179 deduction",
  amount: -25000
});
assert.equal(section179.mappedCategory, "Depreciation / Amortization");

const charitable = mapManualTaxEntry({
  accountName: "Charitable contributions",
  amount: -12000
});
assert.equal(charitable.mappedCategory, "Non-operating");

const unmatchedTaxLine = mapManualTaxEntry({
  accountName: "Mystery local tax adjustment",
  amount: -25000
});
assert.equal(unmatchedTaxLine.mappedCategory, null);
assert.equal(unmatchedTaxLine.matchedRule, "unknown");
assert.equal(unmatchedTaxLine.mappingSource, "fallback");

const fixtures = buildManualTaxDevFixtures("company-xyz");
assert.equal(fixtures.length, 2);
assert.equal(fixtures[0].periods.length, 1);
assert.equal(fixtures[1].periods.length, 2);

const taxMemory: AccountMapping[] = [
  {
    id: "tax-memory-1",
    company_id: "company-xyz",
    account_name: "Gross receipts",
    account_name_key: normalizeMappingLabel("Gross receipts"),
    normalized_label: normalizeMappingLabel("Gross receipts"),
    category: "Revenue",
    concept: "Revenue",
    statement_type: "income",
    source_type: "tax_return",
    confidence: "high",
    usage_count: 4,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "generic-memory-1",
    company_id: null,
    account_name: "Custom payroll burden",
    account_name_key: normalizeMappingLabel("Custom payroll burden"),
    normalized_label: normalizeMappingLabel("Custom payroll burden"),
    category: "Operating Expenses",
    concept: "Operating Expenses",
    statement_type: "income",
    source_type: null,
    confidence: "medium",
    usage_count: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

const previewRows = await buildManualTaxPreviewRows({
  companyId: "company-xyz",
  entries: [
    { accountName: "Gross receipts", amount: 5200000 },
    { accountName: "Custom payroll burden", amount: -15000 },
    { accountName: "Section 179 deduction", amount: -25000 }
  ],
  savedMappings: taxMemory
});
assert.equal(previewRows[0]?.mappingMethod, "memory");
assert.equal(previewRows[0]?.mappingSource, "company_memory");
assert.equal(previewRows[1]?.mappingMethod, "memory");
assert.equal(previewRows[1]?.mappingSource, "shared_memory");
assert.equal(previewRows[2]?.mappingMethod, "keyword_rule");

const resolvedEntries = await resolveManualTaxEntries({
  companyId: "company-xyz",
  entries: [
    { accountName: "Gross receipts", amount: 5200000 },
    { accountName: "Custom payroll burden", amount: -15000 },
    { accountName: "Other deductions", amount: -12000 }
  ],
  savedMappings: taxMemory
});
assert.equal(resolvedEntries[0]?.mappingMethod, "memory");
assert.equal(resolvedEntries[0]?.matchedMemoryKey, "gross receipts::income");
assert.equal(resolvedEntries[1]?.mappingMethod, "memory");
assert.equal(resolvedEntries[1]?.memorySourceType, "generic");
assert.equal(resolvedEntries[2]?.mappingMethod, "keyword_rule");

const multiPeriodPlan = await buildManualTaxIngestionPlan(fixtures[1], {
  savedMappings: taxMemory
});
assert.equal(multiPeriodPlan.periods.length, 2);
assert.equal(multiPeriodPlan.periods[0]?.entries[0]?.mappedCategory, "Revenue");
assert.equal(
  multiPeriodPlan.periods[1]?.entries.find((entry) => entry.rawAccountName === "Interest")
    ?.mappedCategory,
  "Non-operating"
);

const previewAndSaveConsistencyEntries = [
  { accountName: "Gross receipts", amount: 5200000 },
  { accountName: "Section 179 deduction", amount: -25000 }
];
const previewConsistency = await buildManualTaxPreviewRows({
  companyId: "company-xyz",
  entries: previewAndSaveConsistencyEntries,
  savedMappings: taxMemory
});
const planConsistency = await buildManualTaxIngestionPlan(
  {
    companyId: "company-xyz",
    sourceType: "tax_return",
    periods: [
      {
        label: "FY2023",
        periodDate: "2023-12-31",
        entries: previewAndSaveConsistencyEntries
      }
    ]
  },
  {
    savedMappings: taxMemory
  }
);
assert.deepEqual(
  previewConsistency.map((row) => ({
    accountName: row.accountName,
    mappedCategory: row.mappedCategory,
    mappingMethod: row.mappingMethod,
    mappingSource: row.mappingSource
  })),
  planConsistency.periods[0]?.entries.map((entry) => ({
    accountName: entry.rawAccountName,
    mappedCategory: entry.mappedCategory,
    mappingMethod: entry.mappingMethod,
    mappingSource: entry.mappingSource
  }))
);

const store = createEmptyInMemoryTaxStore();
const initialApply = applyManualTaxIngestionPlanToStore(store, multiPeriodPlan);
assert.equal(initialApply.periods.length, 2);
assert.equal(store.documents.length, 1);
assert.equal(store.periods.length, 2);
assert.ok(store.entries.length > 0);

const fy2023Period = store.periods.find((period) => period.label === "FY2023");
assert.ok(fy2023Period, "Expected FY2023 source period");
const fy2023GrossReceipts = store.entries.find(
  (entry) =>
    entry.sourcePeriodId === fy2023Period!.id &&
    entry.accountName === "Gross receipts" &&
    entry.statementType === "income"
);
assert.ok(fy2023GrossReceipts, "Expected FY2023 Gross receipts entry");
assert.equal(fy2023GrossReceipts?.amount, 5200000);

const reingestionFixture = buildManualTaxDevFixtures("company-xyz")[1];
const fy2023Entries = reingestionFixture.periods[1]?.entries ?? [];
const grossReceiptsEntry = fy2023Entries.find(
  (entry) => entry.accountName === "Gross receipts"
);
assert.ok(grossReceiptsEntry, "Expected Gross receipts dev fixture");
grossReceiptsEntry!.amount = 5300000;

const updatedPlan = await buildManualTaxIngestionPlan(reingestionFixture, {
  savedMappings: taxMemory
});
applyManualTaxIngestionPlanToStore(store, updatedPlan);
assert.equal(store.documents.length, 1);
assert.equal(store.periods.length, 2);
assert.equal(
  store.entries.filter(
    (entry) =>
      entry.sourcePeriodId === fy2023Period!.id &&
      entry.accountName === "Gross receipts" &&
      entry.statementType === "income"
  ).length,
  1
);
assert.equal(
  store.entries.find(
    (entry) =>
      entry.sourcePeriodId === fy2023Period!.id &&
      entry.accountName === "Gross receipts" &&
      entry.statementType === "income"
  )?.amount,
  5300000
);

const reportedFinancialsSnapshot = {
  sourceType: "reported_financials" as const,
  periodId: "reported-period-1",
  entries: [{ accountName: "Revenue", amount: 1000 }]
};
const reportedFinancialsBefore = JSON.stringify(reportedFinancialsSnapshot);
applyManualTaxIngestionPlanToStore(
  store,
  await buildManualTaxIngestionPlan(buildManualTaxDevFixtures("company-xyz")[0], {
    savedMappings: taxMemory
  })
);
assert.equal(JSON.stringify(reportedFinancialsSnapshot), reportedFinancialsBefore);

console.log("manual-tax-ingestion tests passed");
