import assert from "node:assert/strict";
import {
  getBenchmarkPeerSetWithDependencies,
  type GetBenchmarkPeerSetResult
} from "./deal-memory-benchmark.ts";
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
    revenue_band: "1-5M",
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

function createDependencies(params: {
  currentSnapshot?: DealMemoryInsertRow | null;
  candidateSnapshots?: DealMemoryInsertRow[];
  currentError?: unknown;
  candidatesError?: unknown;
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
                eq: (column: string, value: string | boolean) => {
                  if (column === "deal_id") {
                    assert.equal(typeof value, "string");

                    return {
                      maybeSingle: async () => ({
                        data:
                          params.currentSnapshot === undefined
                            ? createSnapshot({ deal_id: value })
                            : params.currentSnapshot,
                        error: params.currentError ?? null
                      })
                    };
                  }

                  assert.equal(column, "is_benchmark_eligible");
                  assert.equal(value, true);

                  return {
                    neq: async (neqColumn: string, neqValue: string) => {
                      assert.equal(neqColumn, "deal_id");
                      assert.equal(typeof neqValue, "string");

                      return {
                        data: params.candidateSnapshots ?? [],
                        error: params.candidatesError ?? null
                      };
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
  const harness = createDependencies({
    currentSnapshot: createSnapshot({
      deal_id: "deal-1",
      industry: "HVAC",
      revenue_band: "1-5M"
    }),
    candidateSnapshots: [
      createSnapshot({
        id: "peer-1",
        deal_id: "deal-2",
        company_id: "company-2",
        snapshot_at: "2026-04-16T10:00:00.000Z",
        industry: "HVAC",
        revenue_band: "1-5M"
      }),
      createSnapshot({
        id: "peer-2",
        deal_id: "deal-3",
        company_id: "company-3",
        snapshot_at: "2026-04-16T11:00:00.000Z",
        industry: "HVAC",
        revenue_band: "1-5M"
      }),
      createSnapshot({
        id: "peer-3",
        deal_id: "deal-4",
        company_id: "company-4",
        snapshot_at: "2026-04-16T09:00:00.000Z",
        industry: "HVAC",
        revenue_band: "1-5M"
      }),
      createSnapshot({
        id: "peer-4",
        deal_id: "deal-5",
        company_id: "company-5",
        snapshot_at: "2026-04-16T08:00:00.000Z",
        industry: "Plumbing",
        revenue_band: "1-5M"
      })
    ]
  });
  const result: GetBenchmarkPeerSetResult = await getBenchmarkPeerSetWithDependencies(
    "deal-1",
    harness.dependencies
  );

  assert.equal(result.error, null);
  assert.equal(result.metadata.peerCount, 3);
  assert.deepEqual(result.peers.map((peer) => peer.deal_id), ["deal-3", "deal-2", "deal-4"]);
  assert.equal(result.metadata.filtersApplied.industry, "exact");
  assert.equal(result.metadata.filtersApplied.revenueBand, "exact");
  assert.equal(result.metadata.filtersApplied.strategy, "exact_match");
}

{
  const harness = createDependencies({
    currentSnapshot: createSnapshot({
      deal_id: "deal-1",
      industry: "HVAC",
      revenue_band: "1-5M"
    }),
    candidateSnapshots: [
      createSnapshot({
        id: "peer-1",
        deal_id: "deal-2",
        company_id: "company-2",
        snapshot_at: "2026-04-16T10:00:00.000Z",
        industry: "HVAC",
        revenue_band: "1-5M"
      }),
      createSnapshot({
        id: "peer-2",
        deal_id: "deal-3",
        company_id: "company-3",
        snapshot_at: "2026-04-16T11:00:00.000Z",
        industry: "HVAC",
        revenue_band: "5-10M"
      }),
      createSnapshot({
        id: "peer-3",
        deal_id: "deal-4",
        company_id: "company-4",
        snapshot_at: "2026-04-16T09:00:00.000Z",
        industry: "HVAC",
        revenue_band: "10M+"
      }),
      createSnapshot({
        id: "peer-4",
        deal_id: "deal-5",
        company_id: "company-5",
        snapshot_at: "2026-04-16T08:00:00.000Z",
        industry: "Plumbing",
        revenue_band: "1-5M"
      })
    ]
  });
  const result = await getBenchmarkPeerSetWithDependencies("deal-1", harness.dependencies);

  assert.equal(result.error, null);
  assert.equal(result.metadata.peerCount, 3);
  assert.deepEqual(result.peers.map((peer) => peer.deal_id), ["deal-2", "deal-3", "deal-4"]);
  assert.equal(result.metadata.filtersApplied.industry, "exact");
  assert.equal(result.metadata.filtersApplied.revenueBand, "relaxed");
  assert.equal(result.metadata.filtersApplied.strategy, "revenue_band_relaxed");
}

{
  const harness = createDependencies({
    currentSnapshot: createSnapshot({
      deal_id: "deal-1",
      industry: "HVAC",
      revenue_band: "1-5M"
    }),
    candidateSnapshots: []
  });
  const result = await getBenchmarkPeerSetWithDependencies("deal-1", harness.dependencies);

  assert.equal(result.error, null);
  assert.equal(result.metadata.peerCount, 0);
  assert.deepEqual(result.peers, []);
  assert.equal(result.metadata.filtersApplied.strategy, "industry_relaxed");
}

console.log("deal-memory benchmark tests passed");
