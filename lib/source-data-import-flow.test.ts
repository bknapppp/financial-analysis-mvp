import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyManualMappingEdit, buildSourceImportSubmission, deriveImportStepStatus, getBlockingImportRows, isSourceImportBlocked, type ImportFlowRow } from "./source-data-import-flow.ts";

const mappedRow: ImportFlowRow = { accountKey: "revenue", accountName: "Revenue", category: "Revenue", statementType: "income", confidence: "high", matchedBy: "keyword", mappingExplanation: "Matched revenue rule.", periods: [{ rowNumber: 2, periodLabel: "FY 2025", periodDate: "2025-12-31", amountText: "100", amountValue: 100 }] };

test("locks step readiness and progression prerequisites", () => {
  assert.deepEqual(deriveImportStepStatus({ selectedCompanyId: "", hasParsedFile: false, hasSelectedSheet: false, accountNameColumn: "", amountColumn: "", reviewedRows: [] }), { uploadComplete: false, structureComplete: false, reviewComplete: false });
  assert.deepEqual(deriveImportStepStatus({ selectedCompanyId: "company-1", hasParsedFile: true, hasSelectedSheet: true, accountNameColumn: "Account", amountColumn: "Amount", reviewedRows: [mappedRow] }), { uploadComplete: true, structureComplete: true, reviewComplete: true });
});

test("unresolved mappings block unless excluded or explicitly non-blocking", () => {
  const unresolved = { ...mappedRow, category: "", statementType: "" };
  assert.equal(getBlockingImportRows([unresolved]).length, 1);
  assert.equal(getBlockingImportRows([{ ...unresolved, isExcluded: true }]).length, 0);
  assert.equal(getBlockingImportRows([{ ...unresolved, isNonBlocking: true }]).length, 0);
});

test("locks period fallback and pending import blocking rules", () => {
  const base = { isPending: false, selectedCompanyId: "company-1", detectedPeriodCount: 1, unresolvedPeriodCount: 0, periodFallbackMode: "existing" as const, selectedPeriodId: "", newPeriodLabel: "", newPeriodDate: "", reviewedRows: [mappedRow], blockingRowCount: 0 };
  assert.equal(isSourceImportBlocked(base), false);
  assert.equal(isSourceImportBlocked({ ...base, isPending: true }), true);
  assert.equal(isSourceImportBlocked({ ...base, detectedPeriodCount: 0 }), true);
  assert.equal(isSourceImportBlocked({ ...base, detectedPeriodCount: 0, selectedPeriodId: "period-1" }), false);
  assert.equal(isSourceImportBlocked({ ...base, detectedPeriodCount: 0, periodFallbackMode: "new", newPeriodLabel: "FY 2025", newPeriodDate: "2025-12-31" }), false);
  assert.equal(isSourceImportBlocked({ ...base, blockingRowCount: 1 }), true);
});

test("manual mapping edits affect only the normalized account group", () => {
  assert.deepEqual(applyManualMappingEdit({ rows: [{ Account: "Revenue" }, { Account: "COGS" }], accountNameColumn: "Account", accountKey: "revenue", patch: { __manual_category: "Revenue", __manual_statement_type: "income" } }), [{ Account: "Revenue", __manual_category: "Revenue", __manual_statement_type: "income" }, { Account: "COGS" }]);
});

test("locks import payload construction, exclusions, and fallback selection", () => {
  const result = buildSourceImportSubmission({ companyId: "company-1", groupedRows: [mappedRow, { ...mappedRow, accountKey: "cogs", accountName: "COGS", isExcluded: true }], periodFallbackMode: "new", selectedPeriodId: "old", newPeriodLabel: "FY 2025", newPeriodDate: "2025-12-31" });
  assert.equal(result.payload.rows.length, 1);
  assert.equal(result.payload.periodId, "");
  assert.deepEqual(result.payload.createPeriod, { label: "FY 2025", periodDate: "2025-12-31" });
  assert.deepEqual(result.droppedRows, [{ accountName: "COGS", reason: "excluded" }]);
});

test("retains successful import refresh and mapping conflict overwrite behavior", () => {
  const importSource = readFileSync("components/csv-import-section.tsx", "utf8");
  const saveSource = readFileSync("components/save-mapping-button.tsx", "utf8");
  assert.match(importSource, /setSuccessMessage\(`Imported \$\{nextSummary\.insertedCount\} row\(s\) successfully\.`\)/);
  assert.match(importSource, /startTransition\(\(\) => \{\s*router\.refresh\(\)/);
  assert.match(saveSource, /result\.status === "conflict"/);
  assert.match(saveSource, /handleSave\(true\)/);
  assert.match(saveSource, /onSaved\?\.\(\)/);
});

console.log("source data import-flow characterization tests passed");
