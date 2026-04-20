import assert from "node:assert/strict";
import { buildSnapshots } from "./calculations.ts";
import type { AddBack, FinancialEntry, ReportingPeriod } from "./types";

const period: ReportingPeriod = {
  id: "period-1",
  company_id: "company-1",
  label: "FY 2025",
  period_date: "2025-12-31",
  created_at: "2026-01-01T00:00:00.000Z"
};

function createEntry(
  category: FinancialEntry["category"],
  amount: number,
  statementType: FinancialEntry["statement_type"] = "balance_sheet"
): FinancialEntry {
  return {
    id: `${category}-${amount}-${statementType}`,
    account_name: category,
    statement_type: statementType,
    amount,
    period_id: period.id,
    category,
    addback_flag: false,
    created_at: "2026-01-01T00:00:00.000Z"
  };
}

function createNamedIncomeEntry(
  accountName: string,
  category: Extract<
    FinancialEntry["category"],
    | "Revenue"
    | "COGS"
    | "Operating Expenses"
    | "Depreciation / Amortization"
    | "Non-operating"
    | "Tax Expense"
    | "Net Income"
    | "Operating Income"
    | "EBITDA"
  >,
  amount: number
): FinancialEntry {
  return {
    ...createEntry(category, amount, "income"),
    id: `${accountName}-${category}-${amount}`,
    account_name: accountName
  };
}

function snapshotFromEntries(entries: FinancialEntry[], addBacks: AddBack[] = []) {
  const snapshots = buildSnapshots([period], entries, addBacks);
  const snapshot = snapshots[0];

  assert.ok(snapshot, "Expected a snapshot for test period");

  return snapshot;
}

{
  const snapshot = snapshotFromEntries([
    createEntry("Revenue", 1000, "income"),
    createEntry("COGS", 400, "income"),
    createEntry("Operating Expenses", 300, "income"),
    createEntry("current_assets", 100),
    createEntry("current_assets.cash", 60),
    createEntry("current_assets.inventory", 40),
    createEntry("current_liabilities", 50),
    createEntry("current_liabilities.accounts_payable", 50)
  ]);

  assert.equal(snapshot.currentAssets, 100);
  assert.equal(snapshot.currentLiabilities, 50);
  assert.equal(snapshot.workingCapital, 50);
  assert.equal(snapshot.incomeStatementDebug?.revenue.source, "subtotal_fallback");
  assert.equal(
    snapshot.incomeStatementDebug?.operatingExpenses.source,
    "subtotal_fallback"
  );
}

{
  const snapshot = snapshotFromEntries([
    createEntry("Assets", 500),
    createEntry("current_assets", 300),
    createEntry("non_current_assets", 200),
    createEntry("current_assets.cash", 150),
    createEntry("current_assets.inventory", 150),
    createEntry("Liabilities", 250),
    createEntry("current_liabilities", 120),
    createEntry("non_current_liabilities", 130),
    createEntry("current_liabilities.accounts_payable", 120)
  ]);

  assert.equal(snapshot.currentAssets, 300);
  assert.equal(snapshot.currentLiabilities, 120);
  assert.equal(snapshot.workingCapital, 180);
}

{
  const snapshot = snapshotFromEntries([
    createEntry("current_assets.cash", 70),
    createEntry("current_liabilities.accounts_payable", 70)
  ]);

  assert.equal(snapshot.currentAssets, 70);
  assert.equal(snapshot.currentLiabilities, 70);
  assert.equal(snapshot.workingCapital, 0);
}

{
  const snapshot = snapshotFromEntries([
    createNamedIncomeEntry("Revenue", "Revenue", 1000),
    createNamedIncomeEntry("Product Revenue", "Revenue", 600),
    createNamedIncomeEntry("Service Revenue", "Revenue", 400),
    createNamedIncomeEntry("COGS", "COGS", 350),
    createNamedIncomeEntry("Materials", "COGS", 200),
    createNamedIncomeEntry("Fulfillment", "COGS", 150),
    createNamedIncomeEntry("Operating Expenses", "Operating Expenses", 500),
    createNamedIncomeEntry("G&A", "Operating Expenses", 120),
    createNamedIncomeEntry("R&D", "Operating Expenses", 180),
    createNamedIncomeEntry("Sales & Marketing", "Operating Expenses", 200)
  ]);

  assert.equal(snapshot.revenue, 1000);
  assert.equal(snapshot.cogs, 350);
  assert.equal(snapshot.operatingExpenses, 500);
  assert.equal(snapshot.depreciationAndAmortization, 0);
  assert.equal(snapshot.grossProfit, 650);
  assert.equal(snapshot.ebit, 150);
  assert.equal(snapshot.ebitda, null);
  assert.equal(snapshot.incomeStatementDebug?.revenue.source, "components");
  assert.deepEqual(snapshot.incomeStatementDebug?.revenue.selectedLabels, [
    "Product Revenue",
    "Service Revenue"
  ]);
  assert.deepEqual(snapshot.incomeStatementDebug?.revenue.excludedLabels, ["Revenue"]);
  assert.equal(snapshot.incomeStatementDebug?.cogs.source, "components");
  assert.deepEqual(snapshot.incomeStatementDebug?.cogs.excludedLabels, ["COGS"]);
  assert.equal(snapshot.incomeStatementDebug?.operatingExpenses.source, "components");
  assert.deepEqual(snapshot.incomeStatementDebug?.operatingExpenses.excludedLabels, [
    "Operating Expenses"
  ]);
}

{
  const snapshot = snapshotFromEntries([
    createNamedIncomeEntry("Revenue", "Revenue", 900),
    createNamedIncomeEntry("COGS", "COGS", 300),
    createNamedIncomeEntry("Total Expenses", "Operating Expenses", 250),
    createNamedIncomeEntry("Cost and Expenses", "Operating Expenses", 25)
  ]);

  assert.equal(snapshot.operatingExpenses, 25);
  assert.equal(snapshot.incomeStatementDebug?.operatingExpenses.source, "subtotal_fallback");
  assert.deepEqual(snapshot.incomeStatementDebug?.operatingExpenses.selectedLabels, [
    "Cost and Expenses"
  ]);
  assert.deepEqual(snapshot.incomeStatementDebug?.operatingExpenses.excludedLabels, [
    "Total Expenses"
  ]);
}

{
  const snapshot = snapshotFromEntries(
    [
      createNamedIncomeEntry("Revenue", "Revenue", 1000),
      createNamedIncomeEntry("COGS", "COGS", 400),
      createNamedIncomeEntry("G&A", "Operating Expenses", 120),
      createNamedIncomeEntry("Sales & Marketing", "Operating Expenses", 180),
      createNamedIncomeEntry("Depreciation", "Depreciation / Amortization", 50),
      createNamedIncomeEntry("Interest Expense", "Non-operating", 20),
      createNamedIncomeEntry("Tax Expense", "Tax Expense", 30),
      createNamedIncomeEntry("Net Income", "Net Income", 200)
    ],
    [
      {
        id: "addback-1",
        company_id: "company-1",
        period_id: period.id,
        linked_entry_id: null,
        type: "owner_related",
        description: "Owner vehicle",
        amount: 25,
        classification_confidence: "high",
        source: "user",
        status: "accepted",
        justification: "Accepted normalization.",
        supporting_reference: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z"
      }
    ]
  );

  assert.equal(snapshot.acceptedAddBacks, 25);
  assert.equal(snapshot.adjustedEbitda, 325);
}

{
  const snapshot = snapshotFromEntries([
    createNamedIncomeEntry("Revenue", "Revenue", 1000),
    createNamedIncomeEntry("COGS", "COGS", 400),
    createNamedIncomeEntry("G&A", "Operating Expenses", 120),
    createNamedIncomeEntry("Sales & Marketing", "Operating Expenses", 180),
    createNamedIncomeEntry("Depreciation", "Depreciation / Amortization", 50),
    createNamedIncomeEntry("Interest Expense", "Non-operating", 20),
    createNamedIncomeEntry("Tax Expense", "Tax Expense", 30),
    createNamedIncomeEntry("Net Income", "Net Income", 200),
    createNamedIncomeEntry("Operating Income", "Operating Income", 300),
    createNamedIncomeEntry("Reported EBITDA", "EBITDA", 350)
  ]);

  assert.equal(snapshot.operatingExpenses, 300);
  assert.equal(snapshot.depreciationAndAmortization, 50);
  assert.equal(snapshot.ebit, 300);
  assert.equal(snapshot.ebitda, 300);
  assert.equal(snapshot.reportedOperatingIncome, 300);
  assert.equal(snapshot.reportedEbitda, 350);
  assert.equal(snapshot.incomeStatementMetricDebug?.ebit.source, "computed_operations");
  assert.equal(snapshot.incomeStatementMetricDebug?.ebitda.source, "bottom_up");
  assert.equal(snapshot.ebitdaExplainability?.basis, "computed");
  assert.equal(snapshot.ebitdaExplainability?.computedEbitda, 300);
  assert.equal(snapshot.ebitdaExplainability?.reportedEbitda, 350);
  assert.deepEqual(snapshot.ebitdaExplainability?.missingComponents, []);
}

{
  const snapshot = snapshotFromEntries([
    createNamedIncomeEntry("Revenue", "Revenue", 1000),
    createNamedIncomeEntry("COGS", "COGS", 400),
    createNamedIncomeEntry("Total Operating Expenses", "Operating Expenses", 350),
    createNamedIncomeEntry("Depreciation", "Depreciation / Amortization", 50)
  ]);

  assert.equal(snapshot.operatingExpenses, 300);
  assert.equal(snapshot.depreciationAndAmortization, 50);
  assert.equal(snapshot.ebit, 300);
}

{
  const snapshot = snapshotFromEntries([
    createNamedIncomeEntry("Revenue", "Revenue", 1000),
    createNamedIncomeEntry("COGS", "COGS", 400),
    createNamedIncomeEntry("Operating Income", "Operating Income", 280),
    createNamedIncomeEntry("Reported EBITDA", "EBITDA", 330)
  ]);

  assert.equal(snapshot.ebit, 280);
  assert.equal(snapshot.ebitda, null);
  assert.equal(snapshot.incomeStatementMetricDebug?.ebit.source, "reported_fallback");
  assert.equal(snapshot.incomeStatementMetricDebug?.ebitda.source, "none");
  assert.equal(snapshot.ebitdaExplainability?.basis, "incomplete");
  assert.equal(snapshot.ebitdaExplainability?.computedEbitda, null);
  assert.equal(snapshot.ebitdaExplainability?.reportedEbitda, 330);
  assert.deepEqual(snapshot.ebitdaExplainability?.missingComponents, [
    "Net Income",
    "Interest / Non-operating",
    "Tax Expense",
    "Depreciation & Amortization"
  ]);
}

{
  const snapshot = snapshotFromEntries([
    createNamedIncomeEntry("Revenue", "Revenue", 1000),
    createNamedIncomeEntry("COGS", "COGS", 400),
    createNamedIncomeEntry("Operating Expenses", "Operating Expenses", 300)
  ]);

  assert.equal(snapshot.ebit, 300);
  assert.equal(snapshot.ebitda, null);
  assert.equal(snapshot.adjustedEbitda, null);
  assert.equal(snapshot.incomeStatementMetricDebug?.ebitda.source, "none");
  assert.equal(snapshot.ebitdaExplainability?.basis, "incomplete");
}

{
  const snapshot = snapshotFromEntries([
    createNamedIncomeEntry("Revenue", "Revenue", 1000),
    createNamedIncomeEntry("COGS", "COGS", 400),
    createNamedIncomeEntry("Adjusted EBITDA", "EBITDA", 360)
  ]);

  assert.equal(snapshot.ebitda, null);
  assert.equal(snapshot.reportedEbitda, null);
  assert.equal(snapshot.adjustedEbitda, null);
}

{
  const snapshot = snapshotFromEntries([
    createNamedIncomeEntry("Revenue", "Revenue", 0),
    createNamedIncomeEntry("COGS", "COGS", 0),
    createNamedIncomeEntry("Operating Expenses", "Operating Expenses", 0),
    createNamedIncomeEntry("Net Income", "Net Income", 0),
    createNamedIncomeEntry("Interest Expense", "Non-operating", 0),
    createNamedIncomeEntry("Tax Expense", "Tax Expense", 0),
    createNamedIncomeEntry("Depreciation", "Depreciation / Amortization", 0),
    createNamedIncomeEntry("Reported EBITDA", "EBITDA", 0)
  ]);

  assert.equal(snapshot.ebit, 0);
  assert.equal(snapshot.ebitda, 0);
  assert.equal(snapshot.reportedEbitda, 0);
  assert.equal(snapshot.adjustedEbitda, 0);
}

console.log("calculations tests passed");
