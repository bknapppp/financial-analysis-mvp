import assert from "node:assert/strict";
import { buildMockTaxReturnFixture } from "./financial-sources.ts";

const companyId = "company-123";
const sourceYear = 2024;
const fixture = buildMockTaxReturnFixture({
  companyId,
  sourceYear,
  periodLabel: "FY 2024",
  periodDate: "2024-12-31"
});

assert.equal(fixture.companyId, companyId);
assert.equal(fixture.periodLabel, "FY 2024");
assert.equal(fixture.periodDate, "2024-12-31");
assert.equal(fixture.sourceYear, sourceYear);
assert.equal(fixture.uploadId, `dev-mock-tax-return-${companyId}-${sourceYear}`);
assert.equal(fixture.rows.length, 5);
assert.ok(
  fixture.rows.every(
    (row) =>
      row.statementType === "income" &&
      Number.isFinite(row.amount) &&
      row.mappingExplanation?.includes("source-isolation validation")
  )
);

const reportedFinancialsIdentity = {
  sourceType: "reported_financials" as const,
  periodId: "reported-period-2024",
  label: "FY 2024",
  periodDate: "2024-12-31"
};

const taxReturnIdentity = {
  sourceType: "tax_return" as const,
  periodId: "tax-period-2024",
  label: fixture.periodLabel,
  periodDate: fixture.periodDate
};

assert.equal(reportedFinancialsIdentity.label, taxReturnIdentity.label);
assert.equal(reportedFinancialsIdentity.periodDate, taxReturnIdentity.periodDate);
assert.notEqual(reportedFinancialsIdentity.sourceType, taxReturnIdentity.sourceType);
assert.notEqual(reportedFinancialsIdentity.periodId, taxReturnIdentity.periodId);

console.log("financial-sources tests passed");
