import assert from "node:assert/strict";
import {
  findSavedMapping,
  getSavedMapping,
  loadSavedMappings,
  normalizeMappingLabel,
  saveConfirmedMappingToMemory
} from "./mapping-memory.ts";
import type { AccountMapping } from "./types.ts";

const now = new Date().toISOString();

const mappings: AccountMapping[] = [
  {
    id: "company-tax-1",
    company_id: "company-a",
    account_name: "Gross receipts",
    account_name_key: normalizeMappingLabel("Gross receipts"),
    normalized_label: normalizeMappingLabel("Gross receipts"),
    category: "Revenue",
    concept: "Revenue",
    statement_type: "income",
    source_type: "tax_return",
    confidence: "high",
    usage_count: 3,
    created_at: now,
    updated_at: now
  },
  {
    id: "company-generic-1",
    company_id: "company-a",
    account_name: "SG&A Expense",
    account_name_key: normalizeMappingLabel("SG&A Expense"),
    normalized_label: normalizeMappingLabel("SG&A Expense"),
    category: "Operating Expenses",
    concept: "Operating Expenses",
    statement_type: "income",
    source_type: null,
    confidence: "high",
    usage_count: 2,
    created_at: now,
    updated_at: now
  },
  {
    id: "shared-tax-1",
    company_id: null,
    account_name: "Officer compensation",
    account_name_key: normalizeMappingLabel("Officer compensation"),
    normalized_label: normalizeMappingLabel("Officer compensation"),
    category: "Operating Expenses",
    concept: "Operating Expenses",
    statement_type: "income",
    source_type: "tax_return",
    confidence: "high",
    usage_count: 8,
    created_at: now,
    updated_at: now
  },
  {
    id: "shared-generic-1",
    company_id: null,
    account_name: "Revenue",
    account_name_key: normalizeMappingLabel("Revenue"),
    normalized_label: normalizeMappingLabel("Revenue"),
    category: "Revenue",
    concept: "Revenue",
    statement_type: "income",
    source_type: null,
    confidence: "high",
    usage_count: 12,
    created_at: now,
    updated_at: now
  },
  {
    id: "shared-ambiguous-1",
    company_id: null,
    account_name: "Other deductions",
    account_name_key: normalizeMappingLabel("Other deductions"),
    normalized_label: normalizeMappingLabel("Other deductions"),
    category: "Operating Expenses",
    concept: "Operating Expenses",
    statement_type: "income",
    source_type: "tax_return",
    confidence: "medium",
    usage_count: 20,
    created_at: now,
    updated_at: now
  }
];

assert.equal(normalizeMappingLabel(" SG&A "), "sga");
assert.equal(normalizeMappingLabel("sg & a"), "sga");
assert.equal(normalizeMappingLabel("D&A"), "depreciation amortization");
assert.equal(normalizeMappingLabel("Dep & Amort"), "depreciation amortization");
assert.equal(normalizeMappingLabel("   "), "");

const companySpecificTaxMatch = findSavedMapping({
  mappings,
  companyId: "company-a",
  accountName: "Gross receipts",
  statementType: "income",
  sourceType: "tax_return"
});
assert.equal(companySpecificTaxMatch?.scope, "company");
assert.equal(companySpecificTaxMatch?.sourceMatch, "exact");
assert.equal(companySpecificTaxMatch?.record.id, "company-tax-1");

const sharedTaxMatch = findSavedMapping({
  mappings,
  companyId: "company-b",
  accountName: "Officer compensation",
  statementType: "income",
  sourceType: "tax_return"
});
assert.equal(sharedTaxMatch?.scope, "shared");
assert.equal(sharedTaxMatch?.sourceMatch, "exact");
assert.equal(sharedTaxMatch?.record.id, "shared-tax-1");

const genericSharedMatch = findSavedMapping({
  mappings,
  companyId: "company-b",
  accountName: "Revenue",
  statementType: "income",
  sourceType: "reported_financials"
});
assert.equal(genericSharedMatch?.scope, "shared");
assert.equal(genericSharedMatch?.sourceMatch, "generic");
assert.equal(genericSharedMatch?.record.id, "shared-generic-1");

const sourceMismatchFallsBackToGeneric = findSavedMapping({
  mappings,
  companyId: "company-a",
  accountName: "SG&A Expense",
  statementType: "income",
  sourceType: "tax_return"
});
assert.equal(sourceMismatchFallsBackToGeneric?.scope, "company");
assert.equal(sourceMismatchFallsBackToGeneric?.sourceMatch, "generic");
assert.equal(sourceMismatchFallsBackToGeneric?.record.id, "company-generic-1");

const ambiguousSharedMatch = findSavedMapping({
  mappings,
  companyId: "company-b",
  accountName: "Other deductions",
  statementType: "income",
  sourceType: "tax_return"
});
assert.equal(
  ambiguousSharedMatch,
  null,
  "Broad ambiguous labels should not resolve from shared memory."
);

function createMockSupabase() {
  return {
    from() {
      const state: {
        companyId?: string | null;
        normalizedLabel?: string;
        statementType?: string;
        sourceType?: string | null;
        id?: string;
      } = {};

      const applyFilters = () =>
        mappings.filter((mapping) => {
          const normalizedLabel = mapping.normalized_label ?? mapping.account_name_key;

          if (state.companyId !== undefined && mapping.company_id !== state.companyId) {
            return false;
          }

          if (
            state.normalizedLabel !== undefined &&
            normalizedLabel !== state.normalizedLabel
          ) {
            return false;
          }

          if (
            state.statementType !== undefined &&
            mapping.statement_type !== state.statementType
          ) {
            return false;
          }

          if (state.sourceType !== undefined && mapping.source_type !== state.sourceType) {
            return false;
          }

          return true;
        });

      const query = {
        select() {
          return query;
        },
        returns() {
          return Promise.resolve({ data: applyFilters(), error: null });
        },
        eq(column: string, value: string) {
          if (column === "company_id") state.companyId = value;
          if (column === "normalized_label") state.normalizedLabel = value;
          if (column === "statement_type") state.statementType = value;
          if (column === "source_type") state.sourceType = value;
          if (column === "id") state.id = value;
          return query;
        },
        is(column: string, value: null) {
          if (column === "company_id") state.companyId = value;
          if (column === "source_type") state.sourceType = value;
          return query;
        },
        async maybeSingle() {
          return { data: applyFilters()[0] ?? null, error: null };
        },
        insert(payload: Record<string, unknown>) {
          return {
            select() {
              return {
                async single() {
                  const record = {
                    id: `inserted-${mappings.length + 1}`,
                    company_id: (payload.company_id as string | null | undefined) ?? null,
                    account_name: String(payload.account_name ?? ""),
                    account_name_key: String(payload.account_name_key ?? ""),
                    normalized_label: String(payload.normalized_label ?? ""),
                    concept: String(payload.concept ?? ""),
                    category: payload.category as AccountMapping["category"],
                    statement_type: payload.statement_type as AccountMapping["statement_type"],
                    source_type:
                      (payload.source_type as AccountMapping["source_type"]) ?? null,
                    confidence: String(payload.confidence ?? "high"),
                    source: String(payload.source ?? "user"),
                    usage_count: Number(payload.usage_count ?? 0),
                    last_used_at: String(payload.last_used_at ?? now),
                    mapping_method: String(payload.mapping_method ?? ""),
                    mapping_explanation: String(payload.mapping_explanation ?? ""),
                    matched_rule: String(payload.matched_rule ?? ""),
                    created_at: now,
                    updated_at: now
                  };

                  mappings.push(record);
                  return { data: record, error: null };
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

                      const current = mappings[index]!;
                      const nextRecord: AccountMapping = {
                        ...current,
                        account_name: String(payload.account_name ?? current.account_name),
                        account_name_key: String(
                          payload.account_name_key ?? current.account_name_key
                        ),
                        normalized_label: String(
                          payload.normalized_label ??
                            current.normalized_label ??
                            current.account_name_key
                        ),
                        concept: String(payload.concept ?? current.concept ?? ""),
                        category:
                          (payload.category as AccountMapping["category"]) ?? current.category,
                        statement_type:
                          (payload.statement_type as AccountMapping["statement_type"]) ??
                          current.statement_type,
                        source_type:
                          (payload.source_type as AccountMapping["source_type"]) ??
                          current.source_type ??
                          null,
                        confidence: String(payload.confidence ?? current.confidence ?? "high"),
                        source: String(payload.source ?? current.source ?? "user"),
                        usage_count: Number(
                          payload.usage_count ?? current.usage_count ?? 0
                        ),
                        last_used_at: String(
                          payload.last_used_at ?? current.last_used_at ?? now
                        ),
                        mapping_method: String(
                          payload.mapping_method ?? current.mapping_method ?? ""
                        ),
                        mapping_explanation: String(
                          payload.mapping_explanation ??
                            current.mapping_explanation ??
                            ""
                        ),
                        matched_rule: String(
                          payload.matched_rule ?? current.matched_rule ?? ""
                        ),
                        updated_at: String(payload.updated_at ?? current.updated_at),
                        created_at: current.created_at
                      };

                      mappings[index] = nextRecord;
                      return { data: nextRecord, error: null };
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
  accountName: "Gross receipts",
  statementType: "income",
  sourceType: "tax_return"
});
assert.equal(companySavedMapping?.scope, "company");
assert.equal(companySavedMapping?.sourceMatch, "exact");

const sharedSavedMapping = await getSavedMapping({
  supabase: mockSupabase,
  companyId: "company-z",
  accountName: "Revenue",
  statementType: "income",
  sourceType: "reported_financials"
});
assert.equal(sharedSavedMapping?.scope, "shared");
assert.equal(sharedSavedMapping?.sourceMatch, "generic");

const loadedMappings = await loadSavedMappings({
  supabase: mockSupabase,
  companyId: "company-a"
});
assert.equal(
  loadedMappings.some((mapping) => mapping.company_id === "company-a"),
  true
);
assert.equal(
  loadedMappings.some((mapping) => mapping.company_id === null),
  true
);

const inserted = await saveConfirmedMappingToMemory({
  supabase: mockSupabase,
  companyId: "company-a",
  accountName: "Marketing Expense",
  statementType: "income",
  sourceType: "reported_financials",
  concept: "Operating Expenses",
  category: "Operating Expenses",
  source: "reported_financials_import"
});
assert.equal(inserted.status, "inserted");
assert.equal(inserted.record?.source_type, "reported_financials");
assert.equal(inserted.record?.usage_count, 1);

const unchanged = await saveConfirmedMappingToMemory({
  supabase: mockSupabase,
  companyId: "company-a",
  accountName: "Marketing Expense",
  statementType: "income",
  sourceType: "reported_financials",
  concept: "Operating Expenses",
  category: "Operating Expenses",
  source: "reported_financials_import"
});
assert.equal(unchanged.status, "unchanged");
assert.equal(unchanged.record?.usage_count, 2);

const conflict = await saveConfirmedMappingToMemory({
  supabase: mockSupabase,
  companyId: "company-a",
  accountName: "Marketing Expense",
  statementType: "income",
  sourceType: "reported_financials",
  concept: "Revenue",
  category: "Revenue"
});
assert.equal(conflict.status, "conflict");

const updated = await saveConfirmedMappingToMemory({
  supabase: mockSupabase,
  companyId: "company-a",
  accountName: "Marketing Expense",
  statementType: "income",
  sourceType: "reported_financials",
  concept: "Revenue",
  category: "Revenue",
  allowOverwrite: true
});
assert.equal(updated.status, "updated");
assert.equal(updated.record?.category, "Revenue");
assert.equal(updated.record?.usage_count, 3);

const separateSourceType = await saveConfirmedMappingToMemory({
  supabase: mockSupabase,
  companyId: "company-a",
  accountName: "Marketing Expense",
  statementType: "income",
  sourceType: "tax_return",
  concept: "Operating Expenses",
  category: "Operating Expenses"
});
assert.equal(separateSourceType.status, "inserted");
assert.equal(separateSourceType.record?.source_type, "tax_return");

console.log("mapping-memory tests passed");
