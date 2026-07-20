import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  FileText,
  FolderOpen,
  History,
  ListChecks,
  MessageSquareText,
  UserRoundX,
  type LucideIcon
} from "lucide-react";
import { ContentCard } from "@/components/ui/content-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import type { OverviewActivity, OverviewPageViewModel, OverviewPhase } from "@/features/overview/overview-view-model";

type OverviewPageProps = { model: OverviewPageViewModel };

const activityIconByType: Record<OverviewActivity["type"], LucideIcon> = {
  document: FolderOpen,
  issue: AlertTriangle
};

const metricIcons: Record<string, LucideIcon> = {
  Documents: FileText,
  Requests: ClipboardList,
  "Open Issues": AlertTriangle,
  Tasks: ListChecks,
  "Q&A": MessageSquareText
};

function MetadataItem({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-[9px] text-bs-text-muted">{label}</dt><dd className="mt-0.5 truncate text-[11px] font-medium text-bs-text-primary" title={value}>{value}</dd></div>;
}

function PhaseTimeline({ phases }: { phases: OverviewPhase[] }) {
  return (
    <div className="relative mt-4 grid grid-cols-6" aria-label="Six-phase transaction timeline">
      <div className="absolute left-[8.33%] right-[8.33%] top-3 h-px bg-bs-border-strong" aria-hidden="true" />
      {phases.map((phase) => {
        const current = phase.key === "analysis";
        return (
          <div key={phase.key} className="relative flex min-w-0 flex-col items-center text-center">
            <span className={`z-10 flex size-6 items-center justify-center rounded-full border text-[10px] font-semibold ${current ? "border-bs-primary bg-bs-primary text-white ring-2 ring-bs-primary/15" : "border-bs-border-strong bg-bs-surface text-bs-text-muted"}`}>{phase.number}</span>
            <span className={`mt-2 max-w-20 text-[9px] leading-3 ${current ? "font-semibold text-bs-text-primary" : "text-bs-text-muted"}`}>{phase.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function PhaseProgressRow({ phase }: { phase: OverviewPhase }) {
  return (
    <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(3.5rem,0.8fr)_4.7rem_4.7rem] items-center gap-2 border-b border-bs-border-subtle py-1.5 last:border-0">
      <span className="truncate text-[10px] font-medium text-bs-text-primary">{phase.number}. {phase.label}</span>
      {phase.progressPercent === null ? <div className="h-1 rounded-full bg-bs-border-subtle" /> : <ProgressBar value={phase.progressPercent} label={`${phase.label} progress`} />}
      <StatusBadge tone={phase.tone}>{phase.statusLabel}</StatusBadge>
      <span className="truncate text-right text-[9px] text-bs-text-muted">{phase.dueDateLabel}</span>
    </div>
  );
}

function SeverityDonut({ model }: { model: OverviewPageViewModel }) {
  const colors = ["#dc2626", "#f97316", "#f59e0b", "#16a34a"];
  let offset = 0;
  const stops = model.issueSeverity.map((item, index) => {
    const start = offset;
    offset += item.percent;
    return `${colors[index]} ${start}% ${offset}%`;
  });
  const background = model.issueTotal > 0 ? `conic-gradient(${stops.join(",")})` : "#e2e8f0";

  return (
    <div className="mt-3 flex items-center justify-center gap-5">
      <div className="relative size-28 shrink-0 rounded-full" style={{ background }} role="img" aria-label={`${model.issueTotal} total issues by severity`}>
        <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-bs-surface"><span className="text-xl font-semibold text-bs-text-primary">{model.issueTotal}</span><span className="text-[9px] text-bs-text-muted">Total</span></div>
      </div>
      <ul className="min-w-24 space-y-1.5">
        {model.issueSeverity.map((item, index) => <li key={item.severity} className="flex items-center gap-2 text-[10px]"><span className="size-2 rounded-sm" style={{ backgroundColor: colors[index] }} /><span className="text-bs-text-secondary">{item.label}</span><span className="ml-auto font-semibold tabular-nums text-bs-text-primary">{item.count}</span></li>)}
      </ul>
    </div>
  );
}

function PhaseSummaryCard({ phase }: { phase: OverviewPhase }) {
  return (
    <ContentCard padding="compact" className="flex min-h-40 flex-col">
      <div className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-bs-primary text-[10px] font-semibold text-white">{phase.number}</span><h3 className="text-xs font-semibold text-bs-text-primary">{phase.label}</h3></div>
      <div className="mt-3"><StatusBadge tone={phase.tone}>{phase.statusLabel}</StatusBadge></div>
      <p className="mt-2 text-[10px] leading-4 text-bs-text-muted">{phase.detail}</p>
      <Link href={phase.href} className="mt-auto inline-flex items-center gap-1 pt-3 text-[10px] font-medium text-bs-primary">{phase.implemented ? "Open current workflow" : "Preview only"}<ArrowRight className="size-3" /></Link>
    </ContentCard>
  );
}

export function OverviewPage({ model }: OverviewPageProps) {
  return (
    <>
      <section className="border-b border-bs-border-subtle bg-bs-surface px-4 py-3 md:px-5">
        <div className="mx-auto flex max-w-bs-content flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-base font-semibold tracking-tight text-bs-text-primary">{model.identity.title}</h1><StatusBadge tone={model.identity.stageTone}>{model.identity.dealStage}</StatusBadge></div>
            <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-4 xl:grid-cols-7">
              <MetadataItem label="Project ID" value={model.identity.projectId} /><MetadataItem label="Client" value={model.identity.client} /><MetadataItem label="Target" value={model.identity.companyName} /><MetadataItem label="Deal Type" value={model.identity.dealType} /><MetadataItem label="Start Date" value={model.identity.startDate} /><MetadataItem label="Target Close" value={model.identity.targetClose} /><MetadataItem label="Currency" value={model.identity.baseCurrency} />
            </dl>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href={model.links.legacyDeal} className="inline-flex min-h-8 items-center rounded-bs-sm border border-bs-border-strong px-3 text-[10px] font-medium text-bs-text-secondary hover:bg-bs-page">Legacy workspace</Link>
            <Link href={model.links.sourceData} className="inline-flex min-h-8 items-center rounded-bs-sm bg-bs-primary px-3 text-[10px] font-medium text-white hover:bg-bs-primary-hover">Review source data</Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-bs-content space-y-3 px-4 py-3 md:px-5">
        <div className="grid gap-3 xl:grid-cols-[1.08fr_1fr_0.66fr]">
          <ContentCard padding="compact" className="min-w-0">
            <SectionHeader title="Overall Progress" />
            <PhaseTimeline phases={model.phases} />
            <div className="mt-4 flex items-end justify-between border-t border-bs-border-subtle pt-3">
              <div><p className="text-xl font-semibold text-bs-text-muted">Unavailable</p><p className="text-[9px] text-bs-text-muted">Transaction completion · not yet modeled</p></div>
              <dl className="grid grid-cols-2 gap-x-5 text-[9px]"><div><dt className="text-bs-text-muted">Projected close</dt><dd className="mt-0.5 font-medium text-bs-text-primary">{model.overallProgress.projectedCloseLabel}</dd></div><div><dt className="text-bs-text-muted">Weeks remaining</dt><dd className="mt-0.5 font-medium text-bs-text-primary">{model.overallProgress.weeksRemainingLabel}</dd></div></dl>
            </div>
          </ContentCard>

          <ContentCard padding="compact" className="min-w-0">
            <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(3.5rem,0.8fr)_4.7rem_4.7rem] gap-2 border-b border-bs-border-subtle pb-2 text-[9px] text-bs-text-muted"><span className="font-semibold text-bs-text-primary">Phase Progress</span><span>Progress</span><span>Status</span><span className="text-right">Due date</span></div>
            {model.phases.map((phase) => <PhaseProgressRow key={phase.key} phase={phase} />)}
          </ContentCard>

          <ContentCard padding="compact" className="min-w-0">
            <SectionHeader title="Key Metrics" />
            <div className="mt-1 divide-y divide-bs-border-subtle">
              {model.keyMetrics.map((metric) => { const Icon = metricIcons[metric.label] ?? CircleHelp; return <div key={metric.label} className="flex items-center gap-2 py-2"><Icon className="size-3.5 shrink-0 text-bs-text-muted" /><span className="min-w-0 flex-1 truncate text-[10px] font-medium text-bs-text-primary">{metric.label}</span><span className={`text-[10px] font-semibold tabular-nums ${metric.available ? "text-bs-text-primary" : "text-bs-text-muted"}`}>{metric.value}</span></div>; })}
            </div>
          </ContentCard>
        </div>

        <div className="grid gap-3 xl:grid-cols-[1.08fr_0.76fr_0.9fr]">
          <ContentCard padding="compact">
            <SectionHeader title="Recent Activity" count={model.activities.length} />
            {model.activities.length ? <ul className="mt-1 divide-y divide-bs-border-subtle">{model.activities.slice(0, 4).map((activity) => { const Icon=activityIconByType[activity.type]; return <li key={activity.id}><Link href={activity.href ?? "#"} className="flex items-center gap-2 py-2"><Icon className="size-3.5 shrink-0 text-bs-text-muted" /><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-medium text-bs-text-primary">{activity.label}</p><p className="truncate text-[9px] text-bs-text-muted">{activity.detail} · {activity.timestampLabel}</p></div></Link></li>; })}</ul> : <EmptyState icon={History} title="No authoritative activity" description={model.activityUnavailableReason ?? "No recent activity is available."} />}
          </ContentCard>
          <ContentCard padding="compact"><SectionHeader title="Issues by Severity" /><SeverityDonut model={model} /></ContentCard>
          <ContentCard padding="compact"><SectionHeader title="Team Activity" /><EmptyState density="compact" icon={UserRoundX} title="Team activity unavailable" description={model.teamActivityUnavailableReason} /></ContentCard>
        </div>

        <div className="grid gap-3 xl:grid-cols-[0.8fr_1fr_1fr]">
          <ContentCard><SectionHeader title="Financial Snapshot" /><dl className="mt-2 grid grid-cols-2 gap-2">{model.financialSnapshot.map((item) => <div key={item.label} className="rounded-bs-sm bg-bs-page px-2.5 py-2"><dt className="text-[9px] text-bs-text-muted">{item.label}</dt><dd className={`mt-0.5 text-[11px] font-semibold ${item.available ? "text-bs-text-primary" : "text-bs-text-muted"}`}>{item.value}</dd></div>)}</dl><div className="mt-3"><div className="mb-1 flex justify-between text-[9px]"><span>Financial completion</span><span>{Math.round(model.overallProgress.financialCompletionPercent)}%</span></div><ProgressBar value={model.overallProgress.financialCompletionPercent} label="Financial completion" /></div></ContentCard>
          <ContentCard><SectionHeader title="Current Blockers" count={model.blockers.length} />{model.blockers.length ? <ul className="mt-1 divide-y divide-bs-border-subtle">{model.blockers.slice(0,4).map((blocker)=><li key={blocker} className="flex gap-2 py-2 text-[10px] text-bs-text-primary"><AlertTriangle className="mt-0.5 size-3 shrink-0 text-bs-danger" />{blocker}</li>)}</ul> : <p className="mt-3 text-[10px] text-bs-success">No current blockers are reported.</p>}</ContentCard>
          <ContentCard><SectionHeader title="Next Actions" count={model.nextActions.length} />{model.nextActions.length ? <ul className="mt-1 divide-y divide-bs-border-subtle">{model.nextActions.slice(0,4).map((action)=><li key={action.id}><Link href={action.href} className="flex items-center gap-2 py-2"><StatusBadge tone={action.tone}>Action</StatusBadge><span className="min-w-0 flex-1 truncate text-[10px] font-medium text-bs-text-primary">{action.label}</span><ArrowRight className="size-3 text-bs-text-muted" /></Link></li>)}</ul> : <p className="mt-3 text-[10px] text-bs-success">No next actions are currently produced.</p>}</ContentCard>
        </div>

        <section aria-labelledby="phase-summary-heading"><h2 id="phase-summary-heading" className="mb-2 text-xs font-semibold text-bs-text-primary">Phase Summaries</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{model.phases.map((phase)=><PhaseSummaryCard key={phase.key} phase={phase} />)}</div></section>
      </div>
    </>
  );
}
