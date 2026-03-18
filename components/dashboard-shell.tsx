"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AuditDrilldownPanel } from "@/components/audit-drilldown-panel";
import { CompanySetupForm } from "@/components/company-setup-form";
import { CopySummaryButton } from "@/components/copy-summary-button";
import { CsvImportSection } from "@/components/csv-import-section";
import { DataQualityPanel } from "@/components/data-quality-panel";
import { DashboardCharts } from "@/components/dashboard-charts";
import { EntryForm } from "@/components/entry-form";
import { ExecutiveSummary } from "@/components/executive-summary";
import { InsightFeed } from "@/components/insight-feed";
import { KpiCard } from "@/components/kpi-card";
import { MappingConsistencyPanel } from "@/components/mapping-consistency-panel";
import { MultiPeriodSummaryTable } from "@/components/multi-period-summary-table";
import { PerformanceDrivers } from "@/components/performance-drivers";
import { PeriodForm } from "@/components/period-form";
import { RecommendedActions } from "@/components/recommended-actions";
import { StatementTable } from "@/components/statement-table";
import { buildAuditMetrics, buildMappingConsistencyIssues } from "@/lib/mapping-intelligence";
import { formatCurrency, formatPercent } from "@/lib/formatters";
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

function formatPointsDelta(current: number, prior: number) {
  const delta = current - prior;
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${delta.toFixed(1)} pts absolute`;
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
  const summaryText = data.company
    ? [
        `Company: ${data.company.name}`,
        `Period: ${data.snapshot.label || "Latest period"}`,
        "",
        "Performance:",
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
        `EBITDA Margin: ${formatPercent(data.snapshot.ebitdaMarginPercent)}${
          priorSnapshot
            ? ` (${formatSummaryDelta(
                data.snapshot.ebitdaMarginPercent,
                priorSnapshot.ebitdaMarginPercent
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
              <div className="max-w-xl">
                <p className="text-xs uppercase tracking-[0.24em] text-teal-200">
                  Finance Dashboard
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
                  Business performance
                </h1>
                <p className="mt-2 text-sm text-slate-300 md:text-base">
                  Trends, drivers, and data quality in one view.
                </p>
              </div>

              <div className="flex items-center">
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-300">
                    Active company
                  </p>
                  <p className="mt-1 font-medium text-white">
                    {data.company
                      ? data.company.name
                      : "Create a company to begin analysis"}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.05fr_1.7fr]">
            <div className="space-y-6">
              <section className="rounded-[1.75rem] bg-white p-5 shadow-panel">
                <div className="mb-4">
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                    Setup
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">
                    Data Input
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Set up the company, add periods, and load financial data.
                  </p>
                </div>

                <div className="space-y-5">
                  <CompanySetupForm />
                  <PeriodForm companyId={data.company?.id ?? null} />
                  <EntryForm
                    companyId={data.company?.id ?? null}
                    periods={data.periods}
                  />
                  <CsvImportSection
                    companies={data.companies}
                    initialCompanyId={data.company?.id ?? null}
                    initialPeriods={data.periods}
                  />
                </div>
              </section>
            </div>

            <div className="space-y-8">
              <section className="space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                      Performance
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-slate-900">
                      Performance
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      The core analysis layer for trends, drivers, and multi-period performance.
                    </p>
                  </div>
                  <CopySummaryButton
                    summaryText={summaryText}
                    disabled={!data.company}
                  />
                </div>

                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <KpiCard
                    label="Revenue"
                    value={data.snapshot.revenue}
                    helpText="Latest reporting period"
                    delta={
                      priorSnapshot
                        ? calculatePercentDelta(
                            data.snapshot.revenue,
                            priorSnapshot.revenue
                          )
                        : null
                    }
                    deltaAbsoluteText={
                      priorSnapshot
                        ? formatCurrencyDelta(
                            data.snapshot.revenue,
                            priorSnapshot.revenue
                          )
                        : null
                    }
                    deltaLabel="vs prior period"
                    traceabilityBadge={grossMarginBadge}
                    onClick={() => setSelectedAuditKey("revenue")}
                  />
                  <KpiCard
                    label="EBITDA"
                    value={data.snapshot.ebitda}
                    helpText="Before add-backs"
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
                    label="Adjusted EBITDA"
                    value={data.snapshot.adjustedEbitda}
                    helpText="Including flagged add-backs"
                    delta={
                      priorSnapshot
                        ? calculatePercentDelta(
                            data.snapshot.adjustedEbitda,
                            priorSnapshot.adjustedEbitda
                          )
                        : null
                    }
                    deltaAbsoluteText={
                      priorSnapshot
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
                    label="Gross Margin %"
                    value={data.snapshot.grossMarginPercent}
                    format="percent"
                    helpText="Gross profit / revenue"
                    delta={
                      priorSnapshot
                        ? calculatePercentDelta(
                            data.snapshot.grossMarginPercent,
                            priorSnapshot.grossMarginPercent
                          )
                        : null
                    }
                    deltaAbsoluteText={
                      priorSnapshot
                        ? formatPointsDelta(
                            data.snapshot.grossMarginPercent,
                            priorSnapshot.grossMarginPercent
                          )
                        : null
                    }
                    deltaLabel="vs prior period"
                    traceabilityBadge={auditMetrics.revenue.badge}
                    onClick={() => setSelectedAuditKey("revenue")}
                  />
                </section>

                <ExecutiveSummary summary={data.executiveSummary} />
                <PerformanceDrivers analyses={data.driverAnalyses} />
                <InsightFeed insights={data.insights} />
                <RecommendedActions recommendations={data.recommendedActions} />
                <DashboardCharts series={data.series} />
                <MultiPeriodSummaryTable snapshots={data.snapshots} />
              </section>

              <section className="space-y-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                    Validation
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">
                    Data Quality & Validation
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Validate mapping coverage, consistency, and trust before relying on insights.
                  </p>
                </div>

                {data.company ? <DataQualityPanel report={data.dataQuality} /> : null}
                <MappingConsistencyPanel
                  companyId={data.company?.id ?? null}
                  issues={mappingConsistencyIssues}
                  onMappingSaved={refreshMappings}
                />
              </section>
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                Reference
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">
                Financial Statements
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Supporting statement detail for the latest reporting period.
              </p>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <StatementTable
                title="Income Statement"
                rows={data.incomeStatement}
                footerLabel="Adjusted EBITDA"
                footerValue={data.snapshot.adjustedEbitda}
                clickableLabels={["Revenue", "COGS", "Operating Expenses", "EBITDA"]}
                onRowClick={(label) => {
                  if (label === "Revenue") setSelectedAuditKey("revenue");
                  if (label === "COGS") setSelectedAuditKey("cogs");
                  if (label === "Operating Expenses") {
                    setSelectedAuditKey("operatingExpenses");
                  }
                  if (label === "EBITDA") setSelectedAuditKey("ebitda");
                }}
              />
              <StatementTable
                title="Balance Sheet"
                rows={data.balanceSheet}
                footerLabel="Working Capital"
                footerValue={data.snapshot.workingCapital}
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
