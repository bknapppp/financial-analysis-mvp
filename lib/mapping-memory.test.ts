import assert from "node:assert/strict";
import {
  getSavedMapping,
  findSavedMapping,
  normalizeMappingLabel,
  saveConfirmedMappingToMemory
} from "./mapping-memory.ts";
import type { AccountMapping } from "./types.ts";

const mappings: AccountMapping[] = [
  {
    id: "company-1",
    company_id: "company-a",
    account_name: "SG&A Expense",
    account_name_key: normalizeMappingLabel("SG&A Expense"),
    category: "Operating Expenses",
    statement_type: "income",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "global-1",
    company_id: null,
    account_name: "Revenue",
    account_name_key: normalizeMappingLabel("Revenue"),
    category: "Revenue",
    statement_type: "income",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

assert.equal(normalizeMappingLabel(" SG&A "), "sga");
assert.equal(normalizeMappingLabel("sg & a"), "sga");
assert.equal(normalizeMappingLabel("D&A"), "depreciation amortization");
assert.equal(
  normalizeMappingLabel("Dep & Amort"),
  "depreciation amortization"
);
assert.equal(normalizeMappingLabel("   "), "");

const companyMatch = findSavedMapping({
  mappings,
  companyId: "company-a",
  accountName: "sg & a expense",
  statementType: "income"
});

assert.equal(companyMatch?.scope, "company");
assert.equal(companyMatch?.record.id, "company-1");

const globalMatch = findSavedMapping({
  mappings,
  companyId: "company-b",
  accountName: "Revenue",
  statementType: "income"
});

assert.equal(globalMatch?.scope, "global");
assert.equal(globalMatch?.record.id, "global-1");

function createMockSupabase() {
  return {
    from() {
      const state: {
        companyId?: string | null;
        normalizedLabel?: string;
        statementType?: string;
        id?: string;
      } = {};

      const query = {
        select() {
          return query;
        },
        eq(column: string, value: string) {
          if (column === "company_id") state.companyId = value;
          if (column === "normalized_label") state.normalizedLabel = value;
          if (column === "statement_type") state.statementType = value;
          if (column === "id") state.id = value;
          return query;
        },
        is(column: string, value: null) {
          if (column === "company_id") state.companyId = value;
          return query;
        },
        async maybeSingle() {
          const match =
            mappings.find((mapping) => {
              const normalizedLabel =
                (mapping as AccountMapping & { normalized_label?: string | null })
                  .normalized_label ?? mapping.account_name_key;

              return (
                mapping.company_id === state.companyId &&
                normalizedLabel === state.normalizedLabel &&
                mapping.statement_type === state.statementType
              );
            }) ?? null;

          return { data: match, error: null };
        },
        insert(payload: Record<string, unknown>) {
          return {
            select() {
              return {
                async single() {
                  const now = new Date().toISOString();
                  const record = {
                    id: `inserted-${mappings.length + 1}`,
                    company_id: (payload.company_id as string | null | undefined) ?? null,
                    account_name: String(payload.account_name ?? ""),
                    account_name_key: String(payload.account_name_key ?? ""),
                    category: payload.category as AccountMapping["category"],
                    statement_type: payload.statement_type as AccountMapping["statement_type"],
                    created_at: now,
                    updated_at: now,
                    normalized_label: String(payload.normalized_label ?? ""),
                    concept: String(payload.concept ?? ""),
                    confidence: String(payload.confidence ?? "high"),
                    source: String(payload.source ?? "user")
                  };

                  mappings.push(record as AccountMapping);
                  return {
                    data: record,
                    error: null
                  };
                }
              };
            }
          };
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(column: string, value: string) {
              if (column === "id") {
                state.id = value;
              }

              return {
                select() {
                  return {
                    async single() {
                      const index = mappings.findIndex((mapping) => mapping.id === state.id);

                      if (index < 0) {
                        return { data: null, error: { message: "Not found" } };
                      }

                      const current = mappings[index] as AccountMapping & {
                        normalized_label?: string | null;
                        concept?: string | null;
                        confidence?: string | null;
                        source?: string | null;
                      };
                      const nextRecord = {
                        ...current,
                        account_name: String(payload.account_name ?? current.account_name),
                        account_name_key: String(
                          payload.account_name_key ?? current.account_name_key
                        ),
                        normalized_label: String(
                          payload.normalized_label ?? current.normalized_label ?? ""
                        ),
                        concept: String(payload.concept ?? current.concept ?? ""),
                        category:
                          (payload.category as AccountMapping["category"]) ?? current.category,
                        statement_type:
                          (payload.statement_type as AccountMapping["statement_type"]) ??
                          current.statement_type,
                        confidence: String(
                          payload.confidence ?? current.confidence ?? "high"
                        ),
                        source: String(payload.source ?? current.source ?? "user"),
                        updated_at: String(payload.updated_at ?? current.updated_at)
                      };

                      mappings[index] = nextRecord as AccountMapping;

                      return {
                        data: nextRecord,
                        error: null
                      };
                    }
                  };
                }
              };
            }
          };
        }
      };

      return query;
    }
  };
}

const mockSupabase = createMockSupabase();

const companySavedMapping = await getSavedMapping({
  supabase: mockSupabase,
  companyId: "company-a",
  accountName: "sg & a expense",
  statementType: "income"
});
assert.equal(companySavedMapping?.scope, "company");
assert.equal(companySavedMapping?.record.category, "Operating Expenses");

const globalSavedMapping = await getSavedMapping({
  supabase: mockSupabase,
  companyId: "company-b",
  accountName: "Revenue",
  statementType: "income"
});
assert.equal(globalSavedMapping?.scope, "global");
assert.equal(globalSavedMapping?.record.category, "Revenue");

const missingSavedMapping = await getSavedMapping({
  supabase: mockSupabase,
  companyId: "company-a",
  accountName: "Random Ambiguous Label",
  statementType: "income"
});
assert.equal(missingSavedMapping, null);

const inserted = await saveConfirmedMappingToMemory({
  supabase: mockSupabase,
  companyId: "company-a",
  accountName: "Marketing Expense",
  statementType: "income",
  concept: "Operating Expenses",
  category: "Operating Expenses"
});
assert.equal(inserted.status, "inserted");
assert.equal(inserted.record?.normalized_label, normalizeMappingLabel("Marketing Expense"));
assert.equal(inserted.record?.statement_type, "income");
assert.equal(inserted.record?.company_id, "company-a");

const unchanged = await saveConfirmedMappingToMemory({
  supabase: mockSupabase,
  companyId: "company-a",
  accountName: "Marketing Expense",
  statementType: "income",
  concept: "Operating Expenses",
  category: "Operating Expenses"
});
assert.equal(unchanged.status, "unchanged");
assert.equal(unchanged.record?.normalized_label, normalizeMappingLabel("Marketing Expense"));

const conflict = await saveConfirmedMappingToMemory({
  supabase: mockSupabase,
  companyId: "company-a",
  accountName: "Marketing Expense",
  statementType: "income",
  concept: "Revenue",
  category: "Revenue"
});
assert.equal(conflict.status, "conflict");
assert.equal(conflict.existingRecord?.company_id, "company-a");
assert.equal(conflict.existingRecord?.statement_type, "income");
assert.equal(
  conflict.existingRecord?.normalized_label,
  normalizeMappingLabel("Marketing Expense")
);

const updated = await saveConfirmedMappingToMemory({
  supabase: mockSupabase,
  companyId: "company-a",
  accountName: "Marketing Expense",
  statementType: "income",
  concept: "Revenue",
  category: "Revenue",
  allowOverwrite: true
});
assert.equal(updated.status, "updated");
assert.equal(updated.record?.concept, "Revenue");
assert.equal(updated.record?.category, "Revenue");

const separateStatementType = await saveConfirmedMappingToMemory({
  supabase: mockSupabase,
  companyId: "company-a",
  accountName: "Marketing Expense",
  statementType: "balance_sheet",
  concept: "Operating Expenses",
  category: "Assets"
});
assert.equal(separateStatementType.status, "inserted");

const globalScopeInsert = await saveConfirmedMappingToMemory({
  supabase: mockSupabase,
  companyId: null,
  accountName: "Shared Account",
  statementType: "income",
  concept: "Revenue",
  category: "Revenue"
});
assert.equal(globalScopeInsert.status, "inserted");
assert.equal(globalScopeInsert.record?.company_id, null);

console.log("mapping-memory tests passed");
