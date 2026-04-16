import assert from "node:assert/strict";
import {
  getLatestDealMemoryWithDependencies,
  type GetLatestDealMemoryResult
} from "./deal-memory-read.ts";
import type { DealMemoryInsertRow } from "./deal-memory.ts";

function createSnapshot(overrides?: Partial<DealMemoryInsertRow>): DealMemoryInsertRow {
  return {
    id: "snapshot-1",
    deal_id: "deal-1",
    company_id: "company-1",
    snapshot_at: "2026-04-16T12:00:00.000Z",
    revenue: 4_000_000,
    ebitda: 800_000,
    adjusted_ebitda: 950_000,
    ebitda_margin: 20,
    industry: "HVAC",
    business_model: null,
    revenue_band: "1â€“5M",
    source_completeness_score: 88,
    has_tax_returns: true,
    has_financial_statements: true,
    reconciliation_status: "balanced",
    addback_count: 2,
    addback_value: null,
    addback_types: ["owner_related"],
    risk_flags: [],
    blocker_count: 0,
    completion_percent: 90,
    current_stage: "underwriting",
    is_snapshot_ready: true,
    is_benchmark_eligible: true,
    financials_confidence: "high",
    snapshot_reason: null,
    created_at: "2026-04-16T12:00:01.000Z",
    ...overrides
  };
}

function createDependencies(params?: {
  selectResult?: { data: DealMemoryInsertRow | null; error: unknown };
}) {
  const errorLogs: Array<{ message: string; context: unknown }> = [];

  return {
    errorLogs,
    dependencies: {
      getSupabaseClient: () => ({
        from: (table: string) => {
          assert.equal(table, "deal_memory_latest");

          return {
            select: (columns: string) => {
              assert.equal(columns, "*");

              return {
                eq: (column: string, value: string) => {
                  assert.equal(column, "deal_id");
                  assert.equal(typeof value, "string");

                  return {
                    maybeSingle: async () =>
                      params?.selectResult ?? {
                        data: createSnapshot({ deal_id: value }),
                        error: null
                      }
                  };
                }
              };
            }
          };
        }
      }),
      logger: {
        error: (message: string, context: unknown) => {
          errorLogs.push({ message, context });
        }
      }
    }
  };
}

{
  const harness = createDependencies();
  const result: GetLatestDealMemoryResult = await getLatestDealMemoryWithDependencies(
    "deal-1",
    harness.dependencies
  );

  assert.equal(result.error, null);
  assert.equal(result.snapshot?.deal_id, "deal-1");
  assert.equal(result.snapshot?.addback_value, null);
}

{
  const harness = createDependencies({
    selectResult: {
      data: null,
      error: null
    }
  });
  const result = await getLatestDealMemoryWithDependencies("deal-2", harness.dependencies);

  assert.equal(result.error, null);
  assert.equal(result.snapshot, null);
}

{
  const expectedError = new Error("select failed");
  const harness = createDependencies({
    selectResult: {
      data: null,
      error: expectedError
    }
  });
  const result = await getLatestDealMemoryWithDependencies("deal-3", harness.dependencies);

  assert.equal(result.snapshot, null);
  assert.equal(result.error?.message, "Failed to fetch latest deal memory snapshot.");
  assert.equal(result.error?.cause, expectedError);
  assert.equal(harness.errorLogs.length, 1);
  assert.equal(harness.errorLogs[0]?.message, "Failed to fetch latest deal memory snapshot");
}

console.log("deal-memory read tests passed");
