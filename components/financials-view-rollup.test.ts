import assert from "node:assert/strict";
import {
  buildBalanceSheetRollup,
  buildBalanceSheetValidation
} from "./financials-view-rollup.ts";
import type { FinancialEntry, PeriodSnapshot } from "../lib/types.ts";

const periodId = "period-1";

function createEntry(
  accountName: string,
  category: FinancialEntry["category"],
  amount: number
): FinancialEntry {
  return {
    id: `${accountName}-${category}-${amount}`,
    account_name: accountName,
    statement_type: "balance_sheet",
    amount,
    period_id: periodId,
    category,
    addback_flag: false,
    created_at: "2026-01-01T00:00:00.000Z"
  };
}

function createSnapshot(): PeriodSnapshot {
  return {
    periodId,
    label: "FY 2025",
    periodDate: "2025-12-31",
    revenue: 0,
    cogs: 0,
    grossProfit: 0,
    operatingExpenses: 0,
    ebit: null,
    reportedOperatingIncome: null,
    reportedEbitda: null,
    ebitda: 0,
    acceptedAddBacks: 0,
    adjustedEbitda: 0,
    grossMarginPercent: 0,
    ebitdaMarginPercent: 0,
    adjustedEbitdaMarginPercent: 0,
    currentAssets: 0,
    currentLiabilities: 0,
    workingCapital: 0,
    revenueGrowthPercent: null,
    ebitdaGrowthPercent: null,
    adjustedEbitdaGrowthPercent: null,
    grossMarginChange: null,
    ebitdaMarginChange: null
  };
}

{
  const entries = [
    createEntry("Current Assets", "current_assets", 100),
    createEntry("Cash", "current_assets.cash", 60),
    createEntry("Inventory", "current_assets.inventory", 40),
    createEntry("Non-Current Assets", "non_current_assets", 200),
    createEntry("PPE", "non_current_assets.ppe", 200),
    createEntry("Current Liabilities", "current_liabilities", 30),
    createEntry("Accounts Payable", "current_liabilities.accounts_payable", 30),
    createEntry("Equity", "equity", 270),
    createEntry("Retained Earnings", "equity.retained_earnings", 270)
  ];

  const rollup = buildBalanceSheetRollup(entries, periodId);

  assert.equal(rollup.finalTotals.totalCurrentAssets, 100);
  assert.equal(rollup.finalTotals.totalNonCurrentAssets, 200);
  assert.equal(rollup.finalTotals.totalAssets, 300);
  assert.equal(rollup.finalTotals.totalCurrentLiabilities, 30);
  assert.equal(rollup.finalTotals.totalEquity, 270);
  assert.equal(rollup.finalTotals.totalLiabilitiesAndEquity, 300);
  assert.deepEqual(
    rollup.familyRows.currentAssets.map((row) => row.accountName),
    ["Cash", "Inventory"]
  );
  assert.deepEqual(
    rollup.familyRows.equity.map((row) => row.accountName),
    ["Retained Earnings"]
  );
}

{
  const entries = [
    createEntry("Cash", "current_assets.cash", 60),
    createEntry("Inventory", "current_assets.inventory", 40),
    createEntry("Total Current Assets", "current_assets", 100),
    createEntry("PPE", "non_current_assets.ppe", 200),
    createEntry("Total Assets", "Assets", 300),
    createEntry("Accounts Payable", "current_liabilities.accounts_payable", 30),
    createEntry("Total Current Liabilities", "current_liabilities", 30),
    createEntry("Long-Term Debt", "non_current_liabilities.long_term_debt", 70),
    createEntry("Total Liabilities", "Liabilities", 100),
    createEntry("Retained Earnings", "equity.retained_earnings", 200),
    createEntry("Total Equity", "equity", 200),
    createEntry("Total Liabilities & Equity", "Liabilities", 300)
  ];

  const snapshot = createSnapshot();
  const rollup = buildBalanceSheetRollup(entries, periodId);
  const validation = buildBalanceSheetValidation({ entries, snapshot, rollup });
  const currentAssetsSourceCheck = validation.checks.find(
    (check) => check.key === "source_totalCurrentAssets"
  );

  assert.equal(rollup.finalTotals.totalCurrentAssets, 100);
  assert.equal(rollup.finalTotals.totalAssets, 300);
  assert.equal(rollup.finalTotals.totalLiabilities, 100);
  assert.equal(rollup.finalTotals.totalLiabilitiesAndEquity, 300);
  assert.ok(currentAssetsSourceCheck);
  assert.equal(currentAssetsSourceCheck?.difference, 0);
  assert.deepEqual(
    currentAssetsSourceCheck?.contributingLineItems?.map((row) => row.accountName),
    ["Cash", "Inventory"]
  );
}

{
  const entries = [
    createEntry("Cash", "current_assets.cash", 75),
    createEntry("Inventory", "current_assets.inventory", 25),
    createEntry("Accounts Payable", "current_liabilities.accounts_payable", 40),
    createEntry("Retained Earnings", "equity.retained_earnings", 60)
  ];

  const snapshot = createSnapshot();
  const rollup = buildBalanceSheetRollup(entries, periodId);
  const validation = buildBalanceSheetValidation({ entries, snapshot, rollup });
  const balanceEquationCheck = validation.checks.find(
    (check) => check.key === "balance_equation"
  );

  assert.equal(validation.computedTotals.totalAssets, 100);
  assert.equal(validation.computedTotals.totalLiabilitiesAndEquity, 100);
  assert.equal(balanceEquationCheck?.severity, "pass");
  assert.equal(balanceEquationCheck?.difference, 0);
}

console.log("financials-view rollup tests passed");
