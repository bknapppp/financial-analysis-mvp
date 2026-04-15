import assert from "node:assert/strict";
import { buildSheetAnalysisForTest } from "./import-preview.ts";

const incomeMatrix = [
  { sheetRowIndex: 1, cells: ["Income Statement", "2024", "2025"] },
  { sheetRowIndex: 2, cells: ["Revenue", "100", "120"] },
  { sheetRowIndex: 3, cells: ["COGS", "50", "60"] },
  { sheetRowIndex: 4, cells: ["Gross Profit", "50", "60"] },
  { sheetRowIndex: 5, cells: ["Operating Expenses", "20", "25"] }
];

const incomeRows = [
  { "Account Name": "Revenue", Amount: "100", "Period Label": "2024" },
  { "Account Name": "COGS", Amount: "50", "Period Label": "2024" },
  { "Account Name": "Operating Expenses", Amount: "20", "Period Label": "2024" }
];

const incomeAnalysis = buildSheetAnalysisForTest({
  matrix: incomeMatrix,
  rows: incomeRows,
  headers: ["Account Name", "Amount", "Period Label"]
});

assert.equal(incomeAnalysis.classification.statementType, "income_statement");
assert.equal(incomeAnalysis.classification.status, "likely_income_statement");
assert.equal(incomeAnalysis.periodDetection.structure, "annual");
assert.equal(incomeAnalysis.columnStructure.type, "long");
assert.equal(
  incomeAnalysis.periodDetection.periods.some((period) => period.label === "2024"),
  true
);
assert.equal(incomeAnalysis.likelyFinancialLineItemHints.includes("Revenue"), true);

const balanceSheetMatrix = [
  { sheetRowIndex: 1, cells: ["Balance Sheet", "Jan 2026", "Feb 2026", "TTM"] },
  { sheetRowIndex: 2, cells: ["Cash", "10", "12", "14"] },
  { sheetRowIndex: 3, cells: ["Accounts Receivable", "4", "5", "6"] },
  { sheetRowIndex: 4, cells: ["Inventory", "8", "9", "10"] },
  { sheetRowIndex: 5, cells: ["Accounts Payable", "3", "4", "5"] },
  { sheetRowIndex: 6, cells: ["Retained Earnings", "7", "8", "9"] }
];

const balanceRows = [
  { "Account Name": "Cash", Amount: "10", "Period Label": "Jan 2026" },
  { "Account Name": "Accounts Receivable", Amount: "4", "Period Label": "Jan 2026" },
  { "Account Name": "Accounts Payable", Amount: "3", "Period Label": "Jan 2026" }
];

const balanceAnalysis = buildSheetAnalysisForTest({
  matrix: balanceSheetMatrix,
  rows: balanceRows,
  headers: ["Account Name", "Amount", "Period Label"]
});

assert.equal(balanceAnalysis.classification.status, "likely_balance_sheet");
assert.equal(balanceAnalysis.periodDetection.structure, "mixed");
assert.equal(balanceAnalysis.periodDetection.ttmHeaders.includes("TTM"), true);
assert.equal(balanceAnalysis.likelyLineItemRowNumbers.includes(1), true);
assert.equal(balanceAnalysis.columnStructure.type, "long");

const cashFlowMatrix = [
  { sheetRowIndex: 1, cells: ["Statement of Cash Flows", "2022A", "FY2023", "Q1 2024"] },
  { sheetRowIndex: 2, cells: ["Net cash provided by operating activities", "12", "14", "4"] },
  { sheetRowIndex: 3, cells: ["Capital expenditures", "-5", "-6", "-2"] },
  { sheetRowIndex: 4, cells: ["Net change in cash", "7", "8", "2"] }
];

const cashFlowAnalysis = buildSheetAnalysisForTest({
  matrix: cashFlowMatrix,
  rows: [
    { "Account Name": "Net cash provided by operating activities", Amount: "12", "Period Label": "2022A" }
  ],
  headers: ["Account Name", "Amount", "Period Label"],
  wideFormatDetected: true
});

assert.equal(cashFlowAnalysis.classification.statementType, "cash_flow");
assert.equal(cashFlowAnalysis.classification.status, "likely_cash_flow");
assert.equal(cashFlowAnalysis.columnStructure.type, "wide");
assert.equal(
  cashFlowAnalysis.periodDetection.periods.some((period) => period.label === "2022"),
  true
);
assert.equal(
  cashFlowAnalysis.periodDetection.periods.some((period) => period.label === "Q1 2024"),
  true
);

console.log("import-preview tests passed");
