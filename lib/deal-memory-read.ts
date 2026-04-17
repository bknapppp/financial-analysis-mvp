import type { DealMemoryInsertRow } from "./deal-memory.ts";
import { getSupabaseServerClient } from "./supabase.ts";

export type GetLatestDealMemoryError = {
  message: string;
  cause: unknown;
};

export type GetLatestDealMemoryResult = {
  snapshot: DealMemoryInsertRow | null;
  error: GetLatestDealMemoryError | null;
};

type SelectResult = {
  data: DealMemoryInsertRow | null;
  error: unknown;
};

type DealMemoryReadClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<SelectResult>;
      };
    };
  };
};

type GetLatestDealMemoryDependencies = {
  getSupabaseClient: () => DealMemoryReadClient;
  logger: Pick<Console, "error">;
};

const defaultDependencies: GetLatestDealMemoryDependencies = {
  getSupabaseClient: () => getSupabaseServerClient() as unknown as DealMemoryReadClient,
  logger: console
};

const DEAL_MEMORY_LATEST_COLUMNS = "*";

export async function getLatestDealMemoryWithDependencies(
  dealId: string,
  dependencies: GetLatestDealMemoryDependencies
): Promise<GetLatestDealMemoryResult> {
  const { data, error } = await dependencies
    .getSupabaseClient()
    .from("deal_memory_latest")
    .select(DEAL_MEMORY_LATEST_COLUMNS)
    .eq("deal_id", dealId)
    .maybeSingle();

  if (error) {
    dependencies.logger.error("Failed to fetch latest deal memory snapshot", {
      dealId,
      error
    });

    return {
      snapshot: null,
      error: {
        message: "Failed to fetch latest deal memory snapshot.",
        cause: error
      }
    };
  }

  return {
    snapshot: data,
    error: null
  };
}

export async function getLatestDealMemory(
  dealId: string
): Promise<GetLatestDealMemoryResult> {
  return getLatestDealMemoryWithDependencies(dealId, defaultDependencies);
}
