import assert from "node:assert/strict";
import type { ParsedImportSheet } from "./import-preview.ts";
import { buildSheetAnalysisForTest } from "./import-preview.ts";
import { deriveWorkbookContext } from "./workbook-context.ts";

function makeSheet(params: {
  name: string;
  matrix: Array<{ sheetRowIndex: number; cells: string[] }>;
  rows: Array<Record<string, string>>;
  headers?: string[];
  wideFormatDetected?: boolean;
}): ParsedImportSheet {
  const headers = params.headers ?? ["Account Name", "Amount", "Period Label"];

  return {
    name: params.name,
    headers,
    rows: params.rows,
    analysis: buildSheetAnalysisForTest({
      matrix: params.matrix,
      rows: params.rows,
      headers,
      wideFormatDetected: params.wideFormatDetected ?? false
    })
  };
}

const incomeSheet = makeSheet({
  name: "P&L",
  matrix: [
    { sheetRowIndex: 1, cells: ["Income Statement", "2024", "2025"] },
    { sheetRowIndex: 2, cells: ["Revenue", "100", "120"] },
    { sheetRowIndex: 3, cells: ["COGS", "50", "60"] },
    { sheetRowIndex: 4, cells: ["Operating Expenses", "20", "25"] }
  ],
  rows: [
    { "Account Name": "Revenue", Amount: "100", "Period Label": "2024" },
    { "Account Name": "COGS", Amount: "50", "Period Label": "2024" }
  ]
});

const incomeOnlyContext = deriveWorkbookContext([incomeSheet]);
assert.equal(incomeOnlyContext.primaryIncomeStatementSheetName, "P&L");
assert.equal(incomeOnlyContext.primaryBalanceSheetSheetName, null);
assert.equal(incomeOnlyContext.gaps.includes("No balance sheet was detected."), true);

const balanceSheet = makeSheet({
  name: "Balance Sheet",
  matrix: [
    { sheetRowIndex: 1, cells: ["Balance Sheet", "2024", "2025"] },
    { sheetRowIndex: 2, cells: ["Cash", "10", "11"] },
    { sheetRowIndex: 3, cells: ["Accounts Receivable", "4", "5"] },
    { sheetRowIndex: 4, cells: ["Accounts Payable", "3", "4"] },
    { sheetRowIndex: 5, cells: ["Retained Earnings", "7", "8"] }
  ],
  rows: [
    { "Account Name": "Cash", Amount: "10", "Period Label": "2024" },
    { "Account Name": "Accounts Payable", Amount: "3", "Period Label": "2024" }
  ]
});

const twoStatementContext = deriveWorkbookContext([incomeSheet, balanceSheet]);
assert.equal(twoStatementContext.primaryIncomeStatementSheetName, "P&L");
assert.equal(twoStatementContext.primaryBalanceSheetSheetName, "Balance Sheet");
assert.equal(twoStatementContext.conflicts.length, 0);

const altIncome = makeSheet({
  name: "P&L Alternate",
  matrix: [
    { sheetRowIndex: 1, cells: ["Profit and Loss", "2024", "2025"] },
    { sheetRowIndex: 2, cells: ["Sales", "100", "120"] },
    { sheetRowIndex: 3, cells: ["Gross Profit", "50", "60"] },
    { sheetRowIndex: 4, cells: ["Net Income", "10", "12"] }
  ],
  rows: [
    { "Account Name": "Sales", Amount: "100", "Period Label": "2024" },
    { "Account Name": "Net Income", Amount: "10", "Period Label": "2024" }
  ]
});

const ambiguousIncomeContext = deriveWorkbookContext([incomeSheet, altIncome, balanceSheet]);
assert.equal(ambiguousIncomeContext.ambiguousSheetNames.includes("P&L"), true);
assert.equal(ambiguousIncomeContext.ambiguousSheetNames.includes("P&L Alternate"), true);
assert.equal(
  ambiguousIncomeContext.conflicts.some((item) => item.includes("Multiple possible income statement sheets")),
  true
);

const noUsableStatement = makeSheet({
  name: "Notes",
  matrix: [
    { sheetRowIndex: 1, cells: ["Customer Detail", "Jan 2024"] },
    { sheetRowIndex: 2, cells: ["Invoice 100", "500"] },
    { sheetRowIndex: 3, cells: ["Invoice 101", "700"] }
  ],
  rows: [{ Description: "Invoice 100", Amount: "500", Period: "Jan 2024" }],
  headers: ["Description", "Amount", "Period"]
});

const noUsableContext = deriveWorkbookContext([noUsableStatement]);
assert.equal(noUsableContext.primaryIncomeStatementSheetName, null);
assert.equal(noUsableContext.primaryBalanceSheetSheetName, null);
assert.equal(noUsableContext.gaps.includes("No importable financial statements were detected."), true);

const monthlyBalance = makeSheet({
  name: "Monthly BS",
  matrix: [
    { sheetRowIndex: 1, cells: ["Balance Sheet", "Jan 2024", "Feb 2024"] },
    { sheetRowIndex: 2, cells: ["Cash", "10", "11"] },
    { sheetRowIndex: 3, cells: ["Accounts Payable", "3", "4"] }
  ],
  rows: [{ "Account Name": "Cash", Amount: "10", "Period Label": "Jan 2024" }]
});

const conflictingPeriodsContext = deriveWorkbookContext([incomeSheet, monthlyBalance]);
assert.equal(
  conflictingPeriodsContext.conflicts.some((item) => item.includes("different period structures")),
  true
);

const supportingSchedule = makeSheet({
  name: "AR Schedule",
  matrix: [
    { sheetRowIndex: 1, cells: ["AR Aging", "Jan 2024"] },
    { sheetRowIndex: 2, cells: ["Customer A", "10"] },
    { sheetRowIndex: 3, cells: ["Customer B", "20"] }
  ],
  rows: [{ Customer: "Customer A", Amount: "10", Period: "Jan 2024" }],
  headers: ["Customer", "Amount", "Period"]
});

const supportingOnlyContext = deriveWorkbookContext([supportingSchedule]);
assert.equal(supportingOnlyContext.supportingSheetNames.includes("AR Schedule"), true);
assert.equal(supportingOnlyContext.gaps.includes("No importable financial statements were detected."), true);

console.log("workbook-context tests passed");
