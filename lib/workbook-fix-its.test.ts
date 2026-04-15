import assert from "node:assert/strict";
import type { ParsedImportSheet } from "./import-preview.ts";
import { buildSheetAnalysisForTest } from "./import-preview.ts";
import { deriveWorkbookContext } from "./workbook-context.ts";
import { deriveWorkbookFixIts } from "./workbook-fix-its.ts";

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
  name: "Income Statement",
  matrix: [
    { sheetRowIndex: 1, cells: ["Income Statement", "2024", "2025"] },
    { sheetRowIndex: 2, cells: ["Revenue", "100", "120"] },
    { sheetRowIndex: 3, cells: ["COGS", "50", "60"] },
    { sheetRowIndex: 4, cells: ["Operating Expenses", "20", "25"] }
  ],
  rows: [{ "Account Name": "Revenue", Amount: "100", "Period Label": "2024" }]
});

const balanceSheet = makeSheet({
  name: "Balance Sheet",
  matrix: [
    { sheetRowIndex: 1, cells: ["Balance Sheet", "2024", "2025"] },
    { sheetRowIndex: 2, cells: ["Cash", "10", "11"] },
    { sheetRowIndex: 3, cells: ["Accounts Payable", "3", "4"] },
    { sheetRowIndex: 4, cells: ["Equity", "7", "8"] }
  ],
  rows: [{ "Account Name": "Cash", Amount: "10", "Period Label": "2024" }]
});

const alternateIncome = makeSheet({
  name: "P&L Alternate",
  matrix: [
    { sheetRowIndex: 1, cells: ["Profit and Loss", "2024", "2025"] },
    { sheetRowIndex: 2, cells: ["Sales", "100", "120"] },
    { sheetRowIndex: 3, cells: ["Gross Profit", "50", "60"] },
    { sheetRowIndex: 4, cells: ["Net Income", "10", "12"] }
  ],
  rows: [{ "Account Name": "Sales", Amount: "100", "Period Label": "2024" }]
});

const monthlyBalanceSheet = makeSheet({
  name: "Monthly Balance Sheet",
  matrix: [
    { sheetRowIndex: 1, cells: ["Balance Sheet", "Jan 2024", "Feb 2024"] },
    { sheetRowIndex: 2, cells: ["Cash", "10", "11"] },
    { sheetRowIndex: 3, cells: ["Accounts Payable", "3", "4"] }
  ],
  rows: [{ "Account Name": "Cash", Amount: "10", "Period Label": "Jan 2024" }]
});

const cashFlowSheet = makeSheet({
  name: "Cash Flow",
  matrix: [
    { sheetRowIndex: 1, cells: ["Cash Flow Statement", "2024", "2025"] },
    { sheetRowIndex: 2, cells: ["Net Income", "10", "12"] },
    { sheetRowIndex: 3, cells: ["Depreciation", "2", "3"] },
    { sheetRowIndex: 4, cells: ["Cash from Operations", "12", "15"] }
  ],
  rows: [{ "Account Name": "Net Income", Amount: "10", "Period Label": "2024" }]
});

const cleanTasks = deriveWorkbookFixIts({
  workbookContext: deriveWorkbookContext([incomeSheet, balanceSheet]),
  companyId: "company-123"
});
assert.equal(cleanTasks.length, 0);

const missingBalanceTasks = deriveWorkbookFixIts({
  workbookContext: deriveWorkbookContext([incomeSheet]),
  companyId: "company-123"
});
assert.equal(
  missingBalanceTasks.some((task) => task.key === "missing_balance_sheet"),
  true
);
assert.equal(
  missingBalanceTasks.find((task) => task.key === "missing_balance_sheet")?.href.includes(
    "/source-data?companyId=company-123"
  ),
  true
);

const ambiguousIncomeTasks = deriveWorkbookFixIts({
  workbookContext: deriveWorkbookContext([incomeSheet, alternateIncome, balanceSheet]),
  companyId: "company-123"
});
assert.equal(
  ambiguousIncomeTasks.some((task) => task.key === "ambiguous_income_statement"),
  true
);

const periodMismatchTasks = deriveWorkbookFixIts({
  workbookContext: deriveWorkbookContext([incomeSheet, monthlyBalanceSheet]),
  companyId: "company-123"
});
assert.equal(
  periodMismatchTasks.some((task) => task.key === "primary_statement_period_mismatch"),
  true
);
assert.equal(
  periodMismatchTasks.some((task) => task.href.includes("fixStep=2")),
  true
);

const supportingOnlyTasks = deriveWorkbookFixIts({
  workbookContext: deriveWorkbookContext([cashFlowSheet]),
  companyId: "company-123"
});
assert.equal(
  supportingOnlyTasks.some((task) => task.key === "supporting_schedules_only"),
  true
);

console.log("workbook-fix-its tests passed");
