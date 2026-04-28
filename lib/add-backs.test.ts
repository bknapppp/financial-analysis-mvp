import assert from "node:assert/strict";
import {
  generateAddBackSuggestions,
  getCanonicalPeriodAdjustment
} from "./add-backs.ts";
import type { AddBack, FinancialEntry, ReportingPeriod } from "./types";

const periodId = "period-1";
const period: ReportingPeriod = {
  id: periodId,
  company_id: "company-1",
  label: "FY 2025",
  period_date: "2025-12-31",
  created_at: "2026-01-01T00:00:00.000Z"
};
const priorPeriodOne: ReportingPeriod = {
  id: "period-0",
  company_id: "company-1",
  label: "FY 2024",
  period_date: "2024-12-31",
  created_at: "2026-01-01T00:00:00.000Z"
};
const priorPeriodTwo: ReportingPeriod = {
  id: "period--1",
  company_id: "company-1",
  label: "FY 2023",
  period_date: "2023-12-31",
  created_at: "2026-01-01T00:00:00.000Z"
};

function createEntry(params: {
  id: string;
  amount: number;
  addbackFlag?: boolean;
  accountName?: string;
  periodId?: string;
  confidence?: FinancialEntry["confidence"];
}): FinancialEntry {
  return {
    id: params.id,
    account_name: params.accountName ?? `Account ${params.id}`,
    statement_type: "income",
    amount: params.amount,
    period_id: params.periodId ?? periodId,
    category: "Operating Expenses",
    addback_flag: params.addbackFlag ?? false,
    confidence: params.confidence,
    created_at: "2026-01-01T00:00:00.000Z"
  };
}

function createAddBack(params: {
  id: string;
  status: AddBack["status"];
  amount: number;
}): AddBack {
  return {
    id: params.id,
    company_id: "company-1",
    period_id: periodId,
    linked_entry_id: null,
    type: "owner_related",
    description: `Add-back ${params.id}`,
    amount: params.amount,
    classification_confidence: "high",
    source: "user",
    status: params.status,
    justification: "Test justification",
    supporting_reference: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  };
}

{
  const adjustment = getCanonicalPeriodAdjustment({
    periodId,
    addBacks: [createAddBack({ id: "rejected-1", status: "rejected", amount: 25 })],
    entries: [createEntry({ id: "entry-1", amount: 40, addbackFlag: true })]
  });

  assert.equal(adjustment.source, "persisted");
  assert.equal(adjustment.usesLegacyFallback, false);
  assert.equal(adjustment.acceptedAddBackTotal, 0);
  assert.equal(adjustment.lines.length, 0);
}

{
  const adjustment = getCanonicalPeriodAdjustment({
    periodId,
    addBacks: [createAddBack({ id: "accepted-1", status: "accepted", amount: 25 })],
    entries: [createEntry({ id: "entry-1", amount: 40, addbackFlag: true })]
  });

  assert.equal(adjustment.source, "persisted");
  assert.equal(adjustment.usesLegacyFallback, false);
  assert.equal(adjustment.acceptedAddBackTotal, 25);
  assert.equal(adjustment.lines.length, 1);
}

{
  const adjustment = getCanonicalPeriodAdjustment({
    periodId,
    addBacks: [createAddBack({ id: "suggested-1", status: "suggested", amount: 25 })],
    entries: []
  });

  assert.equal(adjustment.source, "persisted");
  assert.equal(adjustment.usesLegacyFallback, false);
  assert.equal(adjustment.acceptedAddBackTotal, 0);
  assert.equal(adjustment.lines.length, 0);
}

{
  const suggestions = generateAddBackSuggestions({
    companyId: "company-1",
    periods: [priorPeriodTwo, priorPeriodOne, period],
    entries: [
      createEntry({
        id: "travel-2023",
        accountName: "Travel and entertainment",
        amount: -1000,
        periodId: priorPeriodTwo.id
      }),
      createEntry({
        id: "travel-2024",
        accountName: "Travel and entertainment",
        amount: -1200,
        periodId: priorPeriodOne.id
      }),
      createEntry({
        id: "travel-2025",
        accountName: "Travel and entertainment",
        amount: -3000
      })
    ],
    existingAddBacks: []
  });

  const runRateSuggestion = suggestions.find(
    (item) => item.linkedEntryId === "travel-2025" && item.type === "run_rate_adjustment"
  );
  const keywordSuggestion = suggestions.find(
    (item) => item.linkedEntryId === "travel-2025" && item.type === "discretionary"
  );

  assert.equal(runRateSuggestion?.amount, 1900);
  assert.equal(keywordSuggestion?.amount, 3000);
}

console.log("add-backs tests passed");
