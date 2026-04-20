import assert from "node:assert/strict";
import { getCanonicalPeriodAdjustment } from "./add-backs.ts";
import type { AddBack, FinancialEntry } from "./types";

const periodId = "period-1";

function createEntry(params: {
  id: string;
  amount: number;
  addbackFlag?: boolean;
}): FinancialEntry {
  return {
    id: params.id,
    account_name: `Account ${params.id}`,
    statement_type: "income",
    amount: params.amount,
    period_id: periodId,
    category: "Operating Expenses",
    addback_flag: params.addbackFlag ?? false,
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

console.log("add-backs tests passed");
