import assert from "node:assert/strict";
import { parseWideStatementMatrixWithDiagnostics } from "./statement-parser.ts";

type TestMatrixRow = {
  sheetRowIndex: number;
  cells: string[];
};

function expectResolvedColumn(
  matrix: TestMatrixRow[],
  expected: { label: string; periodDate: string; chosenIncludes: string }
) {
  const result = parseWideStatementMatrixWithDiagnostics(matrix);
  const column = result.debug.detectedPeriodColumns[0];

  assert.ok(result.debug.wideFormatDetected, "Expected wide-format detection");
  assert.ok(column, "Expected at least one detected period column");
  assert.equal(column.resolvedPeriodLabel, expected.label);
  assert.equal(column.resolvedPeriodDate, expected.periodDate);
  assert.ok(
    column.chosenInterpretation.includes(expected.chosenIncludes),
    `Expected chosen interpretation to include ${expected.chosenIncludes}, got ${column.chosenInterpretation}`
  );
}

expectResolvedColumn(
  [
    { sheetRowIndex: 1, cells: ["", "CY '14", "CY '15"] },
    { sheetRowIndex: 2, cells: ["", "Dec '14", "Dec '15"] },
    { sheetRowIndex: 3, cells: ["Revenue", "100", "110"] }
  ],
  {
    label: "Dec 2014",
    periodDate: "2014-12-01",
    chosenIncludes: "Dec"
  }
);

expectResolvedColumn(
  [
    { sheetRowIndex: 1, cells: ["", "FY'23", "FY'24"] },
    { sheetRowIndex: 2, cells: ["", "Q1", "Q2"] },
    { sheetRowIndex: 3, cells: ["Revenue", "100", "110"] }
  ],
  {
    label: "Q1 2023",
    periodDate: "2023-01-01",
    chosenIncludes: "Q1"
  }
);

expectResolvedColumn(
  [
    { sheetRowIndex: 1, cells: ["", "2024", "2025"] },
    { sheetRowIndex: 2, cells: ["", "Jan", "Feb"] },
    { sheetRowIndex: 3, cells: ["Revenue", "100", "110"] }
  ],
  {
    label: "Jan 2024",
    periodDate: "2024-01-01",
    chosenIncludes: "Jan"
  }
);

console.log("statement-parser tests passed");

function expectClassification(label: string, expected: string) {
  const result = parseWideStatementMatrixWithDiagnostics([
    { sheetRowIndex: 1, cells: ["", "Dec '14", "Dec '15"] },
    { sheetRowIndex: 2, cells: [label, "100", "110"] }
  ]);

  const counts = result.debug.classifiedRowCounts as Record<string, number>;
  assert.equal(counts[expected], 1, `Expected ${label} to classify as ${expected}`);
}

function expectHeaderRowClassification(label: string) {
  const result = parseWideStatementMatrixWithDiagnostics([
    { sheetRowIndex: 1, cells: ["", "Dec '14", "Dec '15"] },
    { sheetRowIndex: 2, cells: [label, "", ""] },
    { sheetRowIndex: 3, cells: ["Revenue", "100", "110"] }
  ]);

  const counts = result.debug.classifiedRowCounts as Record<string, number>;
  assert.equal(counts.header_row, 1, `Expected ${label} to classify as header_row`);
  assert.ok(
    result.rows.every((row) => row.account_name !== label),
    `Expected ${label} to be excluded from normalized rows`
  );
}

expectHeaderRowClassification("ROBINHOOD MARKETS INC");
expectHeaderRowClassification("CONSOLIDATED STATEMENTS OF OPERATIONS");
expectClassification("Gross Profit Margin", "ratio");
expectClassification("EBITDA Ratio", "ratio");
expectClassification("Tax Rate", "ratio");
expectClassification("Earnings Per Share", "per_share");
expectClassification("Earnings Per Share Diluted", "per_share");
expectClassification("Weighted Average Shares Outstanding", "per_share");
expectClassification("Revenue", "line_item");
expectClassification("EBITDA", "line_item");
expectClassification("Cost of Revenue", "line_item");

const stackedHeaderRegression = parseWideStatementMatrixWithDiagnostics([
  { sheetRowIndex: 1, cells: ["", "CY '14", "CY '15"] },
  { sheetRowIndex: 2, cells: ["", "Dec '14", "Dec '15"] },
  { sheetRowIndex: 3, cells: ["Sales", "4108", "4501"] }
]);

assert.equal(stackedHeaderRegression.debug.headerSheetRowIndex, 1);
assert.equal(stackedHeaderRegression.debug.stackedHeaderSheetRowIndex, 2);
assert.notEqual(
  stackedHeaderRegression.debug.headerRowIndex,
  stackedHeaderRegression.debug.stackedHeaderRowIndex
);
assert.equal(
  stackedHeaderRegression.debug.detectedPeriodColumns[0]?.rawHeaderValueRow1,
  "CY '14"
);
assert.equal(
  stackedHeaderRegression.debug.detectedPeriodColumns[0]?.rawHeaderValueRow2,
  "Dec '14"
);
assert.equal(
  stackedHeaderRegression.debug.detectedPeriodColumns[0]?.resolvedPeriodLabel,
  "Dec 2014"
);
assert.equal(
  stackedHeaderRegression.debug.detectedPeriodColumns[0]?.resolvedPeriodDate,
  "2014-12-01"
);

const nonAdjacentStackedHeaderRegression = parseWideStatementMatrixWithDiagnostics([
  { sheetRowIndex: 1, cells: ["", "CY '14", "CY '15"] },
  { sheetRowIndex: 2, cells: ["", "", ""] },
  { sheetRowIndex: 3, cells: ["", "Dec '14", "Dec '15"] },
  { sheetRowIndex: 4, cells: ["Sales", "4108", "4501"] }
]);

assert.equal(nonAdjacentStackedHeaderRegression.debug.headerSheetRowIndex, 1);
assert.equal(nonAdjacentStackedHeaderRegression.debug.stackedHeaderSheetRowIndex, 3);
assert.equal(
  nonAdjacentStackedHeaderRegression.debug.detectedPeriodColumns[0]?.rawHeaderValueRow1,
  "CY '14"
);
assert.equal(
  nonAdjacentStackedHeaderRegression.debug.detectedPeriodColumns[0]?.rawHeaderValueRow2,
  "Dec '14"
);
assert.equal(
  nonAdjacentStackedHeaderRegression.debug.detectedPeriodColumns[0]?.resolvedPeriodLabel,
  "Dec 2014"
);
assert.equal(
  nonAdjacentStackedHeaderRegression.debug.detectedPeriodColumns[0]?.resolvedPeriodDate,
  "2014-12-01"
);

const accountColumnRegression = parseWideStatementMatrixWithDiagnostics([
  { sheetRowIndex: 1, cells: ["x", "", "Dec '14", "Dec '15"] },
  { sheetRowIndex: 2, cells: ["", "Revenue", "100", "200"] },
  { sheetRowIndex: 3, cells: ["", "Cost of Revenue", "50", "80"] }
]);

assert.equal(accountColumnRegression.debug.accountColumnIndex, 1);
assert.ok(
  (accountColumnRegression.debug.accountColumnReason ?? "").includes("Selected column 2") ||
    (accountColumnRegression.debug.accountColumnReason ?? "").includes("Column 2")
);
assert.equal(accountColumnRegression.rows[0]?.account_name, "Revenue");
assert.equal(accountColumnRegression.rows[2]?.account_name, "Cost of Revenue");
