"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AddBackReviewPanel } from "@/components/add-back-review-panel";
import { AuditDrilldownPanel } from "@/components/audit-drilldown-panel";
import { DataQualityPanel } from "@/components/data-quality-panel";
import { DashboardCharts } from "@/components/dashboard-charts";
import { EbitdaBridge } from "@/components/ebitda-bridge";
import { ExecutiveSummary } from "@/components/executive-summary";
import { ExportMenuButton } from "@/components/export-menu-button";
import { InsightFeed } from "@/components/insight-feed";
import { KpiCard } from "@/components/kpi-card";
import { MappingConsistencyPanel } from "@/components/mapping-consistency-panel";
import { PerformanceDrivers } from "@/components/performance-drivers";
import { ReadinessPanel } from "@/components/readiness-panel";
import { RecommendedActions } from "@/components/recommended-actions";
import { ReconciliationPanel } from "@/components/reconciliation-panel";
import { buildFixItHref } from "@/lib/fix-it";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { buildAuditMetrics, buildMappingConsistencyIssues } from "@/lib/mapping-intelligence";
import type {
  AuditMetricKey,
  DashboardData,
  KpiTraceabilityBadge,
  PeriodSnapshot,
  AddBackType
} from "@/lib/types";

type DashboardShellProps = {
  data: DashboardData;
};

function hasValue(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function calculatePercentDelta(current: number | null, prior: number | null) {
  if (!hasValue(current) || !hasValue(prior)) {
    return null;
  }

  if (prior === 0) {
    return null;
  }

  return ((current - prior) / Math.abs(prior)) * 100;
}

function formatCurrencyDelta(current: number | null, prior: number | null) {
  if (!hasValue(current) || !hasValue(prior)) {
    return "\u2014";
  }

  const delta = current - prior;
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(delta)} absolute`;
}

function formatSummaryDelta(
  current: number | null,
  prior: number | null,
  suffix = ""
) {
  const percentDelta = calculatePercentDelta(current, prior);

  if (percentDelta === null) {
    return "-";
  }

  const prefix = percentDelta > 0 ? "+" : "";
  return `${prefix}${percentDelta.toFixed(0)}%${suffix}`;
}

function formatConfidenceLabel(value: DashboardData["dataQuality"]["confidenceLabel"]) {
  if (value === "High") return "High Confidence";
  if (value === "Medium") return "Moderate Confidence";
  return "Low Confidence";
}

function formatAddBackTypeSummary(type: AddBackType) {
  if (type === "owner_related") return "Owner-related";
  if (type === "non_recurring") return "Non-recurring";
  if (type === "discretionary") return "Discretionary";
  if (type === "non_operating") return "Non-operating";
  if (type === "accounting_normalization") return "Accounting normalization";
  return "Run-rate adjustment";
}

function formatReviewSummary(
  acceptedAdjustments: number,
  openReviewItems: number,
  topAdjustmentLabel: string | null
) {
  const acceptedText =
    acceptedAdjustments === 1
      ? "1 confirmed adjustment"
      : `${acceptedAdjustments} confirmed adjustments`;
  const reviewText =
    openReviewItems === 0
      ? "no open review items"
      : openReviewItems === 1
        ? "1 open review item"
        : `${openReviewItems} open review items`;

  if (topAdjustmentLabel) {
    return `${acceptedText}, led by ${topAdjustmentLabel}; ${reviewText}.`;
  }

  return `${acceptedText}; ${reviewText}.`;
}

export function DashboardShell({ data }: DashboardShellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedAuditKey, setSelectedAuditKey] = useState<AuditMetricKey | null>(
    null
  );
  const priorSnapshot: PeriodSnapshot | null =
    data.snapshots.length > 1 ? data.snapshots[data.snapshots.length - 2] : null;
  const latestEntries = useMemo(
    () => data.entries.filter((entry) => entry.period_id === data.snapshot.periodId),
    [data.entries, data.snapshot.periodId]
  );
  const auditMetrics = useMemo(
    () => buildAuditMetrics(latestEntries, data.accountMappings),
    [latestEntries, data.accountMappings]
  );
  const mappingConsistencyIssues = useMemo(
    () => buildMappingConsistencyIssues(data.entries, data.periods),
    [data.entries, data.periods]
  );
  const grossMarginBadge: KpiTraceabilityBadge | null = useMemo(() => {
    const badges = [auditMetrics.revenue.badge, auditMetrics.cogs.badge].filter(
      Boolean
    ) as KpiTraceabilityBadge[];

    if (badges.some((badge) => badge.label === "Unmapped data")) {
      return { label: "Unmapped data", tone: "rose" };
    }

    if (badges.some((badge) => badge.label === "Low confidence")) {
      return { label: "Low confidence", tone: "rose" };
    }

    if (badges.some((badge) => badge.label === "Partial mapping")) {
      return { label: "Partial mapping", tone: "amber" };
    }

    return null;
  }, [auditMetrics.cogs.badge, auditMetrics.revenue.badge]);
  const acceptedAddBackTotal =
    data.ebitdaBridge?.addBackTotal ??
    data.snapshot.acceptedAddBacks;
  const priorAcceptedAddBackTotal = priorSnapshot
    ? priorSnapshot.acceptedAddBacks
    : null;
  const reviewStatusBadge: KpiTraceabilityBadge | null =
    data.dataQuality.confidenceLabel === "Low"
      ? { label: "Low confidence", tone: "rose" }
      : data.dataQuality.confidenceLabel === "Medium"
        ? { label: "Partial mapping", tone: "amber" }
        : null;
  const reviewStatusHelpText =
    data.dataQuality.confidenceLabel === "High"
      ? "Data package is reliable for the current deal review"
      : data.dataQuality.confidenceLabel === "Medium"
        ? "Some diligence issues may affect accepted adjustments"
        : "Resolve mapping and completeness issues before relying on adjusted results";
  const adjustedEbitdaDisplay =
    data.readiness.status === "blocked" ? "Not reliable" : null;
  const confidenceLabel = formatConfidenceLabel(data.dataQuality.confidenceLabel);
  const lowConfidenceMappings = latestEntries.filter(
    (entry) => entry.confidence === "low"
  ).length;
  const acceptedAdjustmentCount = data.addBackReviewItems.filter(
    (item) => item.status === "accepted"
  ).length;
  const suggestedAdjustmentCount = data.addBackReviewItems.filter(
    (item) => item.status === "suggested"
  ).length;
  const openReviewItems =
    data.dataQuality.mappingBreakdown.unmapped +
    lowConfidenceMappings +
    suggestedAdjustmentCount;
  const bridgeGroups = data.ebitdaBridge?.groups ?? [];
  const addBackOnlyTotal = bridgeGroups
    .filter((group) =>
      ["owner_related", "non_recurring", "discretionary"].includes(group.type)
    )
    .reduce((sum, group) => sum + group.total, 0);
  const normalizationTotal = bridgeGroups
    .filter((group) =>
      ["accounting_normalization", "non_operating", "run_rate_adjustment"].includes(
        group.type
      )
    )
    .reduce((sum, group) => sum + group.total, 0);
  const topAdjustmentGroup = [...bridgeGroups].sort((left, right) => right.total - left.total)[0];
  const topSectionSummary = formatReviewSummary(
    acceptedAdjustmentCount,
    openReviewItems,
    topAdjustmentGroup ? formatAddBackTypeSummary(topAdjustmentGroup.type) : null
  );
  const confidenceTone =
    data.readiness.status === "blocked" || data.dataQuality.confidenceLabel === "Low"
      ? {
          badge: "bg-rose-100 text-rose-700",
          alert: "border-rose-200 bg-rose-50 text-rose-900"
        }
      : data.readiness.status === "caution" ||
          data.dataQuality.confidenceLabel === "Medium" ||
          data.reconciliation.status === "warning"
        ? {
            badge: "bg-amber-100 text-amber-800",
            alert: "border-amber-200 bg-amber-50 text-amber-900"
          }
        : {
            badge: "bg-teal-100 text-teal-700",
            alert: "border-slate-200 bg-slate-50 text-slate-900"
          };
  const conditionalAlert =
    data.dataQuality.confidenceLabel !== "High" || openReviewItems > 0
      ? data.readiness.status === "blocked"
        ? `Adjusted EBITDA is not reliable until ${data.readiness.summaryMessage.toLowerCase()}.`
        : data.readiness.status === "caution"
          ? `${data.readiness.summaryMessage} Review unmapped and low-confidence line items before relying on the current adjustment case.`
          : `${openReviewItems} review item${openReviewItems === 1 ? "" : "s"} remain open. Complete mapping review before circulating this result as decision-ready.`
      : null;
  const summaryText = data.company
    ? [
        `Company: ${data.company.name}`,
        `Period: ${data.snapshot.label || "Latest period"}`,
        "",
        "Deal Review Summary:",
        `Readiness: ${data.readiness.label}`,
        ...(data.readiness.status !== "ready"
          ? [
              data.readiness.status === "blocked"
                ? `WARNING: ${data.readiness.summaryMessage}`
                : `CAUTION: ${data.readiness.summaryMessage}`
            ]
          : []),
        `Revenue: ${formatCurrency(data.snapshot.revenue)}${
          priorSnapshot
            ? ` (${formatSummaryDelta(data.snapshot.revenue, priorSnapshot.revenue)})`
            : ""
        }`,
        `EBITDA: ${formatCurrency(data.snapshot.ebitda)}${
          priorSnapshot
            ? ` (${formatSummaryDelta(data.snapshot.ebitda, priorSnapshot.ebitda)})`
            : ""
        }`,
        `Accepted Addbacks: ${formatCurrency(acceptedAddBackTotal)}${
          priorAcceptedAddBackTotal !== null
            ? ` (${formatSummaryDelta(
                acceptedAddBackTotal,
                priorAcceptedAddBackTotal
              )})`
            : ""
        }`,
        `Adjusted EBITDA: ${formatCurrency(data.snapshot.adjustedEbitda)}${
          priorSnapshot
            ? ` (${formatSummaryDelta(
                data.snapshot.adjustedEbitda,
                priorSnapshot.adjustedEbitda
              )})`
            : ""
        }`,
        `Gross Margin: ${formatPercent(data.snapshot.grossMarginPercent)}${
          priorSnapshot
            ? ` (${formatSummaryDelta(
                data.snapshot.grossMarginPercent,
                priorSnapshot.grossMarginPercent
              )})`
            : ""
        }`,
        "",
        "What Changed:",
        ...(data.insights.length > 0
          ? data.insights.slice(0, 5).map((insight) => `- ${insight.message}`)
          : ["- No major changes detected"]),
        "",
        "Recommended Actions:",
        ...(data.recommendedActions.length > 0
          ? data.recommendedActions
              .slice(0, 5)
              .map((recommendation) => `- ${recommendation.message}`)
          : ["- No recommendations available"])
      ].join("\n")
    : "";

  function refreshMappings() {
    startTransition(() => {
      router.refresh();
    });
  }

  const selectedMetric = selectedAuditKey ? auditMetrics[selectedAuditKey] : null;

  return (
    <>
      <main className="min-h-screen px-4 py-8 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8">
          <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-6 shadow-panel md:px-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 max-w-3xl">
                  <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                    {data.company?.name || "No company selected"} -{" "}
                    {data.snapshot.label || "No reporting period loaded"}
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                    Overview
                  </h1>
                  <p className="mt-3 text-sm text-slate-600 md:text-base">
                    {topSectionSummary}
                  </p>
                </div>

                <div className="flex flex-col items-start gap-3 xl:items-end">
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href="/financials"
                      className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Financials
                    </Link>
                    {acceptedAddBackTotal > 0 && data.company ? (
                      <Link
                        href={buildFixItHref("Review add-backs", `/deal/${data.company.id}`)}
                        className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Review add-backs
                      </Link>
                    ) : null}
                    <Link
                      href="/source-data"
                      className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Source Data
                    </Link>
                    <ExportMenuButton
                      data={data}
                      summaryText={summaryText}
                      disabled={!data.company || !data.snapshot.periodId}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-[1.75rem] bg-ink px-6 py-6 text-white">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-300">
                      Adjusted EBITDA
                    </p>
                    <p className="mt-3 text-5xl font-semibold tracking-tight md:text-6xl">
                      {adjustedEbitdaDisplay ?? formatCurrency(data.snapshot.adjustedEbitda)}
                    </p>
                    <p className="mt-3 text-sm text-slate-300 md:text-base">
                      Net change vs EBITDA:{" "}
                      <span className="font-medium text-white">
                        {formatCurrency(acceptedAddBackTotal)}
                      </span>
                    </p>
                  </div>

                  <div className="w-full max-w-xl rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-300">
                          Reliability
                        </p>
                        <p className="mt-2 text-lg font-semibold text-white">
                          {confidenceLabel}
                        </p>
                        <p className="mt-2 text-sm text-slate-300">
                          {data.readiness.summaryMessage}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${confidenceTone.badge}`}
                      >
                        {confidenceLabel}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-300">
                          Confirmed Adjustments
                        </p>
                        <p className="mt-2 text-lg font-semibold text-white">
                          {acceptedAdjustmentCount}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-300">
                          Under Review
                        </p>
                        <p className="mt-2 text-lg font-semibold text-white">
                          {openReviewItems}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-300">
                          Mapping Quality
                        </p>
                        <p className="mt-2 text-lg font-semibold text-white">
                          {formatPercent(data.dataQuality.mappingCoveragePercent)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr_0.8fr]">
                <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                    EBITDA Bridge Summary
                  </p>
                  <div className="mt-4 space-y-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                    <div className="flex items-center justify-between gap-4 pb-3">
                      <span className="text-slate-600">EBITDA</span>
                      <span className="font-semibold text-slate-900">
                        {formatCurrency(data.snapshot.ebitda)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-t border-dashed border-slate-200 py-3">
                      <span className="text-slate-600">Addbacks</span>
                      <span className="font-semibold text-slate-900">
                        +{formatCurrency(addBackOnlyTotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-t border-dashed border-slate-200 py-3">
                      <span className="text-slate-600">Reclassifications</span>
                      <span className="font-semibold text-slate-900">
                        +{formatCurrency(normalizationTotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-t border-slate-300 pt-3">
                      <span className="font-medium text-slate-900">Adjusted EBITDA</span>
                      <span className="text-lg font-semibold text-slate-950">
                        {adjustedEbitdaDisplay ?? formatCurrency(data.snapshot.adjustedEbitda)}
                      </span>
                    </div>
                  </div>
                </section>

                <section
                  id="review-required"
                  className="rounded-[1.5rem] border border-slate-200 bg-white p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                        Review Required
                      </p>
                      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                        {openReviewItems}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        document
                          .getElementById("validation-section")
                          ?.scrollIntoView({ behavior: "smooth", block: "start" })
                      }
                      className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Review Open Items
                    </button>
                  </div>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-600">Open items</span>
                      <span className="font-semibold text-slate-900">{openReviewItems}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-600">Unmapped line items</span>
                      <span className="font-semibold text-slate-900">
                        {data.dataQuality.mappingBreakdown.unmapped}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-600">Low-confidence mappings</span>
                      <span className="font-semibold text-slate-900">
                        {lowConfidenceMappings}
                      </span>
                    </div>
                  </div>
                </section>

                <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                    Mapping Quality
                  </p>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-600">Mapping coverage</span>
                      <span className="font-semibold text-slate-900">
                        {formatPercent(data.dataQuality.mappingCoveragePercent)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-600">Saved mappings used</span>
                      <span className="font-semibold text-slate-900">
                        {data.dataQuality.mappingBreakdown.saved_mapping}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-600">Rule-based mappings used</span>
                      <span className="font-semibold text-slate-900">
                        {data.dataQuality.mappingBreakdown.keyword_mapping}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-600">Unmapped items</span>
                      <span className="font-semibold text-slate-900">
                        {data.dataQuality.mappingBreakdown.unmapped}
                      </span>
                    </div>
                  </div>
                </section>
              </div>

              {conditionalAlert ? (
                <section
                  className={`rounded-[1.5rem] border px-5 py-4 ${confidenceTone.alert}`}
                >
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-current/70">
                    Analyst Note
                  </p>
                  <p className="mt-2 text-sm font-medium">{conditionalAlert}</p>
                </section>
              ) : null}
            </div>
          </section>

          <section className="space-y-8">
              <section className="space-y-6">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                    Adjustment Review
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">
                    Accepted Adjustments
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Review reported earnings, accepted adjustments, and supporting detail behind the current adjustment case.
                  </p>
                </div>

                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <KpiCard
                    label="EBITDA"
                    value={data.snapshot.ebitda}
                    helpText="Canonical pre-adjustment EBITDA"
                    delta={
                      priorSnapshot
                        ? calculatePercentDelta(
                            data.snapshot.ebitda,
                            priorSnapshot.ebitda
                          )
                        : null
                    }
                    deltaAbsoluteText={
                      priorSnapshot
                        ? formatCurrencyDelta(
                            data.snapshot.ebitda,
                            priorSnapshot.ebitda
                          )
                        : null
                    }
                    deltaLabel="vs prior period"
                    traceabilityBadge={auditMetrics.ebitda.badge}
                    onClick={() => setSelectedAuditKey("ebitda")}
                  />
                  <KpiCard
                    label="Accepted Addbacks"
                    value={acceptedAddBackTotal}
                    helpText="Reviewed adjustments accepted for this period"
                    delta={
                      priorAcceptedAddBackTotal !== null
                        ? calculatePercentDelta(
                            acceptedAddBackTotal,
                            priorAcceptedAddBackTotal
                          )
                        : null
                    }
                    deltaAbsoluteText={
                      priorAcceptedAddBackTotal !== null
                        ? formatCurrencyDelta(
                            acceptedAddBackTotal,
                            priorAcceptedAddBackTotal
                          )
                        : null
                    }
                    deltaLabel="vs prior period"
                  />
                  <KpiCard
                    label="Adjusted EBITDA"
                    value={data.snapshot.adjustedEbitda}
                    valueDisplay={adjustedEbitdaDisplay}
                    helpText={
                      data.readiness.status === "blocked"
                        ? "Adjusted EBITDA is not reliable until blocking issues are resolved"
                        : data.readiness.status === "caution"
                          ? "Reported EBITDA plus accepted adjustments, with caution"
                          : "EBITDA plus accepted adjustments"
                    }
                    delta={
                      priorSnapshot && data.readiness.status !== "blocked"
                        ? calculatePercentDelta(
                            data.snapshot.adjustedEbitda,
                            priorSnapshot.adjustedEbitda
                          )
                        : null
                    }
                    deltaAbsoluteText={
                      priorSnapshot && data.readiness.status !== "blocked"
                        ? formatCurrencyDelta(
                            data.snapshot.adjustedEbitda,
                            priorSnapshot.adjustedEbitda
                          )
                        : null
                    }
                    deltaLabel="vs prior period"
                    traceabilityBadge={auditMetrics.ebitda.badge}
                    onClick={() => setSelectedAuditKey("ebitda")}
                  />
                  <KpiCard
                    label="Review Confidence"
                    value={data.dataQuality.confidenceScore}
                    format="percent"
                    helpText={reviewStatusHelpText}
                    delta={null}
                    deltaLabel="diligence status"
                    traceabilityBadge={reviewStatusBadge}
                  />
                </section>

                <EbitdaBridge bridge={data.ebitdaBridge} />
                <section className="space-y-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                      Performance Trends
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-slate-900">
                      Multi-period operating context
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Compare operating performance over time to support the current adjustment case.
                    </p>
                  </div>

                  <DashboardCharts series={data.series} />
                </section>
                <AddBackReviewPanel
                  companyId={data.company?.id ?? null}
                  periods={data.periods}
                  items={data.addBackReviewItems}
                />
              </section>

              <section id="validation-section" className="space-y-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                    Validation
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">
                    Confidence & validation
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Confirm mapping quality, consistency, and support before relying on adjusted outputs.
                  </p>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <ReadinessPanel readiness={data.readiness} />
                  <ReconciliationPanel report={data.reconciliation} />
                </div>

                {data.company ? <DataQualityPanel report={data.dataQuality} /> : null}
                <MappingConsistencyPanel
                  companyId={data.company?.id ?? null}
                  issues={mappingConsistencyIssues}
                  onMappingSaved={refreshMappings}
                />
              </section>

              <section className="space-y-6">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                    Investment Summary
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">
                    Underwriting summary
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Frame the deal case with performance context, risks, and recommended next actions.
                  </p>
                </div>

                <ExecutiveSummary summary={data.executiveSummary} />

                <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                  <PerformanceDrivers analyses={data.driverAnalyses} />
                  <div className="space-y-6">
                    {data.insights.length > 0 ? (
                      <InsightFeed insights={data.insights} />
                    ) : null}
                    {data.recommendedActions.length > 0 ? (
                      <RecommendedActions recommendations={data.recommendedActions} />
                    ) : null}
                  </div>
                </div>
              </section>

          </section>
        </div>
      </main>

      <AuditDrilldownPanel
        metric={selectedMetric}
        companyId={data.company?.id ?? null}
        onClose={() => setSelectedAuditKey(null)}
        onMappingSaved={refreshMappings}
      />

      {isPending ? (
        <div className="pointer-events-none fixed bottom-4 right-4 rounded-xl bg-slate-900 px-3 py-2 text-sm text-white shadow-lg">
          Refreshing mappings...
        </div>
      ) : null}
    </>
  );
}



