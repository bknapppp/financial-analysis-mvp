import {
  buildDealMemorySnapshot,
  mapDealMemorySnapshotToInsertRow,
  type DealMemoryInsertRow,
  type DealMemorySnapshot
} from "./deal-memory.ts";
import { getSupabaseServerClient } from "./supabase.ts";

export type CaptureDealMemorySnapshotResult = {
  success: boolean;
  snapshot: DealMemoryInsertRow | null;
  error: unknown;
};

type InsertResult = {
  data: DealMemoryInsertRow | null;
  error: unknown;
};

type DealMemoryInsertClient = {
  from: (table: string) => {
    insert: (row: DealMemoryInsertRow) => {
      select: (columns: string) => {
        single: () => Promise<InsertResult>;
      };
    };
  };
};

type CaptureDealMemoryDependencies = {
  buildDealMemorySnapshot: (dealId: string) => Promise<DealMemorySnapshot>;
  getSupabaseClient: () => DealMemoryInsertClient;
  logger: Pick<Console, "info" | "error">;
};

const defaultDependencies: CaptureDealMemoryDependencies = {
  buildDealMemorySnapshot,
  getSupabaseClient: () => getSupabaseServerClient() as unknown as DealMemoryInsertClient,
  logger: console
};

const DEAL_MEMORY_RETURNING_COLUMNS = "*";

export async function captureDealMemorySnapshotWithDependencies(
  dealId: string,
  dependencies: CaptureDealMemoryDependencies
): Promise<CaptureDealMemorySnapshotResult> {
  let snapshot: DealMemorySnapshot;

  try {
    snapshot = await dependencies.buildDealMemorySnapshot(dealId);
  } catch (error) {
    dependencies.logger.error("Failed to build deal memory snapshot", {
      dealId,
      error
    });

    return {
      success: false,
      snapshot: null,
      error
    };
  }

  const row = mapDealMemorySnapshotToInsertRow(snapshot);

  const { data, error } = await dependencies
    .getSupabaseClient()
    .from("deal_memory")
    .insert(row)
    .select(DEAL_MEMORY_RETURNING_COLUMNS)
    .single();

  if (error) {
    dependencies.logger.error("Failed to insert deal memory snapshot", {
      dealId,
      snapshotReason: snapshot.snapshotReason,
      isSnapshotReady: snapshot.isSnapshotReady,
      error
    });

    throw error;
  }

  dependencies.logger.info("Deal memory snapshot created", {
    dealId,
    isSnapshotReady: snapshot.isSnapshotReady
  });

  return {
    success: true,
    snapshot: data,
    error: null
  };
}

export async function captureDealMemorySnapshot(
  dealId: string
): Promise<CaptureDealMemorySnapshotResult> {
  return captureDealMemorySnapshotWithDependencies(dealId, defaultDependencies);
}

export async function captureDealMemorySnapshotSafely(
  dealId: string,
  context: string
) {
  try {
    const result = await captureDealMemorySnapshot(dealId);

    if (!result.success) {
      console.error("Deal memory snapshot capture did not succeed", {
        dealId,
        context,
        error: result.error
      });
    }

    return result;
  } catch (error) {
    console.error("Deal memory snapshot capture failed gracefully", {
      dealId,
      context,
      error
    });

    return {
      success: false,
      snapshot: null,
      error
    } satisfies CaptureDealMemorySnapshotResult;
  }
}
