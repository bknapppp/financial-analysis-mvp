import { notFound } from "next/navigation";
import { FinancialsView } from "@/components/financials-view";
import { getDashboardData } from "@/lib/data";
import {
  computeBenchmarkSummary,
  getBenchmarkPeerSet
} from "@/lib/deal-memory-benchmark";
import type { DealMemoryInsertRow, DealMemorySnapshot } from "@/lib/deal-memory";
import { getLatestDealMemory } from "@/lib/deal-memory-read";
import { formatCurrency, formatPercent } from "@/lib/formatters";

export const revalidate = 60;

function formatLabel(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return value
    .split("_")
    .join(" ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSnapshotTimestamp(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(timestamp);
}

function formatMaybeCurrency(value: number | null | undefined) {
  const formatted = formatCurrency(value);
  return formatted === "—" ? "Unavailable" : formatted;
}

function formatMaybePercent(value: number | null | undefined) {
  const formatted = formatPercent(value);
  return formatted === "—" ? "Unavailable" : formatted;
}

function formatPeerStrategy(value: string) {
  switch (value) {
    case "exact_match":
      return "Exact match";
    case "revenue_band_relaxed":
      return "Revenue band relaxed";
    case "industry_relaxed":
      return "Industry relaxed";
    case "missing_current_snapshot":
      return "Current snapshot unavailable";
    default:
      return formatLabel(value);
  }
}

function mapInsertRowToSnapshot(row: DealMemoryInsertRow): DealMemorySnapshot {
  return {
    dealId: row.deal_id,
    companyId: row.company_id,
    snapshotAt: row.snapshot_at,
    revenue: row.revenue,
    ebitda: row.ebitda,
    adjustedEbitda: row.adjusted_ebitda,
    ebitdaMargin: row.ebitda_margin,
    industry: row.industry,
    businessModel: row.business_model,
    revenueBand: row.revenue_band,
    sourceCompletenessScore: row.source_completeness_score,
    hasTaxReturns: row.has_tax_returns,
    hasFinancialStatements: row.has_financial_statements,
    reconciliationStatus: row.reconciliation_status,
    addbackCount: row.addback_count,
    addbackValue: row.addback_value,
    addbackTypes: row.addback_types,
    riskFlags: row.risk_flags,
    blockerCount: row.blocker_count,
    completionPercent: row.completion_percent,
    currentStage: row.current_stage,
    isSnapshotReady: row.is_snapshot_ready,
    isBenchmarkEligible: row.is_benchmark_eligible,
    financialsConfidence: row.financials_confidence,
    snapshotReason: row.snapshot_reason
  };
}

function BenchmarkMetricRow({
  label,
  currentValue,
  peerMedian,
  peerCount,
  formatter
}: {
  label: string;
  currentValue: number | null | undefined;
  peerMedian: number | null | undefined;
  peerCount: number | null;
  formatter: (value: number | null | undefined) => string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
            Current Deal
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {formatter(currentValue)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
            Peer Median
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {formatter(peerMedian)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Metric Peers</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {peerCount === null ? "Unavailable" : peerCount}
          </p>
        </div>
      </div>
    </div>
  );
}

export default async function DealWorkspacePage({
  params
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const [data, latestMemoryResult, benchmarkPeerSetResult] = await Promise.all([
    getDashboardData(companyId),
    getLatestDealMemory(companyId),
    getBenchmarkPeerSet(companyId)
  ]);

  if (!data.company || data.company.id !== companyId) {
    notFound();
  }

  const latestSnapshot = latestMemoryResult.snapshot;
  const latestMemoryError = latestMemoryResult.error;
  const benchmarkSummary = computeBenchmarkSummary(
    benchmarkPeerSetResult.peers.map(mapInsertRowToSnapshot)
  );
  const benchmarkUnavailable =
    !latestSnapshot || benchmarkPeerSetResult.metadata.peerCount === 0;
  const benchmarkLimitedData = benchmarkPeerSetResult.metadata.peerCount > 0 &&
    benchmarkPeerSetResult.metadata.peerCount < 3;

  return (
    <>
      <section className="mx-auto mt-6 max-w-7xl px-4 md:px-6">
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Memory Snapshot
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Latest captured deal-memory snapshot.
                </p>
              </div>
              {latestSnapshot ? (
                <p className="text-xs text-slate-500">
                  Captured {formatSnapshotTimestamp(latestSnapshot.snapshot_at)}
                </p>
              ) : null}
            </div>

            {latestMemoryError ? (
              <p className="mt-4 text-sm text-slate-500">
                Memory snapshot unavailable right now
              </p>
            ) : latestSnapshot ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Revenue</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {formatCurrency(latestSnapshot.revenue)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">EBITDA</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {formatCurrency(latestSnapshot.ebitda)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    Adjusted EBITDA
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {formatCurrency(latestSnapshot.adjusted_ebitda)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    EBITDA Margin
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {formatPercent(latestSnapshot.ebitda_margin)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    Completion
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {formatPercent(latestSnapshot.completion_percent)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    Current Stage
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {formatLabel(latestSnapshot.current_stage)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    Financials Confidence
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {formatLabel(latestSnapshot.financials_confidence)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    Snapshot Timestamp
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {formatSnapshotTimestamp(latestSnapshot.snapshot_at)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                No memory snapshot captured yet
              </p>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Benchmark Context
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Current deal versus comparable eligible memory snapshots.
                </p>
              </div>
            </div>

            {benchmarkPeerSetResult.error ? (
              <p className="mt-4 text-sm text-slate-500">
                Benchmark context unavailable right now
              </p>
            ) : benchmarkUnavailable ? (
              <p className="mt-4 text-sm text-slate-500">
                Benchmark context unavailable — not enough comparable eligible deals yet.
              </p>
            ) : (
              <>
                <div className="mt-4 grid gap-3">
                  <BenchmarkMetricRow
                    label="EBITDA Margin"
                    currentValue={latestSnapshot?.ebitda_margin}
                    peerMedian={benchmarkSummary.metrics.ebitdaMargin?.median}
                    peerCount={benchmarkSummary.metrics.ebitdaMargin?.count ?? null}
                    formatter={formatMaybePercent}
                  />
                  <BenchmarkMetricRow
                    label="Add-back Value"
                    currentValue={latestSnapshot?.addback_value}
                    peerMedian={benchmarkSummary.metrics.addbackValue?.median}
                    peerCount={benchmarkSummary.metrics.addbackValue?.count ?? null}
                    formatter={formatMaybeCurrency}
                  />
                  <BenchmarkMetricRow
                    label="Completion Percent"
                    currentValue={latestSnapshot?.completion_percent}
                    peerMedian={benchmarkSummary.metrics.completionPercent?.median}
                    peerCount={benchmarkSummary.metrics.completionPercent?.count ?? null}
                    formatter={formatMaybePercent}
                  />
                </div>

                <p className="mt-4 text-xs text-slate-500">
                  {benchmarkPeerSetResult.metadata.peerCount} total peers •{" "}
                  {formatPeerStrategy(benchmarkPeerSetResult.metadata.filtersApplied.strategy)}
                  {benchmarkLimitedData ? " • Limited data" : ""}
                </p>
              </>
            )}
          </div>
        </div>
      </section>
      <FinancialsView data={data} />
    </>
  );
}
