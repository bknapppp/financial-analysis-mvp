import type { DealMemoryInsertRow, DealMemorySnapshot } from "./deal-memory.ts";
import { getSupabaseServerClient } from "./supabase.ts";

const DEAL_MEMORY_LATEST_COLUMNS = "*";
const MIN_BENCHMARK_PEER_COUNT = 3;

export type BenchmarkPeerFilterStrength = "exact" | "relaxed" | "unavailable";

export type BenchmarkPeerFiltersApplied = {
  industry: BenchmarkPeerFilterStrength;
  revenueBand: BenchmarkPeerFilterStrength;
  strategy: "exact_match" | "revenue_band_relaxed" | "industry_relaxed" | "missing_current_snapshot";
};

export type GetBenchmarkPeerSetError = {
  message: string;
  cause: unknown;
};

export type GetBenchmarkPeerSetResult = {
  peers: DealMemoryInsertRow[];
  metadata: {
    peerCount: number;
    filtersApplied: BenchmarkPeerFiltersApplied;
  };
  error: GetBenchmarkPeerSetError | null;
};

export type BenchmarkMetricSummary = {
  median: number;
  min: number;
  max: number;
  count: number;
};

export type BenchmarkSummary = {
  peerCount: number;
  metrics: {
    revenue: BenchmarkMetricSummary | null;
    ebitda: BenchmarkMetricSummary | null;
    adjustedEbitda: BenchmarkMetricSummary | null;
    ebitdaMargin: BenchmarkMetricSummary | null;
    addbackValue: BenchmarkMetricSummary | null;
    completionPercent: BenchmarkMetricSummary | null;
  };
};

type SingleSelectResult = {
  data: DealMemoryInsertRow | null;
  error: unknown;
};

type MultiSelectResult = {
  data: DealMemoryInsertRow[] | null;
  error: unknown;
};

type DealMemoryBenchmarkClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string | boolean) => {
        maybeSingle?: () => Promise<SingleSelectResult>;
        neq?: (neqColumn: string, neqValue: string) => Promise<MultiSelectResult>;
      };
    };
  };
};

type GetBenchmarkPeerSetDependencies = {
  getSupabaseClient: () => DealMemoryBenchmarkClient;
  logger: Pick<Console, "error">;
};

const defaultDependencies: GetBenchmarkPeerSetDependencies = {
  getSupabaseClient: () => getSupabaseServerClient() as unknown as DealMemoryBenchmarkClient,
  logger: console
};

function sortPeers(
  peers: DealMemoryInsertRow[],
  currentSnapshot: DealMemoryInsertRow | null
) {
  return [...peers].sort((left, right) => {
    const leftIndustryMatch =
      currentSnapshot?.industry !== null &&
      currentSnapshot?.industry !== undefined &&
      left.industry === currentSnapshot.industry;
    const rightIndustryMatch =
      currentSnapshot?.industry !== null &&
      currentSnapshot?.industry !== undefined &&
      right.industry === currentSnapshot.industry;

    if (leftIndustryMatch !== rightIndustryMatch) {
      return leftIndustryMatch ? -1 : 1;
    }

    const leftRevenueBandMatch =
      currentSnapshot?.revenue_band !== null &&
      currentSnapshot?.revenue_band !== undefined &&
      left.revenue_band === currentSnapshot.revenue_band;
    const rightRevenueBandMatch =
      currentSnapshot?.revenue_band !== null &&
      currentSnapshot?.revenue_band !== undefined &&
      right.revenue_band === currentSnapshot.revenue_band;

    if (leftRevenueBandMatch !== rightRevenueBandMatch) {
      return leftRevenueBandMatch ? -1 : 1;
    }

    return right.snapshot_at.localeCompare(left.snapshot_at);
  });
}

function selectPeers(params: {
  currentSnapshot: DealMemoryInsertRow | null;
  candidates: DealMemoryInsertRow[];
}): {
  peers: DealMemoryInsertRow[];
  filtersApplied: BenchmarkPeerFiltersApplied;
} {
  const { currentSnapshot, candidates } = params;

  if (!currentSnapshot) {
    return {
      peers: [] as DealMemoryInsertRow[],
      filtersApplied: {
        industry: "unavailable" as const,
        revenueBand: "unavailable" as const,
        strategy: "missing_current_snapshot" as const
      }
    };
  }

  const hasIndustry = typeof currentSnapshot.industry === "string";
  const hasRevenueBand = typeof currentSnapshot.revenue_band === "string";

  const sameIndustry = hasIndustry
    ? candidates.filter((peer) => peer.industry === currentSnapshot.industry)
    : [];
  const sameIndustryAndRevenueBand =
    hasIndustry && hasRevenueBand
      ? sameIndustry.filter((peer) => peer.revenue_band === currentSnapshot.revenue_band)
      : [];

  if (sameIndustryAndRevenueBand.length >= MIN_BENCHMARK_PEER_COUNT) {
    return {
      peers: sortPeers(sameIndustryAndRevenueBand, currentSnapshot),
      filtersApplied: {
        industry: hasIndustry ? "exact" : "unavailable",
        revenueBand: hasRevenueBand ? "exact" : "unavailable",
        strategy: "exact_match"
      }
    };
  }

  if (sameIndustry.length >= MIN_BENCHMARK_PEER_COUNT) {
    return {
      peers: sortPeers(sameIndustry, currentSnapshot),
      filtersApplied: {
        industry: hasIndustry ? "exact" : "unavailable",
        revenueBand: hasRevenueBand ? "relaxed" : "unavailable",
        strategy: "revenue_band_relaxed"
      }
    };
  }

  return {
    peers: sortPeers(candidates, currentSnapshot),
    filtersApplied: {
      industry: hasIndustry ? "relaxed" : "unavailable",
      revenueBand: hasRevenueBand ? "relaxed" : "unavailable",
      strategy: "industry_relaxed"
    }
  };
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function computeMetricSummary(
  values: Array<number | null | undefined>
): BenchmarkMetricSummary | null {
  const numericValues = values
    .filter((value): value is number => isFiniteNumber(value))
    .sort((left, right) => left - right);

  if (numericValues.length === 0) {
    return null;
  }

  const middleIndex = Math.floor(numericValues.length / 2);
  const median =
    numericValues.length % 2 === 0
      ? (numericValues[middleIndex - 1] + numericValues[middleIndex]) / 2
      : numericValues[middleIndex];

  return {
    median,
    min: numericValues[0] as number,
    max: numericValues[numericValues.length - 1] as number,
    count: numericValues.length
  };
}

export async function getBenchmarkPeerSetWithDependencies(
  dealId: string,
  dependencies: GetBenchmarkPeerSetDependencies
): Promise<GetBenchmarkPeerSetResult> {
  const client = dependencies.getSupabaseClient();

  const [currentSnapshotResult, peerCandidatesResult] = await Promise.all([
    client
      .from("deal_memory_latest")
      .select(DEAL_MEMORY_LATEST_COLUMNS)
      .eq("deal_id", dealId)
      .maybeSingle?.(),
    client
      .from("deal_memory_latest")
      .select(DEAL_MEMORY_LATEST_COLUMNS)
      .eq("is_benchmark_eligible", true)
      .neq?.("deal_id", dealId)
  ]);

  if (currentSnapshotResult?.error) {
    dependencies.logger.error("Failed to fetch current deal memory snapshot for benchmarking", {
      dealId,
      error: currentSnapshotResult.error
    });

    return {
      peers: [],
      metadata: {
        peerCount: 0,
        filtersApplied: {
          industry: "unavailable",
          revenueBand: "unavailable",
          strategy: "missing_current_snapshot"
        }
      },
      error: {
        message: "Failed to fetch current deal memory snapshot for benchmarking.",
        cause: currentSnapshotResult.error
      }
    };
  }

  if (peerCandidatesResult?.error) {
    dependencies.logger.error("Failed to fetch benchmark peer candidates", {
      dealId,
      error: peerCandidatesResult.error
    });

    return {
      peers: [],
      metadata: {
        peerCount: 0,
        filtersApplied: {
          industry: "unavailable",
          revenueBand: "unavailable",
          strategy: "missing_current_snapshot"
        }
      },
      error: {
        message: "Failed to fetch benchmark peer candidates.",
        cause: peerCandidatesResult.error
      }
    };
  }

  const selection = selectPeers({
    currentSnapshot: currentSnapshotResult?.data ?? null,
    candidates: peerCandidatesResult?.data ?? []
  });

  return {
    peers: selection.peers,
    metadata: {
      peerCount: selection.peers.length,
      filtersApplied: selection.filtersApplied
    },
    error: null
  };
}

export async function getBenchmarkPeerSet(
  dealId: string
): Promise<GetBenchmarkPeerSetResult> {
  return getBenchmarkPeerSetWithDependencies(dealId, defaultDependencies);
}

export function computeBenchmarkSummary(
  peers: DealMemorySnapshot[]
): BenchmarkSummary {
  return {
    peerCount: peers.length,
    metrics: {
      revenue: computeMetricSummary(peers.map((peer) => peer.revenue)),
      ebitda: computeMetricSummary(peers.map((peer) => peer.ebitda)),
      adjustedEbitda: computeMetricSummary(peers.map((peer) => peer.adjustedEbitda)),
      ebitdaMargin: computeMetricSummary(peers.map((peer) => peer.ebitdaMargin)),
      addbackValue: computeMetricSummary(peers.map((peer) => peer.addbackValue)),
      completionPercent: computeMetricSummary(
        peers.map((peer) => peer.completionPercent)
      )
    }
  };
}
