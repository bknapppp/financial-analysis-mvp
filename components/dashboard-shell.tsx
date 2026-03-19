"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AddBackReviewPanel } from "@/components/add-back-review-panel";
import { AuditDrilldownPanel } from "@/components/audit-drilldown-panel";
import { CompanySetupForm } from "@/components/company-setup-form";
import { CopySummaryButton } from "@/components/copy-summary-button";
import { CsvImportSection } from "@/components/csv-import-section";
import { DataQualityPanel } from "@/components/data-quality-panel";
import { DashboardCharts } from "@/components/dashboard-charts";
import { DownloadExcelButton } from "@/components/download-excel-button";
import { DownloadReportButton } from "@/components/download-report-button";
import { EbitdaBridge } from "@/components/ebitda-bridge";
import { EntryForm } from "@/components/entry-form";
import { ExecutiveSummary } from "@/components/executive-summary";
import { InsightFeed } from "@/components/insight-feed";
import { KpiCard } from "@/components/kpi-card";
import { MappingConsistencyPanel } from "@/components/mapping-consistency-panel";
import { MultiPeriodSummaryTable } from "@/components/multi-period-summary-table";
import { PerformanceDrivers } from "@/components/performance-drivers";
import { PeriodForm } from "@/components/period-form";
import { ReadinessPanel } from "@/components/readiness-panel";
import { RecommendedActions } from "@/components/recommended-actions";
import { ReconciliationPanel } from "@/components/reconciliation-panel";
import { StatementTable } from "@/components/statement-table";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { buildAuditMetrics, buildMappingConsistencyIssues } from "@/lib/mapping-intelligence";
import type {
  AuditMetricKey,
  DashboardData,
  KpiTraceabilityBadge,
  PeriodSnapshot
} from "@/lib/types";

type DashboardShellProps = {
  data: DashboardData;
};

function calculatePercentDelta(current: number, prior: number) {
  if (prior === 0) {
    return null;
  }

  return ((current - prior) / Math.abs(prior)) * 100;
}

function formatCurrencyDelta(current: number, prior: number) {
  const delta = current - prior;
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(delta)} absolute`;
}

function formatSummaryDelta(current: number, prior: number, suffix = "") {
  const percentDelta = calculatePercentDelta(current, prior);

  if (percentDelta === null) {
    return "—";
  }

  const prefix = percentDelta > 0 ? "+" : "";
  return `${prefix}${percentDelta.toFixed(0)}%${suffix}`;
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
    Math.max(0, data.snapshot.adjustedEbitda - data.snapshot.ebitda);
  const priorAcceptedAddBackTotal = priorSnapshot
    ? Math.max(0, priorSnapshot.adjustedEbitda - priorSnapshot.ebitda)
    : null;
  const reviewStatusBadge: KpiTraceabilityBadge | null =
    data.dataQuality.confidenceLabel === "Low"
      ? { label: "Low confidence", tone: "rose" }
      : data.dataQuality.confidenceLabel === "Medium"
        ? { label: "Partial mapping", tone: "amber" }
        : null;
  const reviewStatusHelpText =
    data.dataQuality.confidenceLabel === "High"
      ? "Data package is reliable for adjusted EBITDA review"
      : data.dataQuality.confidenceLabel === "Medium"
        ? "Some diligence issues may affect accepted adjustments"
        : "Resolve mapping and completeness issues before relying on adjusted results";
  const adjustedEbitdaDisplay =
    data.readiness.status === "blocked" ? "Not reliable" : null;
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
        `Reported EBITDA: ${formatCurrency(data.snapshot.ebitda)}${
          priorSnapshot
            ? ` (${formatSummaryDelta(data.snapshot.ebitda, priorSnapshot.ebitda)})`
            : ""
        }`,
        `Accepted Add-Backs: ${formatCurrency(acceptedAddBackTotal)}${
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
          <section className="rounded-[2rem] bg-ink px-6 py-6 text-white shadow-panel md:px-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs uppercase tracking-[0.24em] text-teal-200">
                  Deal Review Workspace
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
                  Adjusted EBITDA review
                </h1>
                <p className="mt-2 text-sm text-slate-300 md:text-base">
                  Underwrite reported earnings, accepted adjustments, and diligence confidence in one view.
                </p>
              </div>

              <div className="flex flex-col items-start gap-3 md:items-end">
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-300">
                    Active deal file
                  </p>
                  <p className="mt-1 font-medium text-white">
                    {data.company
                      ? data.company.name
                      : "Create a company to begin review"}
                  </p>
                  <p className="mt-1 text-xs text-slate-300">
                    {data.snapshot.label || "No reporting period loaded"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <DownloadExcelButton
                    data={data}
                    disabled={!data.company || !data.snapshot.periodId}
                  />
                  <DownloadReportButton
                    data={data}
                    disabled={!data.company || !data.snapshot.periodId}
                  />
                  <CopySummaryButton
                    summaryText={summaryText}
                    disabled={!data.company}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.75fr_0.95fr]">
            <div className="space-y-8">
              <section className="space-y-6">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                    Core Review
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">
                    Adjusted EBITDA workflow
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Review reported earnings, accepted adjustments, and trust signals before using the deal case.
                  </p>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <ReadinessPanel readiness={data.readiness} />
                  <ReconciliationPanel report={data.reconciliation} />
                </div>

                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <KpiCard
                    label="Reported EBITDA"
                    value={data.snapshot.ebitda}
                    helpText="Pre-adjustment operating earnings"
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
                    label="Accepted Add-Backs"
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
                          : "Reported EBITDA plus accepted adjustments"
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
                <AddBackReviewPanel
                  companyId={data.company?.id ?? null}
                  periods={data.periods}
                  items={data.addBackReviewItems}
                />
              </section>

              <section className="space-y-4">
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
                    <InsightFeed insights={data.insights} />
                    <RecommendedActions recommendations={data.recommendedActions} />
                  </div>
                </div>
              </section>

              <section className="space-y-6">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                    Trend & Period Analysis
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">
                    Multi-period operating context
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Compare operating performance over time to support the current adjustment case.
                  </p>
                </div>

                <DashboardCharts series={data.series} />
                <MultiPeriodSummaryTable snapshots={data.snapshots} />
              </section>
            </div>

            <aside className="space-y-6">
              <section className="rounded-[1.75rem] border border-slate-200 bg-white/80 p-5 shadow-panel backdrop-blur">
                <div className="mb-4">
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                    Setup
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900">
                    Data intake
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Maintain company setup, periods, and source data without interrupting the review workflow.
                  </p>
                </div>

                <div className="space-y-5">
                  <CompanySetupForm />
                  <CsvImportSection
                    companies={data.companies}
                    initialCompanyId={data.company?.id ?? null}
                    initialPeriods={data.periods}
                  />
                  <details className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">
                      Manual period and entry tools
                    </summary>
                    <p className="mt-2 text-sm text-slate-500">
                      Use these only when the uploaded source is missing period structure or needs a targeted manual adjustment.
                    </p>
                    <div className="mt-4 space-y-4">
                      <PeriodForm companyId={data.company?.id ?? null} />
                    </div>
                  </details>
                  <details className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">
                      Manual entry fallback
                    </summary>
                    <p className="mt-2 text-sm text-slate-500">
                      Use manual line-by-line entry only when the uploaded source needs a targeted adjustment or a small missing row.
                    </p>
                    <div className="mt-4">
                      <EntryForm
                        companyId={data.company?.id ?? null}
                        periods={data.periods}
                      />
                    </div>
                  </details>
                </div>
              </section>

              <section className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5 shadow-panel">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                  Review Focus
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">
                  Current diligence posture
                </h3>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between gap-3">
                    <span>Current period</span>
                    <span className="font-medium text-slate-900">
                      {data.snapshot.label || "Not loaded"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Accepted adjustments</span>
                    <span className="font-medium text-slate-900">
                      {formatCurrency(acceptedAddBackTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Confidence label</span>
                    <span className="font-medium text-slate-900">
                      {data.dataQuality.confidenceLabel}
                    </span>
                  </div>
                </div>
              </section>
            </aside>
          </section>

          <section className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                Reference
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">
                Financial statements
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Supporting statement detail for the latest reporting period.
              </p>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <StatementTable
                statement={
                  data.normalizedOutput?.incomeStatement ?? {
                    statementKey: "income_statement",
                    title: "Income Statement",
                    rows: [],
                    footerLabel: "Adjusted EBITDA",
                    footerValue: data.snapshot.adjustedEbitda
                  }
                }
                footerValueDisplay={adjustedEbitdaDisplay}
                clickableLabels={[
                  "Revenue",
                  "COGS",
                  "Operating Expenses",
                  "Reported EBITDA"
                ]}
                onRowClick={(label) => {
                  if (label === "Revenue") setSelectedAuditKey("revenue");
                  if (label === "COGS") setSelectedAuditKey("cogs");
                  if (label === "Operating Expenses") {
                    setSelectedAuditKey("operatingExpenses");
                  }
                  if (label === "Reported EBITDA") setSelectedAuditKey("ebitda");
                }}
              />
              <StatementTable
                statement={
                  data.normalizedOutput?.balanceSheet ?? {
                    statementKey: "balance_sheet",
                    title: "Balance Sheet",
                    rows: [],
                    footerLabel: "Working Capital",
                    footerValue: data.snapshot.workingCapital
                  }
                }
              />
            </div>
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
