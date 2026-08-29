"use client";

import Link from "next/link";
import { DealWorkspaceView } from "@/components/deal-workspace-view";
import { PageHeader } from "@/components/layout/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type { UnderwritingPageViewModel } from "@/features/underwriting/underwriting-view-model";

function readinessTone(status: string): StatusTone {
  if (status === "ready") return "success";
  if (status === "caution") return "warning";
  if (status === "blocked") return "danger";
  return "neutral";
}

export function UnderwritingPage({ model }: { model: UnderwritingPageViewModel }) {
  const progress = model.workspaceData.completionSummary.completionPercent;

  return <>
    <PageHeader
      eyebrow="Transaction underwriting"
      title="Underwriting"
      description={`${model.companyName} · EBITDA adjustments, structure assumptions, and credit outputs.`}
      status={<StatusBadge tone={readinessTone(model.readiness.status)}>{model.readiness.label}</StatusBadge>}
      progress={<div><div className="mb-1 flex justify-between"><span className="bs-label">Underwriting readiness</span><span className="bs-metadata">{progress}%</span></div><ProgressBar value={progress} label="Underwriting readiness" /></div>}
      actions={<Link className="inline-flex min-h-8 items-center rounded-bs-sm border border-bs-border-strong bg-bs-surface px-3 text-xs font-medium text-bs-text-secondary hover:bg-bs-page" href={`/financials?companyId=${model.companyId}`}>Review Financials</Link>}
    />
    <main className="mx-auto max-w-bs-content px-4 py-5 md:px-6">
      <DealWorkspaceView data={model.workspaceData} section="underwriting" layout="canonical" />
    </main>
  </>;
}
