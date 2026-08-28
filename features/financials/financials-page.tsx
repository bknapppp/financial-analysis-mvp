"use client";

import Link from "next/link";
import { AlertTriangle, Database } from "lucide-react";
import { useMemo, useState } from "react";
import { BackingChip } from "@/components/backing-chip";
import { DashboardCharts } from "@/components/dashboard-charts";
import { DiligenceIssuesPanel } from "@/components/diligence-issues-panel";
import { MultiPeriodSummaryTable } from "@/components/multi-period-summary-table";
import { PerformanceDrivers } from "@/components/performance-drivers";
import { StatementTable } from "@/components/statement-table";
import { PageHeader } from "@/components/layout/page-header";
import { ContentCard } from "@/components/ui/content-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type { FinancialsPageViewModel } from "@/features/financials/financials-view-model";
import { formatCurrency } from "@/lib/formatters";

function tone(value: string): StatusTone {
  if (["ready", "reconciled", "pass", "backed"].includes(value)) return "success";
  if (["caution", "warning", "partial"].includes(value)) return "warning";
  if (["blocked", "failed", "fail", "unbacked"].includes(value)) return "danger";
  return "neutral";
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function FinancialsPage({ model }: { model: FinancialsPageViewModel }) {
  const [periodId, setPeriodId] = useState(model.defaultPeriodId);
  const [mode, setMode] = useState<"reported" | "adjusted">("reported");
  const period = useMemo(
    () => model.periods.find((item) => item.periodId === periodId) ?? model.periods.at(-1),
    [model.periods, periodId]
  );
  const readinessProgress = model.readiness.status === "ready" ? 100 : model.readiness.status === "caution" ? 65 : 35;

  return <>
    <PageHeader
      eyebrow="Transaction financial model"
      title="Financials"
      description={`${model.companyName} · authoritative normalized financial statements, quality-of-earnings bridge, and validation.`}
      status={<StatusBadge tone={tone(model.readiness.status)}>{model.readiness.label}</StatusBadge>}
      progress={<div><div className="mb-1 flex justify-between"><span className="bs-label">Financial readiness</span><span className="bs-metadata">{readinessProgress}%</span></div><ProgressBar value={readinessProgress} label="Financial readiness" /></div>}
      actions={<Link className="inline-flex min-h-8 items-center rounded-bs-sm border border-bs-border-strong bg-bs-surface px-3 text-xs font-medium text-bs-text-secondary hover:bg-bs-page" href={`/source-data?companyId=${model.companyId}`}>Review source data</Link>}
    />
    <main className="mx-auto max-w-bs-content space-y-4 px-4 py-5 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-bs-md border border-bs-border-subtle bg-bs-surface px-4 py-3 shadow-bs-subtle">
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-3">
          <div><p className="bs-label">Company</p><p className="mt-0.5 text-xs font-semibold">{model.companyName}</p></div>
          <div><p className="bs-label">Reporting period</p><p className="mt-0.5 text-xs font-semibold">{period?.label ?? "Unavailable"}</p></div>
          <div><p className="bs-label">Currency</p><p className="mt-0.5 text-xs font-semibold">{model.currency || "Not configured"}</p></div>
        </div>
        {model.periods.length > 1 ? <label className="bs-label">Period<select className="ml-2 rounded-bs-sm border border-bs-border-subtle bg-bs-surface px-2 py-1.5 text-xs font-medium text-bs-text-primary" value={period?.periodId ?? ""} onChange={(event) => setPeriodId(event.target.value)}>{model.periods.map((item) => <option key={item.periodId} value={item.periodId}>{item.label}</option>)}</select></label> : null}
      </div>

      {!period ? <ContentCard><EmptyState icon={Database} title="Financial data unavailable" description="No reporting period with financial entries is available for this deal. Missing data is not presented as zero." action={<Link className="text-xs font-medium text-bs-primary underline" href={`/source-data?companyId=${model.companyId}`}>Open Source Data</Link>} /></ContentCard> : <>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ContentCard padding="compact"><p className="bs-label">Source readiness</p><div className="mt-2"><StatusBadge tone={tone(model.readiness.status)}>{model.readiness.label}</StatusBadge></div><p className="bs-metadata mt-2 line-clamp-2">{model.readiness.summaryMessage}</p></ContentCard>
          <ContentCard padding="compact"><p className="bs-label">Financial backing</p><div className="mt-2"><BackingChip status={model.backing.find((item) => item.id === "financials")?.status ?? "unbacked"} size="compact" /></div><p className="bs-metadata mt-2">Source relationships retained</p></ContentCard>
          <ContentCard padding="compact"><p className="bs-label">Reconciliation</p><div className="mt-2"><StatusBadge tone={tone(period.reconciliation.status)}>{period.reconciliation.label}</StatusBadge></div><p className="bs-metadata mt-2">{period.reconciliation.issues.length} exception(s)</p></ContentCard>
          <ContentCard padding="compact"><p className="bs-label">Balance validation</p><div className="mt-2"><StatusBadge tone={tone(period.validation.overallSeverity)}>{label(period.validation.overallSeverity)}</StatusBadge></div><p className="bs-metadata mt-2">{period.validation.checks.length} controlled check(s)</p></ContentCard>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex rounded-bs-sm border border-bs-border-subtle bg-bs-surface p-0.5" role="group" aria-label="Financial statement basis">
            {(["reported", "adjusted"] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`rounded-[3px] px-3 py-1.5 text-xs font-medium ${mode === value ? "bg-bs-primary text-white" : "text-bs-text-secondary hover:bg-bs-page"}`}>{label(value)}</button>)}
          </div>
          <p className="bs-metadata">{period.entryCount} source line item(s) · {period.periodDate ?? "Date unavailable"}</p>
        </div>

        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <ContentCard className="min-w-0" padding="compact"><StatementTable statement={mode === "reported" ? period.reportedStatement : period.adjustedStatement} showOuterCard={false} density="compact" variant="canonical" /></ContentCard>
          <ContentCard className="min-w-0" padding="compact"><StatementTable statement={period.balanceSheet} showOuterCard={false} density="compact" variant="canonical" /></ContentCard>
        </div>

        <ContentCard><SectionHeader title="EBITDA / quality of earnings bridge" description="Canonical earnings basis with accepted adjustments only." /><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-bs-sm bg-bs-page p-3"><p className="bs-label">Canonical EBITDA</p><p className="mt-1 text-lg font-semibold">{formatCurrency(period.canonicalEbitda)}</p><p className="bs-metadata mt-1">Reported reference {formatCurrency(period.reportedEbitda)}</p></div><div className="rounded-bs-sm bg-bs-page p-3"><p className="bs-label">Accepted add-backs</p><p className="mt-1 text-lg font-semibold">{formatCurrency(period.acceptedAddBacks)}</p><p className="bs-metadata mt-1">{period.bridge?.groups.reduce((count, group) => count + group.items.length, 0) ?? 0} accepted item(s)</p></div><div className="rounded-bs-sm border border-bs-primary/20 bg-bs-primary/5 p-3"><p className="bs-label">Adjusted EBITDA</p><p className="mt-1 text-lg font-semibold text-bs-primary">{formatCurrency(period.adjustedEbitda)}</p><p className="bs-metadata mt-1">Canonical plus accepted add-backs</p></div></div>{period.bridge?.invalidReasons.length ? <div className="mt-3 space-y-1">{period.bridge.invalidReasons.map((reason) => <p key={reason} className="flex gap-2 text-xs text-bs-danger"><AlertTriangle className="size-3.5 shrink-0" />{reason}</p>)}</div> : null}</ContentCard>

        {model.snapshots.length > 1 ? <ContentCard className="min-w-0" padding="compact"><MultiPeriodSummaryTable snapshots={model.snapshots} showOuterCard={false} /></ContentCard> : null}
        {model.series.length > 1 || model.driverAnalyses.length ? <div className="grid min-w-0 gap-4 xl:grid-cols-2">{model.series.length > 1 ? <ContentCard className="min-w-0" padding="compact"><DashboardCharts series={model.series} showOuterCard={false} /></ContentCard> : null}{model.driverAnalyses.length ? <ContentCard className="min-w-0" padding="compact"><PerformanceDrivers analyses={model.driverAnalyses} showOuterCard={false} /></ContentCard> : null}</div> : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <ContentCard><SectionHeader title="Reconciliation" description={period.reconciliation.summaryMessage} /><div className="mt-3 space-y-2">{period.reconciliation.issues.length ? period.reconciliation.issues.map((issue) => <div key={`${issue.key}:${issue.metric}`} className="flex items-start justify-between gap-3 border-b border-bs-border-subtle pb-2 text-xs last:border-0"><div><p className="font-medium">{issue.metric}</p><p className="bs-metadata mt-0.5">{issue.message}</p></div><StatusBadge tone={tone(issue.severity)}>{label(issue.severity)}</StatusBadge></div>) : <p className="text-xs text-bs-success">No reconciliation exceptions reported.</p>}</div></ContentCard>
          <ContentCard><SectionHeader title="Balance-sheet validation" description="Authoritative rollup checks for the selected period." /><div className="mt-3 space-y-2">{period.validation.checks.map((check) => <div key={check.key} className="flex items-start justify-between gap-3 border-b border-bs-border-subtle pb-2 text-xs last:border-0"><div><p className="font-medium">{check.label}</p><p className="bs-metadata mt-0.5">{check.message}</p></div><StatusBadge tone={tone(check.severity)}>{label(check.severity)}</StatusBadge></div>)}</div></ContentCard>
        </div>

        <ContentCard><SectionHeader title="Source backing" description="Canonical links into the existing source and support workflows." /><div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">{model.backing.map((item) => <Link key={item.id} href={item.href} className="rounded-bs-sm border border-bs-border-subtle p-3 hover:bg-bs-page"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{item.label}</p><BackingChip status={item.status} size="compact" /></div><p className="bs-metadata mt-2">{item.note ?? "Open supporting source relationships"}</p></Link>)}</div></ContentCard>

        <DiligenceIssuesPanel companyId={model.companyId} periodId={period.periodId} issues={model.issues} currentPage="financials" title="Financial diligence issues" description="Tracked exceptions linked to financial normalization, validation, and reconciliation." emptyMessage="No financial diligence issues are currently open." allowManualCreate variant="canonical" />
      </>}
    </main>
  </>;
}
