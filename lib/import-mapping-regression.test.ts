import assert from "node:assert/strict";
import { resolveAccountMapping, suggestAccountMapping } from "./auto-mapping.ts";
import { normalizeMappingLabel } from "./mapping-memory.ts";
import type { AccountMapping } from "./types.ts";

function buildMapping(params: {
  id: string;
  companyId: string | null;
  accountName: string;
  category: AccountMapping["category"];
  statementType: AccountMapping["statement_type"];
}): AccountMapping {
  const now = new Date().toISOString();

  return {
    id: params.id,
    company_id: params.companyId,
    account_name: params.accountName,
    account_name_key: normalizeMappingLabel(params.accountName),
    category: params.category,
    statement_type: params.statementType,
    created_at: now,
    updated_at: now
  };
}

const savedMappings: AccountMapping[] = [
  buildMapping({
    id: "company-revenue",
    companyId: "company-a",
    accountName: "Service Revenue",
    category: "COGS",
    statementType: "income"
  }),
  buildMapping({
    id: "global-revenue",
    companyId: null,
    accountName: "Service Revenue",
    category: "Revenue",
    statementType: "income"
  }),
  buildMapping({
    id: "income-shared-label",
    companyId: "company-a",
    accountName: "Reserve",
    category: "Operating Expenses",
    statementType: "income"
  }),
  buildMapping({
    id: "balance-shared-label",
    companyId: "company-a",
    accountName: "Reserve",
    category: "current_assets.cash",
    statementType: "balance_sheet"
  })
];

// 1) company-specific mapping overrides global mapping
const companyScoped = suggestAccountMapping(
  "Service Revenue",
  savedMappings,
  "income",
  "company-a"
);
assert.equal(companyScoped.matchedBy, "memory");
assert.equal(companyScoped.memoryScope, "company");
assert.equal(companyScoped.category, "COGS");

// 2) global mapping applies when no company mapping exists
const globalFallback = suggestAccountMapping(
  "Service Revenue",
  savedMappings,
  "income",
  "company-b"
);
assert.equal(globalFallback.matchedBy, "memory");
assert.equal(globalFallback.memoryScope, "global");
assert.equal(globalFallback.category, "Revenue");

// 3) duplicate labels in the same import resolve consistently
const duplicateRows = ["Service Revenue", "Service Revenue", "Service Revenue"].map(
  (label) => suggestAccountMapping(label, savedMappings, "income", "company-a")
);
assert.equal(duplicateRows.length, 3);
assert.ok(duplicateRows.every((row) => row.category === duplicateRows[0].category));
assert.ok(
  duplicateRows.every((row) => row.statementType === duplicateRows[0].statementType)
);
assert.ok(duplicateRows.every((row) => row.matchedBy === duplicateRows[0].matchedBy));

// 4) fallback behavior works when no saved mapping exists
const unmappedFallback = suggestAccountMapping(
  "Completely Novel Ambiguous Label",
  [],
  "income",
  "company-a"
);
assert.equal(unmappedFallback.matchedBy, "unmapped");
assert.equal(unmappedFallback.confidence, "low");
assert.equal(unmappedFallback.category, null);
assert.equal(unmappedFallback.statementType, null);

// 5) statement-type-aware mapping does not mix income vs balance sheet behavior
const incomeReserve = suggestAccountMapping("Reserve", savedMappings, "income", "company-a");
const balanceReserve = suggestAccountMapping(
  "Reserve",
  savedMappings,
  "balance_sheet",
  "company-a"
);
assert.equal(incomeReserve.category, "Operating Expenses");
assert.equal(incomeReserve.statementType, "income");
assert.equal(balanceReserve.category, "current_assets.cash");
assert.equal(balanceReserve.statementType, "balance_sheet");

// 6) preloaded mappings do not trigger unnecessary DB lookups
let dbLookupCalls = 0;
const noLookupSupabase = {
  from() {
    dbLookupCalls += 1;
    throw new Error("DB lookup should not occur when savedMappings are preloaded.");
  },
  rpc() {
    return Promise.resolve({ error: null });
  }
};

const resolvedFromPreloaded = await resolveAccountMapping({
  supabase: noLookupSupabase,
  accountName: "Service Revenue",
  savedMappings,
  preferredStatementType: "income",
  companyId: "company-a"
});
assert.equal(resolvedFromPreloaded.matchedBy, "memory");
assert.equal(resolvedFromPreloaded.memoryScope, "company");
assert.equal(resolvedFromPreloaded.category, "COGS");
assert.equal(dbLookupCalls, 0);

console.log("import-mapping regression tests passed");
