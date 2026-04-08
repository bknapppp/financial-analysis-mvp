import assert from "node:assert/strict";
import { buildSnapshots } from "./calculations.ts";
import type { FinancialEntry, ReportingPeriod } from "./types";

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

function snapshotFromEntries(entries: FinancialEntry[]) {
  const snapshots = buildSnapshots([period], entries, []);
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

console.log("calculations tests passed");
