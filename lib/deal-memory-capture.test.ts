import assert from "node:assert/strict";
import {
  captureDealMemorySnapshotWithDependencies,
  type CaptureDealMemorySnapshotResult
} from "./deal-memory-capture.ts";
import type { DealMemoryInsertRow, DealMemorySnapshot } from "./deal-memory.ts";

function createSnapshot(overrides?: Partial<DealMemorySnapshot>): DealMemorySnapshot {
  return {
    dealId: "deal-1",
    companyId: "company-1",
    snapshotAt: "2026-04-14T22:00:00.000Z",
    revenue: 4_000_000,
    ebitda: 800_000,
    adjustedEbitda: 900_000,
    ebitdaMargin: 20,
    industry: "HVAC",
    businessModel: "Service",
    revenueBand: "1–5M",
    sourceCompletenessScore: 88,
    hasTaxReturns: true,
    hasFinancialStatements: true,
    reconciliationStatus: "balanced",
    addbackCount: 2,
    addbackValue: 100_000,
    addbackTypes: ["owner_related"],
    riskFlags: [],
    blockerCount: 0,
    completionPercent: 90,
    currentStage: "underwriting",
    isSnapshotReady: true,
    isBenchmarkEligible: true,
    financialsConfidence: "high",
    snapshotReason: "Scheduled capture",
    ...overrides
  };
}

function createDependencies(params?: {
  snapshot?: DealMemorySnapshot;
  insertResult?: { data: DealMemoryInsertRow | null; error: unknown };
}) {
  const insertedRows: DealMemoryInsertRow[] = [];
  const infoLogs: Array<{ message: string; context: unknown }> = [];
  const errorLogs: Array<{ message: string; context: unknown }> = [];

  return {
    insertedRows,
    infoLogs,
    errorLogs,
    dependencies: {
      buildDealMemorySnapshot: async () => params?.snapshot ?? createSnapshot(),
      getSupabaseClient: () => ({
        from: (table: string) => {
          assert.equal(table, "deal_memory");

          return {
            insert: (row: DealMemoryInsertRow) => {
              insertedRows.push(row);

              return {
                select: (columns: string) => {
                  assert.equal(columns, "*");

                  return {
                    single: async () =>
                      params?.insertResult ?? {
                        data: {
                          id: `snapshot-${insertedRows.length}`,
                          created_at: "2026-04-14T22:00:01.000Z",
                          ...row
                        },
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
        info: (message: string, context: unknown) => {
          infoLogs.push({ message, context });
        },
        error: (message: string, context: unknown) => {
          errorLogs.push({ message, context });
        }
      }
    }
  };
}

{
  const harness = createDependencies({
    snapshot: createSnapshot({
      revenue: null,
      addbackValue: null,
      snapshotReason: "Not ready yet",
      isSnapshotReady: false
    })
  });

  const result = await captureDealMemorySnapshotWithDependencies(
    "deal-1",
    harness.dependencies
  );

  assert.equal(result.success, true);
  assert.equal(result.error, null);
  assert.equal(harness.insertedRows.length, 1);
  assert.equal(harness.insertedRows[0]?.revenue, null);
  assert.equal(harness.insertedRows[0]?.addback_value, null);
  assert.equal(harness.insertedRows[0]?.snapshot_reason, "Not ready yet");
  assert.equal(harness.insertedRows[0]?.is_snapshot_ready, false);
  assert.equal(harness.infoLogs.length, 1);
  assert.equal(harness.infoLogs[0]?.message, "Deal memory snapshot created");
}

{
  const expectedError = new Error("insert failed");
  const harness = createDependencies({
    insertResult: {
      data: null,
      error: expectedError
    }
  });

  let thrown: unknown = null;
  try {
    await captureDealMemorySnapshotWithDependencies("deal-2", harness.dependencies);
  } catch (error) {
    thrown = error;
  }

  assert.equal(thrown, expectedError);
  assert.equal(harness.errorLogs.length, 1);
  assert.equal(harness.errorLogs[0]?.message, "Failed to insert deal memory snapshot");
}

{
  const harness = createDependencies();

  const firstResult: CaptureDealMemorySnapshotResult =
    await captureDealMemorySnapshotWithDependencies("deal-3", harness.dependencies);
  const secondResult: CaptureDealMemorySnapshotResult =
    await captureDealMemorySnapshotWithDependencies("deal-3", harness.dependencies);

  assert.equal(firstResult.success, true);
  assert.equal(secondResult.success, true);
  assert.equal(harness.insertedRows.length, 2);
  assert.notEqual(firstResult.snapshot?.id, secondResult.snapshot?.id);
}

console.log("deal-memory capture tests passed");
