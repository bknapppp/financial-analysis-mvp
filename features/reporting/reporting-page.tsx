"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Link2, Save, Unlink } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ContentCard } from "@/components/ui/content-card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type { ReportingPageViewModel } from "@/features/reporting/reporting-view-model";

const input = "w-full rounded-bs-sm border border-bs-border-subtle bg-bs-surface px-2.5 py-2 text-xs outline-none focus:border-bs-primary";
const button = "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-bs-sm border border-bs-border-strong bg-bs-surface px-3 text-xs font-medium text-bs-text-secondary hover:bg-bs-page disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} border-bs-primary bg-bs-primary text-white hover:bg-bs-primary-hover`;

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readinessTone(state: string): StatusTone {
  if (state === "READY_FOR_REVIEW") return "success";
  if (state === "STALE_SOURCE" || state === "BLOCKED_BY_PHASE_4") return "danger";
  if (state === "COMPOSITION_IN_PROGRESS") return "informational";
  return "neutral";
}

function SectionComposer({
  section,
  findings,
  pending,
  mutate
}: {
  section: ReportingPageViewModel["sections"][number];
  findings: ReportingPageViewModel["findings"];
  pending: boolean;
  mutate: (body: Record<string, unknown>, message: string) => Promise<void>;
}) {
  const [narrative, setNarrative] = useState(section.narrative);
  const [status, setStatus] = useState(section.status);
  const [completionBasis, setCompletionBasis] = useState(section.completionBasis ?? "narrative");
  const [unavailableReason, setUnavailableReason] = useState(section.unavailableReason);
  const [findingId, setFindingId] = useState("");
  const linkedIds = new Set(section.linkedFindings.map((finding) => finding.issueId));

  return <ContentCard id={`section-${section.sectionKey}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <SectionHeader title={`${section.sortOrder}. ${section.title}`} description="Controlled narrative and authoritative finding references." />
      <StatusBadge tone={section.status === "complete" ? "success" : section.status === "in_progress" ? "informational" : "neutral"}>{label(section.status)}</StatusBadge>
    </div>
    {section.id ? <div className="mt-4 grid gap-3">
      <textarea className={`${input} min-h-24 resize-y`} value={narrative} onChange={(event) => setNarrative(event.target.value)} placeholder="Controlled analyst narrative; do not copy mutable financial facts here." />
      <div className="grid gap-2 md:grid-cols-3">
        <label className="bs-label">Status<select className={`${input} mt-1`} value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>{["not_started", "in_progress", "complete"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label className="bs-label">Completion basis<select className={`${input} mt-1`} value={completionBasis} onChange={(event) => setCompletionBasis(event.target.value as typeof completionBasis)}>{["narrative", "authoritative", "unavailable"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label className="bs-label">Unavailable / limitation reason<input className={`${input} mt-1`} value={unavailableReason} onChange={(event) => setUnavailableReason(event.target.value)} placeholder="Required for unavailable basis" /></label>
      </div>
      <div><button className={primary} disabled={pending} onClick={() => mutate({ action: "update_section", sectionId: section.id, version: section.version, narrative, status, completionBasis, unavailableReason }, `${section.title} saved.`)}><Save className="size-3.5" />Save section</button></div>
      <div className="border-t border-bs-border-subtle pt-3">
        <p className="bs-label">Approved Phase 4 findings</p>
        <div className="mt-2 space-y-2">{section.linkedFindings.length ? section.linkedFindings.map((finding) => <div key={finding.issueId} className="flex items-center justify-between gap-3 rounded-bs-sm bg-bs-page p-2.5 text-xs"><div><p className="font-medium">{finding.reference} · {finding.title}</p><p className="bs-metadata">Approved version {finding.expectedApprovedVersion}{finding.stale ? " · stale" : " · current"}</p></div><button className={button} disabled={pending} onClick={() => mutate({ action: "unlink_finding", sectionId: section.id, issueId: finding.issueId }, "Finding unlinked.")}><Unlink className="size-3" />Unlink</button></div>) : <p className="bs-body-text">No approved findings linked.</p>}</div>
        {section.missingLinkedFindings.map((finding) => <div key={finding.issueId} className="mt-2 flex items-center justify-between gap-3 rounded-bs-sm border border-bs-danger/30 bg-bs-danger/5 p-2.5 text-xs"><div><p className="font-medium text-bs-danger">Stale finding source unavailable</p><p className="bs-metadata">{finding.issueId} · expected approved version {finding.expectedApprovedVersion}</p></div><button className={button} disabled={pending} onClick={() => mutate({ action: "unlink_finding", sectionId: section.id, issueId: finding.issueId }, "Stale finding link removed.")}><Unlink className="size-3" />Unlink</button></div>)}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row"><select className={input} value={findingId} onChange={(event) => setFindingId(event.target.value)}><option value="">Select a current approved finding</option>{findings.filter((finding) => !linkedIds.has(finding.issueId)).map((finding) => <option key={finding.issueId} value={finding.issueId}>{finding.reference} · {finding.title}</option>)}</select><button className={button} disabled={pending || !findingId} onClick={() => mutate({ action: "link_finding", sectionId: section.id, issueId: findingId }, "Current approved finding linked.")}><Link2 className="size-3" />Link</button></div>
      </div>
    </div> : <p className="mt-3 bs-body-text">Initialize Reporting to persist this governed section.</p>}
  </ContentCard>;
}

export function ReportingPage({ model }: { model: ReportingPageViewModel }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function mutate(body: Record<string, unknown>, message: string) {
    setPending(true); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/deals/${model.companyId}/phases/reporting`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Reporting update failed.");
      setNotice(message); router.refresh();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Reporting update failed.");
    } finally { setPending(false); }
  }

  return <>
    <PageHeader eyebrow="Phase 5 of 6" title="5. Reporting" description="Compose a controlled reporting package from canonical financial outputs and current approved Phase 4 findings." status={<StatusBadge tone={readinessTone(model.readiness.state)}>{label(model.readiness.state)}</StatusBadge>} progress={<div><div className="mb-1 flex justify-between"><span className="bs-label">Section completion</span><span className="bs-metadata">{model.readiness.completeSections} / {model.readiness.totalSections}</span></div><ProgressBar value={model.readiness.completionPercent} label="Reporting section completion" showValue /></div>} actions={model.mode === "uninitialized" ? <button className={primary} disabled={pending} onClick={() => mutate({ action: "initialize" }, "Reporting initialized.")}>Initialize Reporting</button> : undefined} />
    {error ? <div role="alert" className="border-b border-bs-danger/20 bg-bs-danger/10 px-4 py-2 text-center text-xs text-bs-danger">{error}</div> : null}
    {notice ? <div role="status" className="border-b border-bs-success/20 bg-bs-success/10 px-4 py-2 text-center text-xs text-bs-success">{notice}</div> : null}
    <main className="mx-auto max-w-bs-content space-y-4 px-4 py-5 md:px-6">
      {model.mode === "schema_unavailable" ? <ContentCard><SectionHeader title="Reporting schema unavailable" description="Phase 5.1 has not been applied to this database." /><p className="mt-3 bs-body-text">Apply the reviewed migration <code>20260828120000_create_phase5_reporting_foundation.sql</code> before initializing a real deal. Opening this page has not created records.</p></ContentCard> : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-4 md:grid-cols-2">
          <ContentCard><SectionHeader title="Report readiness" description={`${model.readiness.blockers.length} current blocker(s)`} /><div className="mt-3 space-y-2">{model.readiness.blockers.length ? model.readiness.blockers.map((blocker) => <p key={blocker} className="flex gap-2 text-xs"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-bs-warning" />{blocker}</p>) : <p className="text-xs text-bs-success">Phase 5.1 composition gates currently pass.</p>}</div></ContentCard>
          <ContentCard><SectionHeader title="QoE / EBITDA bridge" description={model.bridge.available ? "Existing canonical calculation output" : "Unavailable"} /><dl className="mt-3 space-y-2 text-xs"><div className="flex justify-between"><dt>Canonical EBITDA</dt><dd className="font-medium">{model.bridge.canonicalEbitda}</dd></div><div className="flex justify-between"><dt>Accepted add-backs</dt><dd className="font-medium">{model.bridge.acceptedAddBacks}</dd></div><div className="flex justify-between border-t pt-2"><dt>Adjusted EBITDA</dt><dd className="font-semibold">{model.bridge.adjustedEbitda}</dd></div></dl></ContentCard>
        </div>
        <ContentCard><SectionHeader title="Reporting control" /><dl className="mt-3 space-y-2 text-xs"><div className="flex justify-between"><dt>Phase 4</dt><dd>{model.phase4Complete ? "Complete" : "Incomplete"}</dd></div><div className="flex justify-between"><dt>Reportable findings</dt><dd>{model.findings.length}</dd></div><div className="flex justify-between"><dt>Stale links</dt><dd>{model.readiness.staleLinkCount}</dd></div><div className="flex justify-between"><dt>Activity</dt><dd>{model.activity.length || "None"}</dd></div></dl></ContentCard>
      </div>
      <ContentCard><SectionHeader title="Authoritative headline financial metrics" description="Read directly from the existing financial model; not persisted as report narrative." /><div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">{model.metrics.map((metric) => <div key={metric.label} className="rounded-bs-sm bg-bs-page p-3"><p className="bs-label">{metric.label}</p><p className={`mt-1 text-sm font-semibold ${metric.available ? "" : "text-bs-neutral"}`}>{metric.value}</p></div>)}</div></ContentCard>
      {model.staleLinks.length ? <ContentCard><SectionHeader title="Stale reporting sources" count={model.staleLinks.length} description="Expected versions are preserved and are never silently rewritten." /><div className="mt-3 space-y-2">{model.staleLinks.map((link) => <p key={`${link.sectionId}:${link.issueId}`} className="text-xs text-bs-danger">Finding {link.issueId}: expected approved version {link.expectedVersion}; current {link.currentVersion ?? "unavailable"} ({label(link.reason)}).</p>)}</div></ContentCard> : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,.65fr)]">
        <div className="space-y-4">{model.sections.map((section) => <SectionComposer key={section.sectionKey} section={section} findings={model.findings} pending={pending} mutate={mutate} />)}</div>
        <div className="space-y-4">
          <ContentCard><SectionHeader title="Current approved Phase 4 findings" count={model.findings.length} description="This register is supplied only by the authoritative Phase 4 projection." /><div className="mt-3 space-y-2">{model.findings.length ? model.findings.map((finding) => <div key={finding.issueId} className="rounded-bs-sm border border-bs-border-subtle p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{finding.reference}</p><StatusBadge tone={["high", "critical"].includes(finding.severity) ? "danger" : "neutral"}>{label(finding.severity)}</StatusBadge></div><p className="mt-1 text-xs font-medium">{finding.title}</p><p className="mt-1 bs-metadata">Approved v{finding.approvedVersion} · {label(finding.materiality)}</p><p className="mt-2 text-xs">{finding.approvedReportLanguage}</p></div>) : <p className="bs-body-text">No current approved reportable findings are available.</p>}</div></ContentCard>
          <ContentCard><SectionHeader title="Limitations and caveats" count={model.limitations.length} /><div className="mt-3 space-y-2">{model.limitations.length ? model.limitations.map((item) => <p key={item} className="text-xs">{item}</p>) : <p className="bs-body-text">No current readiness or reconciliation limitation is reported.</p>}</div></ContentCard>
          <ContentCard><SectionHeader title="Next actions" /><ol className="mt-3 space-y-2">{model.readiness.blockers.length ? model.readiness.blockers.map((blocker, index) => <li key={blocker} className="text-xs"><span className="mr-2 font-semibold text-bs-primary">{index + 1}.</span>{blocker}</li>) : <li className="text-xs">Phase 5.1 composition is ready for the later review workflow.</li>}</ol></ContentCard>
        </div>
      </div>
    </main>
  </>;
}
