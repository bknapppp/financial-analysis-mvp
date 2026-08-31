"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, Check, CheckCircle2, Circle, Clock3, Download, FileSpreadsheet, MessageSquareText, Paperclip, ShieldCheck, Upload, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageTabs } from "@/components/layout/page-tabs";
import { ContentCard } from "@/components/ui/content-card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { PLANNING_PROTOTYPE_NOTICE, type PlanningChecklistItem, type PlanningPageViewModel, type PlanningTone } from "@/features/planning/planning-view-model";

const buttonClass = "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-bs-sm border border-bs-border-strong bg-bs-surface px-3 text-xs font-medium text-bs-text-secondary hover:bg-bs-page";
const inputClass = "min-h-9 rounded-bs-sm border border-bs-border-strong bg-bs-surface px-2.5 text-xs text-bs-text-primary shadow-none outline-none focus:border-bs-primary focus:ring-2 focus:ring-bs-primary/10";

type EditorKey = "overview" | "scope" | "thresholds" | "team" | "milestones" | "risk" | "comment" | "workpaper" | null;

function cloneModel(model: PlanningPageViewModel) {
  return structuredClone(model);
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="bs-label block space-y-1.5">{children}</label>;
}

function EditorDialog({ title, description, children, onCancel, onSave, saveLabel = "Save changes" }: { title: string; description: string; children: React.ReactNode; onCancel: () => void; onSave: () => void; saveLabel?: string }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onCancel(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="planning-editor-title" className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-bs-lg border border-bs-border-subtle bg-bs-surface shadow-bs-overlay">
      <div className="border-b border-bs-border-subtle px-5 py-4"><h2 id="planning-editor-title" className="text-base font-semibold text-bs-text-primary">{title}</h2><p className="bs-metadata mt-1">{description}</p></div>
      <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 py-4">{children}</div>
      <div className="flex justify-end gap-2 border-t border-bs-border-subtle bg-bs-page px-5 py-3"><button type="button" className={buttonClass} onClick={onCancel}>Cancel</button><button type="button" className="inline-flex min-h-8 items-center rounded-bs-sm bg-bs-primary px-3 text-xs font-medium text-white hover:bg-bs-primary-hover" onClick={onSave}>{saveLabel}</button></div>
    </section>
  </div>;
}

function statusTone(status: PlanningChecklistItem["status"]): PlanningTone {
  if (status === "Complete") return "success";
  if (status === "In progress") return "informational";
  return "neutral";
}

function DefinitionList({ items }: { items: Array<{ label: string; value: string }> }) {
  return <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2">{items.map((item) => <div key={item.label}><dt className="bs-label">{item.label}</dt><dd className="mt-0.5 text-xs font-medium text-bs-text-primary">{item.value}</dd></div>)}</dl>;
}

function formatPlanningDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function PlanningPage({ model: initialModel }: { model: PlanningPageViewModel }) {
  const [workspace, setWorkspace] = useState(() => cloneModel(initialModel));
  const [draft, setDraft] = useState(() => cloneModel(initialModel));
  const [editor, setEditor] = useState<EditorKey>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submissionOpen, setSubmissionOpen] = useState(false);
  const [customScope, setCustomScope] = useState("");
  const [riskDraft, setRiskDraft] = useState({ title: "", rationale: "", owner: "Unassigned", severity: "Medium", status: "Open" });
  const [commentDraft, setCommentDraft] = useState("");
  const [workpaperDraft, setWorkpaperDraft] = useState({ name: "", type: "Excel workpaper", owner: initialModel.team[0]?.name ?? "Unassigned", workstream: "Quality of earnings" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activitySequenceRef = useRef(0);
  const completed = workspace.checklist.filter((item) => item.status === "Complete").length;
  const model = workspace;
  const phaseHref = `/deal/${workspace.shell.companyId}/phases/planning`;
  const prerequisites = useMemo(() => {
    const items = workspace.checklist.filter((item) => item.status !== "Complete").map((item) => item.task);
    if (workspace.engagement.scope.length === 0) items.push("Define at least one in-scope diligence area");
    if (workspace.workpapers.length === 0) items.push("Attach at least one planning workpaper or template");
    return items;
  }, [workspace]);

  function openEditor(key: Exclude<EditorKey, null>) {
    setDraft(cloneModel(workspace));
    setNotice(null);
    setEditor(key);
  }

  function addActivity(title: string, detail: string) {
    activitySequenceRef.current += 1;
    return [{ title: `${title} · Update ${activitySequenceRef.current}`, detail, actor: "Preview User", timestamp: "Just now" }, ...workspace.activity];
  }

  function saveDraft(title: string, detail: string) {
    activitySequenceRef.current += 1;
    setWorkspace({ ...draft, activity: [{ title: `${title} · Update ${activitySequenceRef.current}`, detail, actor: "Preview User", timestamp: "Just now" }, ...workspace.activity] });
    setEditor(null);
    setNotice(`${title} — saved for this browser session`);
  }

  function cycleChecklist(item: PlanningChecklistItem) {
    const status = item.status === "Not started" ? "In progress" : item.status === "In progress" ? "Complete" : "Not started";
    activitySequenceRef.current += 1;
    setWorkspace((current) => ({ ...current, checklist: current.checklist.map((row) => row.id === item.id ? { ...row, status } : row), activity: [{ title: `${item.task} · ${status} · Update ${activitySequenceRef.current}`, detail: `Planning control marked ${status.toLowerCase()}.`, actor: "Preview User", timestamp: "Just now" }, ...current.activity] }));
  }

  function exportPlan() {
    const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "phase-1-planning-plan.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Planning plan exported from the current session");
  }

  function handlePageClick(event: React.MouseEvent<HTMLDivElement>) {
    const link = (event.target as HTMLElement).closest("a");
    if (link?.textContent?.includes("Upload template") && workspace.shell.companyId === "preview") {
      event.preventDefault();
      openEditor("workpaper");
      return;
    }
    const button = (event.target as HTMLElement).closest("button");
    if (!button) return;
    const label = button.textContent?.trim();
    const editorByLabel: Record<string, Exclude<EditorKey, null>> = {
      "Edit overview": "overview",
      "Edit scope": "scope",
      "Update thresholds": "thresholds",
      "Manage team": "team",
      "Edit timeline": "milestones",
      "Log risk": "risk",
      "Add comment": "comment"
    };
    if (label && editorByLabel[label]) openEditor(editorByLabel[label]);
  }

  return <div onClickCapture={handlePageClick}>
    <PageHeader
      eyebrow="Phase 1 of 6"
      title="Planning & Scoping"
      description="Define the engagement, assign ownership, establish thresholds, and organize the files that will govern the diligence process."
      status={<StatusBadge tone={workspace.statusTone}>{workspace.status}</StatusBadge>}
      progress={<div><div className="mb-1 flex justify-between"><span className="bs-label">Phase completion</span><span className="bs-metadata">{workspace.completionPercent}%</span></div><ProgressBar value={workspace.completionPercent} label="Planning phase completion" /></div>}
      actions={<><button type="button" className={buttonClass} onClick={exportPlan}><Download className="size-3.5" />Export plan</button><button type="button" className="inline-flex min-h-8 items-center gap-1.5 rounded-bs-sm bg-bs-primary px-3 text-xs font-medium text-white hover:bg-bs-primary-hover" onClick={() => setSubmissionOpen(true)}><ShieldCheck className="size-3.5" />Submit for approval</button></>}
    />
    {workspace.isPreview ? <div className="border-b border-bs-info/20 bg-bs-info/5 px-4 py-2 text-center text-[11px] text-bs-info md:px-6">{PLANNING_PROTOTYPE_NOTICE}</div> : null}
    {notice ? <div role="status" className="border-b border-bs-success/20 bg-bs-success/5 px-4 py-2 text-center text-[11px] text-bs-success md:px-6">{notice}</div> : null}
    <PageTabs ariaLabel="Planning and scoping sections" activeKey="overview" items={[
      { key: "overview", label: "Overview", href: `${phaseHref}#overview` },
      { key: "scope", label: "Scope & approach", href: `${phaseHref}#scope` },
      { key: "team", label: "Team & milestones", href: `${phaseHref}#team` },
      { key: "risks", label: "Risks & questions", href: `${phaseHref}#risks` },
      { key: "files", label: "Workpapers & templates", href: `${phaseHref}#files` },
      { key: "review", label: "Review & activity", href: `${phaseHref}#review` }
    ]} />
    <div className="mx-auto max-w-bs-content space-y-4 px-4 py-4 md:px-6">
      <div id="overview" className="grid scroll-mt-4 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(32rem,0.95fr)]">
        <ContentCard>
          <SectionHeader title="Engagement objectives & deal overview" description="Shared mandate for the diligence team and reviewers" actions={<button type="button" className={buttonClass}>Edit overview</button>} />
          <div className="mt-4 space-y-5">
            <div className="min-w-0"><p className="bs-label">Primary objective</p><p className="mt-1 text-xs leading-5 text-bs-text-secondary">{model.engagement.objective}</p><p className="bs-label mt-4">Deal overview</p><p className="mt-1 text-xs leading-5 text-bs-text-secondary">{model.engagement.dealOverview}</p></div>
            <DefinitionList items={[{ label: "Engagement lead", value: model.team[0].name }, { label: "Executive reviewer", value: model.team[3].name }, { label: "Base currency", value: "USD" }, { label: "Target draft", value: formatPlanningDate(model.engagement.targetDraft) }]} />
          </div>
        </ContentCard>
        <ContentCard>
          <SectionHeader title="Phase checklist" description={`${completed} of ${model.checklist.length} planning controls complete`} actions={<StatusBadge tone="informational">{Math.round((completed / model.checklist.length) * 100)}%</StatusBadge>} />
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[30rem] border-collapse"><thead><tr className="border-b border-bs-border-subtle"><th className="bs-table-header px-2 py-2 text-left">Task</th><th className="bs-table-header px-2 text-left">Owner</th><th className="bs-table-header px-2 text-left">Status</th><th className="bs-table-header px-2 text-right">Due</th></tr></thead><tbody>{model.checklist.map((item) => <tr key={item.id} className="h-bs-table-row border-b border-bs-border-subtle last:border-0"><td className="bs-table-body px-2"><span className="flex items-center gap-2">{item.status === "Complete" ? <CheckCircle2 className="size-3.5 text-bs-success" /> : item.status === "In progress" ? <Clock3 className="size-3.5 text-bs-info" /> : <Circle className="size-3.5 text-bs-text-muted" />}{item.task}</span></td><td className="px-2"><span className="flex size-6 items-center justify-center rounded-full bg-bs-page text-[9px] font-semibold text-bs-text-secondary">{item.owner}</span></td><td className="px-2"><StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge></td><td className="bs-table-body px-2 text-right">{item.dueDate}</td></tr>)}</tbody></table></div>
        </ContentCard>
      </div>

      <div id="scope" className="grid scroll-mt-4 gap-4 xl:grid-cols-2">
        <ContentCard><SectionHeader title="Scope definition" description="Agreed workstreams and explicit exclusions" actions={<button type="button" className={buttonClass}>Edit scope</button>} /><div className="mt-4 grid gap-5 sm:grid-cols-2"><div><p className="bs-label mb-2">In scope</p><ul className="space-y-2">{model.engagement.scope.map((item) => <li key={item} className="flex gap-2 text-xs text-bs-text-secondary"><Check className="mt-0.5 size-3.5 shrink-0 text-bs-success" />{item}</li>)}</ul></div><div><p className="bs-label mb-2">Explicitly out of scope</p><ul className="space-y-2">{model.engagement.outOfScope.map((item) => <li key={item} className="flex gap-2 text-xs text-bs-text-secondary"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-bs-text-muted" />{item}</li>)}</ul></div></div></ContentCard>
        <ContentCard><SectionHeader title="Materiality & analysis thresholds" description="Planning assumptions used to prioritize review" actions={<button type="button" className={buttonClass}>Update thresholds</button>} /><div className="mt-3 divide-y divide-bs-border-subtle">{model.thresholds.map((item) => <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_5rem_minmax(0,1.4fr)] gap-3 py-2.5"><span className="text-xs font-medium text-bs-text-primary">{item.label}</span><span className="bs-numeric text-xs">{item.value}</span><span className="bs-metadata">{item.application}</span></div>)}</div></ContentCard>
      </div>

      <div id="diligence-areas" className="scroll-mt-4"><ContentCard><SectionHeader title="Key diligence areas" description="Workstream focus, accountable lead, and readiness" count={model.engagement.diligenceAreas.length} /><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[48rem]"><thead><tr className="border-b border-bs-border-subtle"><th className="bs-table-header px-2 py-2 text-left">Diligence area</th><th className="bs-table-header px-2 text-left">Lead</th><th className="bs-table-header px-2 text-left">Primary focus</th><th className="bs-table-header px-2 text-left">Status</th></tr></thead><tbody>{model.engagement.diligenceAreas.map((item) => <tr key={item.area} className="h-bs-table-row border-b border-bs-border-subtle last:border-0"><td className="px-2 text-xs font-medium text-bs-text-primary">{item.area}</td><td className="bs-table-body px-2">{item.lead}</td><td className="bs-table-body px-2">{item.focus}</td><td className="px-2"><StatusBadge tone={item.tone}>{item.status}</StatusBadge></td></tr>)}</tbody></table></div></ContentCard></div>

      <div id="team" className="grid scroll-mt-4 gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <ContentCard><SectionHeader title="Team & ownership" description="Preparers, reviewers, and workstream accountability" actions={<button type="button" className={buttonClass}><Users className="size-3.5" />Manage team</button>} /><div className="mt-2 divide-y divide-bs-border-subtle">{model.team.map((member) => <div key={member.name} className="grid grid-cols-[2rem_minmax(0,1fr)_4rem] items-center gap-3 py-2.5"><span className="flex size-7 items-center justify-center rounded-full bg-bs-primary/10 text-[9px] font-semibold text-bs-primary">{member.initials}</span><div><p className="text-xs font-medium text-bs-text-primary">{member.name} <span className="font-normal text-bs-text-muted">· {member.role}</span></p><p className="bs-metadata mt-0.5">{member.ownership}</p></div><span className="text-right text-[10px] font-medium text-bs-text-secondary">{member.capacity}</span></div>)}</div></ContentCard>
        <ContentCard><SectionHeader title="Timeline & milestones" description="Core delivery and review dates" actions={<button type="button" className={buttonClass}><CalendarDays className="size-3.5" />Edit timeline</button>} /><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[38rem]"><thead><tr className="border-b border-bs-border-subtle"><th className="bs-table-header px-2 py-2 text-left">Milestone</th><th className="bs-table-header px-2 text-left">Owner</th><th className="bs-table-header px-2 text-left">Date</th><th className="bs-table-header px-2 text-left">Status</th></tr></thead><tbody>{model.milestones.map((item) => <tr key={item.milestone} className="h-bs-table-row border-b border-bs-border-subtle last:border-0"><td className="px-2 text-xs font-medium text-bs-text-primary">{item.milestone}</td><td className="bs-table-body px-2">{item.owner}</td><td className="bs-table-body px-2">{item.date}</td><td className="px-2"><StatusBadge tone={item.tone}>{item.status}</StatusBadge></td></tr>)}</tbody></table></div></ContentCard>
      </div>

      <div id="risks" className="grid scroll-mt-4 gap-4 xl:grid-cols-2">
        <ContentCard><SectionHeader title="Initial document requirements" description="Minimum evidence required to begin fieldwork" count={model.requirements.length} actions={<Link href={model.links.upload} className={buttonClass}><Upload className="size-3.5" />Add files</Link>} /><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[42rem]"><thead><tr className="border-b border-bs-border-subtle"><th className="bs-table-header px-2 py-2 text-left">Requirement</th><th className="bs-table-header px-2 text-left">Priority</th><th className="bs-table-header px-2 text-left">Owner</th><th className="bs-table-header px-2 text-left">Status</th></tr></thead><tbody>{model.requirements.map((item) => <tr key={item.item} className="h-bs-table-row border-b border-bs-border-subtle last:border-0"><td className="px-2"><p className="text-xs font-medium text-bs-text-primary">{item.item}</p><p className="text-[9px] text-bs-text-muted">{item.category}</p></td><td className="bs-table-body px-2">{item.priority}</td><td className="bs-table-body px-2">{item.owner}</td><td className="px-2"><StatusBadge tone={item.tone}>{item.status}</StatusBadge></td></tr>)}</tbody></table></div></ContentCard>
        <ContentCard><SectionHeader title="Risks & open questions" description="Planning hypotheses requiring diligence attention" count={model.risks.length} actions={<button type="button" className={buttonClass}><AlertTriangle className="size-3.5" />Log risk</button>} /><div className="mt-2 divide-y divide-bs-border-subtle">{model.risks.map((risk) => <div key={risk.title} className="py-3"><div className="flex items-center gap-2"><p className="text-xs font-medium text-bs-text-primary">{risk.title}</p><StatusBadge tone={risk.tone}>{risk.severity}</StatusBadge><span className="ml-auto text-[10px] text-bs-text-muted">{risk.owner}</span></div><p className="bs-metadata mt-1">{risk.rationale}</p><p className="mt-1 text-[10px] font-medium text-bs-text-secondary">Status: {risk.status}</p></div>)}</div></ContentCard>
      </div>

      <div id="files" className="grid scroll-mt-4 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
        <ContentCard><SectionHeader title="Workpapers & uploaded templates" description="The team’s own files remain the analytical source of truth" count={model.workpapers.length} actions={<Link href={model.links.upload} className={buttonClass}><Paperclip className="size-3.5" />Upload template</Link>} /><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[42rem]"><thead><tr className="border-b border-bs-border-subtle"><th className="bs-table-header px-2 py-2 text-left">File</th><th className="bs-table-header px-2 text-left">Type</th><th className="bs-table-header px-2 text-left">Owner</th><th className="bs-table-header px-2 text-left">Updated</th><th className="bs-table-header px-2 text-left">Status</th></tr></thead><tbody>{model.workpapers.map((file) => <tr key={file.name} className="h-bs-table-row border-b border-bs-border-subtle last:border-0"><td className="px-2"><span className="flex items-center gap-2 text-xs font-medium text-bs-primary"><FileSpreadsheet className="size-3.5" />{file.name}</span><span className="ml-5 text-[9px] text-bs-text-muted">{file.source}</span></td><td className="bs-table-body px-2">{file.type}</td><td className="bs-table-body px-2">{file.owner}</td><td className="bs-table-body px-2">{file.updated}</td><td className="px-2"><StatusBadge tone={file.status === "Ready" || file.status === "Available" ? "success" : "informational"}>{file.status}</StatusBadge></td></tr>)}</tbody></table></div></ContentCard>
        <ContentCard><SectionHeader title="File governance" description="Broadstone coordinates the workflow around existing models" /><ul className="mt-3 space-y-3">{["Client and firm templates remain downloadable in their native format.", "Ownership and review status are tracked separately from file contents.", "Versions, supporting documents, issues, and approvals stay linked to the workpaper."].map((item) => <li key={item} className="flex gap-2 text-xs leading-5 text-bs-text-secondary"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-bs-success" />{item}</li>)}</ul></ContentCard>
      </div>

      <div id="review" className="grid scroll-mt-4 gap-4 xl:grid-cols-2">
        <ContentCard><SectionHeader title="Review & approval status" description="Formal gates before Phase 1 is closed" /><div className="mt-2 divide-y divide-bs-border-subtle">{model.approval.map((item) => <div key={item.step} className="grid grid-cols-[minmax(0,1fr)_minmax(7rem,0.6fr)_auto] items-center gap-3 py-3"><div><p className="text-xs font-medium text-bs-text-primary">{item.step}</p><p className="bs-metadata">{item.reviewer}</p></div><StatusBadge tone={item.tone}>{item.status}</StatusBadge><span className="text-[10px] text-bs-text-muted">{item.date}</span></div>)}</div></ContentCard>
        <ContentCard><SectionHeader title="Comments & activity" description="Recent planning decisions and audit history" actions={<button type="button" className={buttonClass}><MessageSquareText className="size-3.5" />Add comment</button>} /><div className="mt-2 divide-y divide-bs-border-subtle">{model.activity.map((item) => <div key={item.title} className="py-3"><div className="flex items-start gap-2"><span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-bs-page text-[9px] font-semibold text-bs-text-secondary">{item.actor.split(" ").map((part) => part[0]).join("")}</span><div className="min-w-0"><p className="text-xs font-medium text-bs-text-primary">{item.title}</p><p className="bs-metadata mt-0.5">{item.detail}</p><p className="mt-1 text-[9px] text-bs-text-muted">{item.actor} · {item.timestamp}</p></div></div></div>)}</div></ContentCard>
      </div>
    </div>

    {editor === "overview" ? <EditorDialog title="Edit engagement overview" description="Define the engagement mandate and accountable reviewers." onCancel={() => setEditor(null)} onSave={() => saveDraft("Engagement overview updated", "Objective, deal overview, leadership, and target draft were updated.")}>
      <FieldLabel>Engagement objective<textarea className={`${inputClass} min-h-24`} value={draft.engagement.objective} onChange={(event) => setDraft({ ...draft, engagement: { ...draft.engagement, objective: event.target.value } })} /></FieldLabel>
      <FieldLabel>Deal overview<textarea className={`${inputClass} min-h-24`} value={draft.engagement.dealOverview} onChange={(event) => setDraft({ ...draft, engagement: { ...draft.engagement, dealOverview: event.target.value } })} /></FieldLabel>
      <div className="grid gap-4 sm:grid-cols-3"><FieldLabel>Engagement lead<select className={inputClass} value={draft.team[0]?.name} onChange={(event) => { const index = draft.team.findIndex((member) => member.name === event.target.value); if (index > 0) { const team = [...draft.team]; [team[0], team[index]] = [team[index], team[0]]; setDraft({ ...draft, team }); } }}>{draft.team.map((member) => <option key={member.name}>{member.name}</option>)}</select></FieldLabel><FieldLabel>Executive reviewer<select className={inputClass} value={draft.team[3]?.name} onChange={(event) => { const index = draft.team.findIndex((member) => member.name === event.target.value); if (index >= 0 && index !== 3) { const team = [...draft.team]; [team[3], team[index]] = [team[index], team[3]]; setDraft({ ...draft, team }); } }}>{draft.team.map((member) => <option key={member.name}>{member.name}</option>)}</select></FieldLabel><FieldLabel>Target draft<input className={inputClass} type="date" value={draft.engagement.targetDraft} onInput={(event) => setDraft({ ...draft, engagement: { ...draft.engagement, targetDraft: event.currentTarget.value } })} onChange={(event) => setDraft({ ...draft, engagement: { ...draft.engagement, targetDraft: event.target.value } })} /></FieldLabel></div>
    </EditorDialog> : null}

    {editor === "scope" ? <EditorDialog title="Edit scope & exclusions" description="Move items between scope states or add a custom diligence area. Exclusions remain explicitly recorded." onCancel={() => setEditor(null)} onSave={() => saveDraft("Engagement scope changed", "In-scope workstreams and explicit exclusions were revised.")}>
      <div className="grid gap-4 sm:grid-cols-2"><div><p className="bs-label mb-2">In scope</p><div className="space-y-2">{draft.engagement.scope.map((item) => <div key={item} className="rounded-bs-sm border border-bs-border-subtle p-2.5"><p className="text-xs text-bs-text-primary">{item}</p><div className="mt-2 flex gap-2"><button type="button" className="text-[10px] font-medium text-bs-warning" onClick={() => setDraft({ ...draft, engagement: { ...draft.engagement, scope: draft.engagement.scope.filter((value) => value !== item), outOfScope: [...draft.engagement.outOfScope, item] } })}>Move to exclusions</button><button type="button" className="text-[10px] text-bs-danger" onClick={() => setDraft({ ...draft, engagement: { ...draft.engagement, scope: draft.engagement.scope.filter((value) => value !== item) } })}>Remove</button></div></div>)}</div></div><div><p className="bs-label mb-2">Explicitly out of scope</p><div className="space-y-2">{draft.engagement.outOfScope.map((item) => <div key={item} className="rounded-bs-sm border border-bs-border-subtle bg-bs-page p-2.5"><p className="text-xs text-bs-text-secondary">{item}</p><button type="button" className="mt-2 text-[10px] font-medium text-bs-primary" onClick={() => setDraft({ ...draft, engagement: { ...draft.engagement, outOfScope: draft.engagement.outOfScope.filter((value) => value !== item), scope: [...draft.engagement.scope, item] } })}>Move into scope</button></div>)}</div></div></div>
      <div className="flex gap-2"><input className={inputClass} placeholder="Add a custom scope item" value={customScope} onChange={(event) => setCustomScope(event.target.value)} /><button type="button" className={buttonClass} onClick={() => { if (customScope.trim()) { setDraft({ ...draft, engagement: { ...draft.engagement, scope: [...draft.engagement.scope, customScope.trim()] } }); setCustomScope(""); } }}>Add in scope</button></div>
    </EditorDialog> : null}

    {editor === "thresholds" ? <EditorDialog title="Edit materiality thresholds" description="Structured thresholds can later be referenced by analysis, findings, and reporting workflows." onCancel={() => setEditor(null)} onSave={() => saveDraft("Materiality thresholds updated", "Structured threshold values and applications were revised.")}>
      <div className="space-y-3">{draft.thresholds.map((threshold, index) => <div key={`${threshold.label}-${index}`} className="grid gap-2 rounded-bs-sm border border-bs-border-subtle p-3 sm:grid-cols-[1fr_7rem_8rem]"><input aria-label="Threshold label" className={inputClass} value={threshold.label} onChange={(event) => { const thresholds = [...draft.thresholds]; thresholds[index] = { ...threshold, label: event.target.value }; setDraft({ ...draft, thresholds }); }} /><input aria-label="Threshold value" className={inputClass} value={threshold.value} onChange={(event) => { const thresholds = [...draft.thresholds]; thresholds[index] = { ...threshold, value: event.target.value }; setDraft({ ...draft, thresholds }); }} /><select aria-label="Threshold type" className={inputClass} value={threshold.type} onChange={(event) => { const thresholds = [...draft.thresholds]; thresholds[index] = { ...threshold, type: event.target.value as typeof threshold.type }; setDraft({ ...draft, thresholds }); }}>{["Currency", "Percentage", "Count", "Other"].map((type) => <option key={type}>{type}</option>)}</select><input aria-label="Threshold application" className={`${inputClass} sm:col-span-3`} value={threshold.application} onChange={(event) => { const thresholds = [...draft.thresholds]; thresholds[index] = { ...threshold, application: event.target.value }; setDraft({ ...draft, thresholds }); }} /></div>)}</div>
      <button type="button" className={buttonClass} onClick={() => setDraft({ ...draft, thresholds: [...draft.thresholds, { label: "New threshold", value: "", type: "Other", application: "" }] })}>Add threshold</button>
    </EditorDialog> : null}

    {editor === "team" ? <EditorDialog title="Manage team & ownership" description="Assign phase-level and workstream responsibilities without replacing the firm’s staffing model." onCancel={() => setEditor(null)} onSave={() => saveDraft("Ownership assignments changed", "Phase and workstream responsibilities were updated.")}>
      <div className="space-y-3">{draft.team.map((member, index) => <div key={member.name} className="grid gap-2 rounded-bs-sm border border-bs-border-subtle p-3 sm:grid-cols-[1fr_1.4fr_6rem]"><div><p className="text-xs font-medium text-bs-text-primary">{member.name}</p><p className="bs-metadata">{member.role}</p></div><input aria-label={`${member.name} ownership`} className={inputClass} value={member.ownership} onChange={(event) => { const team = [...draft.team]; team[index] = { ...member, ownership: event.target.value }; setDraft({ ...draft, team }); }} /><select aria-label={`${member.name} responsibility`} className={inputClass} value={member.capacity} onChange={(event) => { const team = [...draft.team]; team[index] = { ...member, capacity: event.target.value }; setDraft({ ...draft, team }); }}>{[member.capacity, "Preparer", "Reviewer", "Lead", "Support"].filter((value, position, values) => values.indexOf(value) === position).map((value) => <option key={value}>{value}</option>)}</select></div>)}</div>
    </EditorDialog> : null}

    {editor === "milestones" ? <EditorDialog title="Edit milestones" description="Maintain delivery dates, review gates, owners, and completion state." onCancel={() => setEditor(null)} onSave={() => saveDraft("Planning timeline updated", "Milestone dates, owners, or statuses were changed.")}>
      <div className="space-y-3">{draft.milestones.map((milestone, index) => <div key={`${milestone.milestone}-${index}`} className="grid gap-2 rounded-bs-sm border border-bs-border-subtle p-3 sm:grid-cols-[1.4fr_1fr_8rem]"><input aria-label="Milestone name" className={inputClass} value={milestone.milestone} onChange={(event) => { const milestones = [...draft.milestones]; milestones[index] = { ...milestone, milestone: event.target.value }; setDraft({ ...draft, milestones }); }} /><select aria-label="Milestone owner" className={inputClass} value={milestone.owner} onChange={(event) => { const milestones = [...draft.milestones]; milestones[index] = { ...milestone, owner: event.target.value }; setDraft({ ...draft, milestones }); }}>{draft.team.map((member) => <option key={member.name}>{member.name}</option>)}<option>Client CFO</option></select><select aria-label="Milestone status" className={inputClass} value={milestone.status} onChange={(event) => { const status = event.target.value; const milestones = [...draft.milestones]; milestones[index] = { ...milestone, status, tone: status === "Complete" ? "success" : status === "At risk" || status === "Overdue" ? "warning" : "neutral" }; setDraft({ ...draft, milestones }); }}>{["Planned", "In progress", "At risk", "Overdue", "Complete"].map((status) => <option key={status}>{status}</option>)}</select><input aria-label="Milestone date" className={`${inputClass} sm:col-span-3`} value={milestone.date} onChange={(event) => { const milestones = [...draft.milestones]; milestones[index] = { ...milestone, date: event.target.value }; setDraft({ ...draft, milestones }); }} /></div>)}</div>
      <button type="button" className={buttonClass} onClick={() => setDraft({ ...draft, milestones: [...draft.milestones, { milestone: "New review milestone", owner: draft.team[0].name, date: "Not scheduled", status: "Planned", tone: "neutral" }] })}>Add milestone</button>
    </EditorDialog> : null}

    {editor === "risk" ? <EditorDialog title="Create risk or diligence question" description="Planning items can later be promoted into the broader Issues workflow." onCancel={() => setEditor(null)} onSave={() => { if (!riskDraft.title.trim()) return; const tone: PlanningTone = riskDraft.severity === "High" || riskDraft.severity === "Critical" ? "danger" : riskDraft.severity === "Medium" ? "warning" : "neutral"; setWorkspace({ ...workspace, risks: [{ ...riskDraft, title: riskDraft.title.trim(), rationale: riskDraft.rationale.trim(), tone }, ...workspace.risks], activity: addActivity("Planning risk created", `${riskDraft.title} assigned to ${riskDraft.owner}.`) }); setEditor(null); setNotice("Planning risk created — prototype-only"); setRiskDraft({ title: "", rationale: "", owner: "Unassigned", severity: "Medium", status: "Open" }); }} saveLabel="Create item">
      <FieldLabel>Risk or question<input className={inputClass} value={riskDraft.title} onChange={(event) => setRiskDraft({ ...riskDraft, title: event.target.value })} /></FieldLabel><FieldLabel>Context and rationale<textarea className={`${inputClass} min-h-24`} value={riskDraft.rationale} onChange={(event) => setRiskDraft({ ...riskDraft, rationale: event.target.value })} /></FieldLabel><div className="grid gap-3 sm:grid-cols-3"><FieldLabel>Owner<select className={inputClass} value={riskDraft.owner} onChange={(event) => setRiskDraft({ ...riskDraft, owner: event.target.value })}><option>Unassigned</option>{workspace.team.map((member) => <option key={member.name}>{member.name}</option>)}</select></FieldLabel><FieldLabel>Priority<select className={inputClass} value={riskDraft.severity} onChange={(event) => setRiskDraft({ ...riskDraft, severity: event.target.value })}>{["Low", "Medium", "High", "Critical"].map((value) => <option key={value}>{value}</option>)}</select></FieldLabel><FieldLabel>Status<select className={inputClass} value={riskDraft.status} onChange={(event) => setRiskDraft({ ...riskDraft, status: event.target.value })}>{["Open", "Assessing", "Ready for issue", "Closed"].map((value) => <option key={value}>{value}</option>)}</select></FieldLabel></div>
    </EditorDialog> : null}

    {editor === "workpaper" ? <EditorDialog title="Attach workpaper or template" description="Register the firm’s existing Excel file in the Phase 1 workflow. Broadstone tracks ownership and review state; Excel remains the analytical workspace." onCancel={() => setEditor(null)} onSave={() => { if (!workpaperDraft.name.trim()) return; setWorkspace({ ...workspace, workpapers: [{ name: workpaperDraft.name, type: `${workpaperDraft.type} · ${workpaperDraft.workstream}`, owner: workpaperDraft.owner, updated: "Just now", status: "Working", source: "Session attachment · v1" }, ...workspace.workpapers], activity: addActivity("Workpaper attached", `${workpaperDraft.name} linked to ${workpaperDraft.workstream}.`) }); setEditor(null); setNotice("Workpaper metadata attached — prototype-only; the source file was not uploaded"); }} saveLabel="Attach to phase">
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.xlsm,.csv,.docx,.pdf" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) setWorkpaperDraft({ ...workpaperDraft, name: file.name }); }} /><button type="button" className="flex w-full flex-col items-center rounded-bs-md border border-dashed border-bs-border-strong bg-bs-page px-4 py-6 text-center" onClick={() => fileInputRef.current?.click()}><Upload className="size-5 text-bs-primary" /><span className="mt-2 text-xs font-medium text-bs-text-primary">Choose an existing workpaper or template</span><span className="bs-metadata mt-1">Excel, CSV, Word, or PDF · file contents remain unchanged</span></button>
      <div className="grid gap-3 sm:grid-cols-2"><FieldLabel>File name<input className={inputClass} value={workpaperDraft.name} onChange={(event) => setWorkpaperDraft({ ...workpaperDraft, name: event.target.value })} /></FieldLabel><FieldLabel>File type<select className={inputClass} value={workpaperDraft.type} onChange={(event) => setWorkpaperDraft({ ...workpaperDraft, type: event.target.value })}>{["Excel workpaper", "Firm template", "Client template", "Planning memo"].map((value) => <option key={value}>{value}</option>)}</select></FieldLabel><FieldLabel>Owner<select className={inputClass} value={workpaperDraft.owner} onChange={(event) => setWorkpaperDraft({ ...workpaperDraft, owner: event.target.value })}>{workspace.team.map((member) => <option key={member.name}>{member.name}</option>)}</select></FieldLabel><FieldLabel>Related workstream<select className={inputClass} value={workpaperDraft.workstream} onChange={(event) => setWorkpaperDraft({ ...workpaperDraft, workstream: event.target.value })}>{workspace.engagement.diligenceAreas.map((area) => <option key={area.area}>{area.area}</option>)}</select></FieldLabel></div>
    </EditorDialog> : null}

    {editor === "comment" ? <EditorDialog title="Add planning comment" description="Comments are included in the Phase 1 activity trail for the current session." onCancel={() => setEditor(null)} onSave={() => { if (!commentDraft.trim()) return; setWorkspace({ ...workspace, activity: [{ title: "Planning comment added", detail: commentDraft.trim(), actor: "Preview User", timestamp: "Just now" }, ...workspace.activity] }); setEditor(null); setCommentDraft(""); setNotice("Comment added — prototype-only"); }} saveLabel="Add comment"><FieldLabel>Comment<textarea autoFocus className={`${inputClass} min-h-28`} value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} /></FieldLabel></EditorDialog> : null}

    {submissionOpen ? <EditorDialog title="Submit Phase 1 for approval" description="Broadstone checks planning prerequisites before transitioning the phase from analyst preparation to reviewer approval." onCancel={() => setSubmissionOpen(false)} onSave={() => { if (prerequisites.length > 0) return; const approval = workspace.approval.map((item, index) => index === 1 ? { ...item, status: "In review", date: "Submitted just now", tone: "informational" as PlanningTone } : item); setWorkspace({ ...workspace, status: "In review", statusTone: "warning", approval, activity: addActivity("Phase submitted for approval", "Planning package submitted to the executive reviewer.") }); setSubmissionOpen(false); setNotice("Phase 1 submitted to reviewer — prototype-only"); }} saveLabel={prerequisites.length > 0 ? "Complete prerequisites first" : "Submit to reviewer"}>
      {prerequisites.length > 0 ? <div className="rounded-bs-md border border-bs-warning/20 bg-bs-warning/5 p-4"><div className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-bs-warning" /><div><p className="text-xs font-semibold text-bs-text-primary">{prerequisites.length} prerequisites are incomplete</p><p className="bs-metadata mt-1">Resolve these controls before the phase can enter reviewer approval.</p></div></div><ul className="mt-3 space-y-2">{workspace.checklist.filter((item) => item.status !== "Complete").map((item) => <li key={item.id} className="flex items-center justify-between gap-3 rounded-bs-sm bg-bs-surface px-3 py-2 text-xs text-bs-text-secondary"><span>{item.task}</span><button type="button" className="shrink-0 text-[10px] font-medium text-bs-primary" onClick={() => cycleChecklist(item)}>Advance status</button></li>)}</ul></div> : <div className="rounded-bs-md border border-bs-success/20 bg-bs-success/5 p-4"><p className="text-xs font-semibold text-bs-success">Ready for reviewer submission</p><p className="bs-metadata mt-1">The phase will move to In review and the executive reviewer will become the active approver.</p></div>}
    </EditorDialog> : null}
  </div>;
}
