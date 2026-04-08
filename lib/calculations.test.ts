import assert from "node:assert/strict";
import { buildSnapshots } from "./calculations.ts";
import type { FinancialEntry, ReportingPeriod } from "./types.ts";

const periods: ReportingPeriod[] = [
  {
    id: "period-1",
    company_id: "company-1",
    label: "Jan 2026",
    period_date: "2026-01-31",
    created_at: new Date().toISOString()
  }
];

function makeEntry(partial: Partial<FinancialEntry>): FinancialEntry {
  return {
    id: partial.id ?? crypto.randomUUID(),
    account_name: partial.account_name ?? "Account",
    statement_type: partial.statement_type ?? "balance_sheet",
    amount: partial.amount ?? 0,
    period_id: partial.period_id ?? "period-1",
    category: partial.category ?? "current_assets.other",
    addback_flag: partial.addback_flag ?? false,
    created_at: partial.created_at ?? new Date().toISOString()
  };
}

const withParentAndLeafRows = buildSnapshots(
  periods,
  [
    makeEntry({ account_name: "Total Assets", amount: 1000, category: "Assets" }),
    makeEntry({ account_name: "Current Assets", amount: 600, category: "current_assets" }),
    makeEntry({ account_name: "Cash", amount: 250, category: "current_assets.cash" }),
    makeEntry({
      account_name: "Accounts Receivable",
      amount: 350,
      category: "current_assets.accounts_receivable"
    }),
    makeEntry({ account_name: "Total Liabilities", amount: 500, category: "Liabilities" }),
    makeEntry({
      account_name: "Current Liabilities",
      amount: 200,
      category: "current_liabilities"
    }),
    makeEntry({
      account_name: "Accounts Payable",
      amount: 90,
      category: "current_liabilities.accounts_payable"
    }),
    makeEntry({
      account_name: "Short Term Debt",
      amount: 10,
      category: "current_liabilities.short_term_debt"
    })
  ],
  []
)[0];

assert.equal(withParentAndLeafRows.currentAssets, 600);
assert.equal(withParentAndLeafRows.currentLiabilities, 100);
assert.equal(withParentAndLeafRows.workingCapital, 500);

const withSourceTotalRows = buildSnapshots(
  periods,
  [
    makeEntry({ account_name: "Total Current Assets", amount: 999, category: "current_assets" }),
    makeEntry({ account_name: "Inventory", amount: 500, category: "current_assets.inventory" }),
    makeEntry({ account_name: "Cash", amount: 50, category: "current_assets.cash" }),
    makeEntry({
      account_name: "Total Current Liabilities",
      amount: 777,
      category: "current_liabilities"
    }),
    makeEntry({
      account_name: "Accounts Payable",
      amount: 300,
      category: "current_liabilities.accounts_payable"
    })
  ],
  []
)[0];

assert.equal(withSourceTotalRows.currentAssets, 550);
assert.equal(withSourceTotalRows.currentLiabilities, 300);
assert.equal(withSourceTotalRows.workingCapital, 250);

const balancedLeafInput = buildSnapshots(
  periods,
  [
    makeEntry({ account_name: "Cash", amount: 150, category: "current_assets.cash" }),
    makeEntry({
      account_name: "Accounts Receivable",
      amount: 50,
      category: "current_assets.accounts_receivable"
    }),
    makeEntry({
      account_name: "Accounts Payable",
      amount: 75,
      category: "current_liabilities.accounts_payable"
    }),
    makeEntry({
      account_name: "Short Term Debt",
      amount: 25,
      category: "current_liabilities.short_term_debt"
    })
  ],
  []
)[0];

assert.equal(balancedLeafInput.currentAssets, 200);
assert.equal(balancedLeafInput.currentLiabilities, 100);
assert.equal(balancedLeafInput.workingCapital, 100);

console.log("calculations tests passed");
