import type { Phase5FindingProjection } from "@/features/findings/findings-workflow";
import {
  REPORT_SECTION_DEFINITIONS,
  deriveReportingReadiness,
  type ReportingReadinessState
} from "@/features/reporting/reporting-workflow";
import type { DashboardData } from "@/lib/types";
import { buildDealShellViewModel, type DealShellViewModel } from "@/lib/view-models/deal-shell";
import {
  mapReportingLinks,
  mapReportingSections,
  type ReportingWorkflow
} from "@/services/supabase/phase5-reporting";

export type ReportingPageViewModel = {
  mode: "uninitialized" | "persisted" | "schema_unavailable";
  companyId: string;
  shell: DealShellViewModel;
  phase: { id: string; status: string; version: number } | null;
  report: { id: string; title: string; version: number; ownerName: string | null; reviewerName: string | null } | null;
  phase4Complete: boolean;
  readiness: {
    state: ReportingReadinessState;
    blockers: string[];
    completionPercent: number;
    completeSections: number;
    totalSections: number;
    staleLinkCount: number;
  };
  metrics: Array<{ label: string; value: string; available: boolean }>;
  bridge: {
    available: boolean;
    canonicalEbitda: string;
    acceptedAddBacks: string;
    adjustedEbitda: string;
    warnings: string[];
  };
  sections: Array<{
    id: string | null;
    sectionKey: string;
    title: string;
    sortOrder: number;
    status: "not_started" | "in_progress" | "complete";
    narrative: string;
    completionBasis: "narrative" | "authoritative" | "unavailable" | null;
    unavailableReason: string;
    version: number;
    linkedFindings: Array<Phase5FindingProjection & { stale: boolean; expectedApprovedVersion: number }>;
    missingLinkedFindings: Array<{ issueId: string; expectedApprovedVersion: number }>;
  }>;
  findings: Phase5FindingProjection[];
  staleLinks: Array<{ sectionId: string; issueId: string; reason: string; expectedVersion: number; currentVersion: number | null }>;
  limitations: string[];
  activity: Array<{ id: string; eventType: string; actor: string; createdAt: string }>;
};

function currency(value: number | null | undefined, code: string) {
  return value === null || value === undefined
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: code, maximumFractionDigits: 0 }).format(value);
}

export function buildReportingPageViewModel(params: {
  data: DashboardData;
  workflow: ReportingWorkflow | null;
  phase4Complete: boolean;
  findings: Phase5FindingProjection[];
  schemaUnavailable?: boolean;
}): ReportingPageViewModel {
  if (!params.data.company) throw new Error("Company is required.");
  const { data, workflow, findings } = params;
  const company = params.data.company;
  const storedSections = workflow ? mapReportingSections(workflow.sections) : [];
  const links = workflow ? mapReportingLinks(workflow.links) : [];
  const financialSourceAvailable = Boolean(data.snapshot.periodId && (data.snapshot.ebitda !== null || data.snapshot.adjustedEbitda !== null));
  const readiness = deriveReportingReadiness({
    initialized: Boolean(workflow?.report),
    phase4Complete: params.phase4Complete,
    sections: storedSections,
    links,
    findings,
    financialSourceAvailable
  });
  const currentById = new Map(findings.map((finding) => [finding.issueId, finding]));
  const staleByKey = new Map(readiness.staleLinks.map((link) => [`${link.reportSectionId}:${link.issueId}`, link]));
  const sections = REPORT_SECTION_DEFINITIONS.map((definition) => {
    const stored = storedSections.find((section) => section.sectionKey === definition.key);
    const sectionLinks = stored ? links.filter((link) => link.reportSectionId === stored.id) : [];
    return {
      id: stored?.id ?? null,
      sectionKey: definition.key,
      title: definition.title,
      sortOrder: definition.order,
      status: stored?.status ?? "not_started" as const,
      narrative: stored?.narrative ?? "",
      completionBasis: stored?.completionBasis ?? null,
      unavailableReason: stored?.unavailableReason ?? "",
      version: stored?.version ?? 0,
      linkedFindings: sectionLinks.flatMap((link) => {
        const finding = currentById.get(link.issueId);
        if (!finding) return [];
        return [{
          ...finding,
          stale: staleByKey.has(`${link.reportSectionId}:${link.issueId}`),
          expectedApprovedVersion: link.expectedApprovedVersion
        }];
      }),
      missingLinkedFindings: sectionLinks
        .filter((link) => !currentById.has(link.issueId))
        .map((link) => ({ issueId: link.issueId, expectedApprovedVersion: link.expectedApprovedVersion }))
    };
  });
  const limitations = [
    ...data.readiness.blockingReasons,
    ...data.readiness.cautionReasons,
    ...data.reconciliation.issues.map((issue) => issue.message),
    ...(!financialSourceAvailable ? ["Canonical financial outputs are unavailable for the current reporting period."] : []),
    ...(!params.phase4Complete ? ["Phase 4 is not complete; projected findings cannot be treated as final report content."] : [])
  ].filter((value, index, all) => value && all.indexOf(value) === index);

  return {
    mode: params.schemaUnavailable ? "schema_unavailable" : workflow?.report ? "persisted" : "uninitialized",
    companyId: company.id,
    shell: buildDealShellViewModel({
      company,
      requestedSection: "reporting",
      context: "reporting",
      progressPercent: readiness.completionPercent,
      progressLabel: "Reporting composition completion",
      progressIsPreview: false
    }),
    phase: workflow ? {
      id: String(workflow.phase.id),
      status: String(workflow.phase.status),
      version: Number(workflow.phase.version)
    } : null,
    report: workflow?.report ? {
      id: workflow.report.id,
      title: workflow.report.title,
      version: workflow.report.version,
      ownerName: workflow.report.owner_name,
      reviewerName: workflow.report.reviewer_name
    } : null,
    phase4Complete: params.phase4Complete,
    readiness: {
      state: readiness.state,
      blockers: readiness.blockers,
      completionPercent: readiness.completionPercent,
      completeSections: readiness.completeSections,
      totalSections: readiness.totalSections,
      staleLinkCount: readiness.staleLinks.length
    },
    metrics: [
      { label: "Revenue", value: currency(data.snapshot.revenue, company.base_currency), available: data.snapshot.revenue !== null },
      { label: "Canonical EBITDA", value: currency(data.snapshot.ebitda, company.base_currency), available: data.snapshot.ebitda !== null },
      { label: "Adjusted EBITDA", value: currency(data.snapshot.adjustedEbitda, company.base_currency), available: data.snapshot.adjustedEbitda !== null },
      { label: "Reporting period", value: data.snapshot.periodId ? data.snapshot.label : "Unavailable", available: Boolean(data.snapshot.periodId) },
      { label: "Reconciliation", value: data.reconciliation.label, available: true }
    ],
    bridge: {
      available: Boolean(data.ebitdaBridge),
      canonicalEbitda: currency(data.ebitdaBridge?.canonicalEbitda, company.base_currency),
      acceptedAddBacks: currency(data.ebitdaBridge?.addBackTotal, company.base_currency),
      adjustedEbitda: currency(data.ebitdaBridge?.adjustedEbitda, company.base_currency),
      warnings: [...(data.ebitdaBridge?.warnings ?? []), ...(data.ebitdaBridge?.invalidReasons ?? [])]
    },
    sections,
    findings,
    staleLinks: readiness.staleLinks.map((link) => ({
      sectionId: link.reportSectionId,
      issueId: link.issueId,
      reason: link.reason,
      expectedVersion: link.expectedApprovedVersion,
      currentVersion: link.currentApprovedVersion
    })),
    limitations,
    activity: (workflow?.activity ?? []).map((item) => ({
      id: String(item.id), eventType: String(item.event_type), actor: String(item.actor_name), createdAt: String(item.created_at)
    }))
  };
}
