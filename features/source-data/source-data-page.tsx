import Link from "next/link";
import { Database } from "lucide-react";
import { CompanySetupForm } from "@/components/company-setup-form";
import { CsvImportSection } from "@/components/csv-import-section";
import { DealNextActionsPanel } from "@/components/deal-next-actions-panel";
import { DiligenceFeedbackPanel } from "@/components/diligence-feedback-panel";
import { DocumentSection } from "@/components/document-section";
import { EntryForm } from "@/components/entry-form";
import { PageHeader } from "@/components/layout/page-header";
import { PeriodForm } from "@/components/period-form";
import { SourceDataSummaryPanel } from "@/components/source-data-summary-panel";
import { SourceReconciliationCard } from "@/components/source-reconciliation-card";
import { ContentCard } from "@/components/ui/content-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { resolveDiligenceIssueActionTarget } from "@/lib/diligence-issues";
import type { DiligenceIssueSeverity } from "@/lib/types";
import type { SourceDataPageViewModel, SourceIssueSupport } from "@/features/source-data/source-data-view-model";

function readinessTone(status: string): StatusTone {
  if (status === "ready") return "success";
  if (status === "caution") return "warning";
  if (status === "blocked") return "danger";
  return "neutral";
}

function severityTone(severity: DiligenceIssueSeverity): StatusTone {
  if (severity === "critical" || severity === "high") return "danger";
  if (severity === "medium") return "warning";
  return "neutral";
}

function MetricCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <div className="rounded-bs-md border border-bs-border-subtle bg-bs-page px-3 py-3">
    <p className="bs-label">{label}</p>
    <p className="mt-1.5 text-xl font-semibold tracking-tight text-bs-text-primary">{value}</p>
    <p className="bs-metadata mt-1">{helper}</p>
  </div>;
}

function SourceIssuesPanel({ issues, issueSupport }: {
  issues: Extract<SourceDataPageViewModel, { kind: "deal" }>["sourceIssues"];
  issueSupport: Record<string, SourceIssueSupport>;
}) {
  return <ContentCard id="source-data-issues">
    <details>
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3">
        <div>
          <p className="bs-label">Attention queue</p>
          <h2 className="bs-section-title mt-1">Source Data Issues</h2>
          <p className="bs-body-text mt-1">Resolve source, mapping, tax, and reconciliation exceptions.</p>
        </div>
        <StatusBadge tone={issues.length > 0 ? "warning" : "success"}>{issues.length} open</StatusBadge>
      </summary>
      {issues.length > 0 ? <div className="mt-4 overflow-x-auto rounded-bs-md border border-bs-border-subtle">
        <table className="min-w-full divide-y divide-bs-border-subtle text-xs">
          <thead className="bg-bs-page"><tr>
            <th className="px-3 py-2.5 text-left font-medium text-bs-text-muted">Issue</th>
            <th className="px-3 py-2.5 text-left font-medium text-bs-text-muted">Severity</th>
            <th className="px-3 py-2.5 text-left font-medium text-bs-text-muted">Action</th>
          </tr></thead>
          <tbody className="divide-y divide-bs-border-subtle bg-bs-surface">
            {issues.map((issue) => {
              const actionTarget = resolveDiligenceIssueActionTarget(issue);
              const support = issueSupport[issue.id];
              return <tr key={issue.id}>
                <td className="px-3 py-3 align-top">
                  <p className="font-medium text-bs-text-primary">{issue.title}</p>
                  <p className="mt-1 text-bs-text-muted">{issue.description}</p>
                  {support ? <p className="mt-1 text-bs-text-muted">{support.detail}</p> : null}
                </td>
                <td className="px-3 py-3 align-top"><StatusBadge tone={severityTone(issue.severity)}>{issue.severity}</StatusBadge></td>
                <td className="px-3 py-3 align-top">
                  {actionTarget.isActionable && actionTarget.linkedRoute && actionTarget.actionLabel ? <Link
                    href={actionTarget.linkedRoute}
                    className="inline-flex min-h-8 items-center rounded-bs-sm border border-bs-border-strong bg-bs-surface px-3 font-medium text-bs-text-secondary hover:bg-bs-page"
                  >{actionTarget.actionLabel}</Link> : <span className="text-bs-text-muted">No action linked</span>}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div> : <EmptyState
        title="No open source-data issues"
        description="No source, mapping, tax, or reconciliation exceptions are currently tracked."
        icon={Database}
        density="compact"
      />}
    </details>
  </ContentCard>;
}

export function EmptySourceDataPage({ model }: { model: Extract<SourceDataPageViewModel, { kind: "empty" }> }) {
  return <div className="bs-foundation min-h-screen bg-bs-page">
    <PageHeader eyebrow="Transaction data" title={model.title} description={model.description} />
    <main className="mx-auto max-w-3xl px-4 py-5 md:px-6">
      <ContentCard>
        <EmptyState title="No deal selected" description="Create a deal to upload, map, and reconcile its source package." icon={Database} />
        <CompanySetupForm />
      </ContentCard>
    </main>
  </div>;
}

export function SourceDataPage({ model }: { model: Extract<SourceDataPageViewModel, { kind: "deal" }> }) {
  const data = model.workspaceData;
  const progress = data.completionSummary.completionPercent;

  return <>
    <PageHeader
      eyebrow="Transaction data"
      title={model.title}
      description={model.description}
      status={<StatusBadge tone={readinessTone(data.readiness.status)}>{data.readiness.label}</StatusBadge>}
      progress={<div><div className="mb-1 flex justify-between"><span className="bs-label">Source readiness</span><span className="bs-metadata">{progress}%</span></div><ProgressBar value={progress} label="Source readiness" /></div>}
      actions={<>
        <Link className="inline-flex min-h-8 items-center rounded-bs-sm border border-bs-border-strong bg-bs-surface px-3 text-xs font-medium text-bs-text-secondary hover:bg-bs-page" href={model.financialsHref}>Review Financials</Link>
        <Link className="inline-flex min-h-8 items-center rounded-bs-sm bg-bs-primary px-3 text-xs font-medium text-white hover:bg-bs-primary-hover" href={model.dataReviewHref}>Continue to Data Review</Link>
      </>}
    />

    <main className="mx-auto max-w-bs-content space-y-4 px-4 py-5 md:px-6">
      <ContentCard>
        <div className="flex flex-col gap-4 border-b border-bs-border-subtle pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="bs-label">Intake status</p>
            <h2 className="bs-section-title mt-1">Source data workflow</h2>
            <p className="bs-body-text mt-1">Review coverage, upload and map source files, resolve exceptions, then continue into analysis.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="inline-flex min-h-8 items-center rounded-bs-sm bg-bs-primary px-3 text-xs font-medium text-white hover:bg-bs-primary-hover" href="#source-data-upload">Upload source data</a>
            <a className="inline-flex min-h-8 items-center rounded-bs-sm border border-bs-border-strong bg-bs-surface px-3 text-xs font-medium text-bs-text-secondary hover:bg-bs-page" href="#source-data-issues">Review issues</a>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <MetricCard label="Missing documents" value={String(model.missingDocumentCount)} helper="Required source support still missing" />
          <MetricCard label="Mapping coverage" value={`${model.mappingCoveragePercent}%`} helper="Mapped rows in the current intake" />
          <MetricCard label="Outstanding issues" value={String(model.outstandingIssueCount)} helper="Open source or reconciliation items" />
        </div>
      </ContentCard>

      <section id="source-data-upload">
        <CsvImportSection
          companies={data.companies}
          initialCompanyId={model.companyId}
          initialPeriods={data.periods}
          companySetupSlot={<CompanySetupForm />}
          advancedToolsSlot={<div className="space-y-3">
            <ContentCard padding="compact"><details><summary className="cursor-pointer list-none text-xs font-semibold text-bs-text-primary">Manual period tools</summary><p className="bs-body-text mt-2">Use only when the uploaded source lacks period structure.</p><div className="mt-4"><PeriodForm companyId={model.companyId} /></div></details></ContentCard>
            <ContentCard padding="compact"><details><summary className="cursor-pointer list-none text-xs font-semibold text-bs-text-primary">Manual entry fallback</summary><p className="bs-body-text mt-2">Use for a targeted adjustment or small missing line item.</p><div className="mt-4"><EntryForm companyId={model.companyId} periods={data.periods} /></div></details></ContentCard>
          </div>}
        />
      </section>

      <SourceDataSummaryPanel data={data} />
      <DocumentSection companyId={model.companyId} rows={data.backing.sourceRequirements} documents={data.documents} documentLinks={data.documentLinks} documentVersions={data.documentVersions} issues={model.sourceIssues} />
      <SourceIssuesPanel issues={model.sourceIssues} issueSupport={model.issueSupport} />
      <SourceReconciliationCard companyId={model.companyId} periodId={data.snapshot.periodId || null} />
      <DealNextActionsPanel companyId={model.companyId} actions={model.sourceActions} issues={model.sourceIssuesForActions} completeness={model.completeness} trustScore={model.trustScore} />
      <DiligenceFeedbackPanel feedback={data.diligenceIssueFeedback} title="Source Issue Changes" />
    </main>
  </>;
}
