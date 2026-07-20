import { getDealStageLabel } from "@/lib/deal-stage";
import { resolveDiligenceIssueActionTarget } from "@/lib/diligence-issues";
import { formatCurrency } from "@/lib/formatters";
import type { DashboardData, DiligenceIssueSeverity } from "@/lib/types";
import {
  buildDealShellViewModel,
  type DealShellViewModel
} from "@/lib/view-models/deal-shell";

export type OverviewTone =
  | "success"
  | "warning"
  | "danger"
  | "informational"
  | "neutral";

export type OverviewMetric = {
  label: string;
  value: string;
  detail: string;
  tone: OverviewTone;
  href?: string;
  available: boolean;
};

export type OverviewPhase = {
  key: "planning" | "requests" | "analysis" | "findings" | "reporting" | "close";
  number: number;
  label: string;
  statusLabel: string;
  tone: OverviewTone;
  progressPercent: number | null;
  dueDateLabel: string;
  detail: string;
  metrics: Array<{ label: string; value: string }>;
  href: string;
  implemented: boolean;
};

export type OverviewActivity = {
  id: string;
  label: string;
  detail: string;
  timestampLabel: string;
  href?: string;
  type: "document" | "issue";
};

export type OverviewAction = {
  id: string;
  label: string;
  detail: string;
  href: string;
  tone: OverviewTone;
};

export type OverviewPageViewModel = {
  shell: DealShellViewModel;
  identity: {
    title: string;
    companyName: string;
    projectId: string;
    dealType: string;
    dealStage: string;
    stageTone: OverviewTone;
    industry: string;
    baseCurrency: string;
    client: string;
    startDate: string;
    targetClose: string;
  };
  overallProgress: {
    transactionProgressPercent: number | null;
    transactionProgressReason: string;
    financialCompletionPercent: number;
    financialCompletionStatus: string;
    projectedCloseLabel: string;
    weeksRemainingLabel: string;
    currentPhaseLabel: string;
  };
  phases: OverviewPhase[];
  keyMetrics: OverviewMetric[];
  activities: OverviewActivity[];
  activityUnavailableReason: string | null;
  issueSeverity: Array<{
    severity: DiligenceIssueSeverity;
    label: string;
    count: number;
    percent: number;
    tone: OverviewTone;
  }>;
  issueTotal: number;
  teamActivityAvailable: false;
  teamActivityUnavailableReason: string;
  blockers: string[];
  nextActions: OverviewAction[];
  financialSnapshot: Array<{ label: string; value: string; available: boolean }>;
  links: {
    legacyDeal: string;
    financials: string;
    underwriting: string;
    sourceData: string;
  };
};

function formatTimestamp(value: string) {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "Timestamp unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(timestamp);
}

function stageTone(stage: DashboardData["stage"]): OverviewTone {
  if (stage === "closed") return "success";
  if (stage === "dead") return "danger";
  if (stage === "closing" || stage === "ic_ready") return "warning";
  if (stage === "diligence") return "informational";
  return "neutral";
}

function completionTone(status: DashboardData["completionSummary"]["completionStatus"]): OverviewTone {
  if (status === "ready") return "success";
  if (status === "blocked") return "danger";
  return "informational";
}

function buildActivities(data: DashboardData): OverviewActivity[] {
  const documentActivity: Array<OverviewActivity & { timestamp: string }> = data.documents
    .filter((document) => Boolean(document.uploaded_at))
    .map((document) => ({
      id: `document-${document.id}`,
      label: `Document uploaded: ${document.name ?? document.source_file_name ?? "Untitled document"}`,
      detail: document.document_type
        ? document.document_type.replaceAll("_", " ")
        : "Source document",
      timestamp: document.uploaded_at ?? "",
      timestampLabel: formatTimestamp(document.uploaded_at ?? ""),
      href: `/source-data?companyId=${data.company?.id ?? ""}`,
      type: "document"
    }));

  const issueActivity: Array<OverviewActivity & { timestamp: string }> = data.diligenceIssues.map((issue) => ({
    id: `issue-${issue.id}`,
    label: `Issue ${issue.status === "resolved" ? "resolved" : "updated"}: ${issue.title}`,
    detail: `${issue.severity} severity · ${issue.status.replaceAll("_", " ")}`,
    timestamp: issue.updated_at,
    timestampLabel: formatTimestamp(issue.updated_at),
    href: resolveDiligenceIssueActionTarget(issue).linkedRoute ?? undefined,
    type: "issue"
  }));

  return [...documentActivity, ...issueActivity]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, 6)
    .map(({ timestamp: _timestamp, ...activity }) => activity);
}

function buildPhases(data: DashboardData): OverviewPhase[] {
  const companyId = data.company?.id ?? "";
  const activeIssues = data.diligenceIssueSummary.open + data.diligenceIssueSummary.inReview;

  return [
    {
      key: "planning",
      number: 1,
      label: "Planning & Scoping",
      statusLabel: "Unavailable",
      tone: "neutral",
      progressPercent: null,
      dueDateLabel: "Not configured",
      detail: "Planning workflow is not yet modeled in the current repository.",
      metrics: [{ label: "Milestones", value: "Unavailable" }],
      href: `/deal/${companyId}/redesign-preview?section=planning`,
      implemented: false
    },
    {
      key: "requests",
      number: 2,
      label: "Information Request",
      statusLabel: "Unavailable",
      tone: "neutral",
      progressPercent: null,
      dueDateLabel: "Not configured",
      detail: "Request records and response tracking are not yet persisted.",
      metrics: [{ label: "Requests", value: "Unavailable" }],
      href: `/deal/${companyId}/redesign-preview?section=information-request`,
      implemented: false
    },
    {
      key: "analysis",
      number: 3,
      label: "Data Review & Analysis",
      statusLabel: data.completionSummary.completionStatus.replaceAll("_", " "),
      tone: completionTone(data.completionSummary.completionStatus),
      progressPercent: data.completionSummary.completionPercent,
      dueDateLabel: "Not configured",
      detail: "Financial-model completion from the existing underwriting readiness engine.",
      metrics: [
        { label: "Documents", value: String(data.documents.length) },
        { label: "Data confidence", value: data.dataQuality.confidenceLabel }
      ],
      href: `/source-data?companyId=${companyId}`,
      implemented: true
    },
    {
      key: "findings",
      number: 4,
      label: "Findings & Issues",
      statusLabel: activeIssues > 0 ? `${activeIssues} active` : "No active issues",
      tone: data.diligenceIssueSummary.criticalOpen > 0
        ? "danger"
        : activeIssues > 0
          ? "warning"
          : "success",
      progressPercent: null,
      dueDateLabel: "Not configured",
      detail: data.diligenceReadiness.readinessReason,
      metrics: [
        { label: "Open", value: String(data.diligenceIssueSummary.open) },
        { label: "In review", value: String(data.diligenceIssueSummary.inReview) }
      ],
      href: data.diligenceIssueSummary.topOpenIssue
        ? resolveDiligenceIssueActionTarget(data.diligenceIssueSummary.topOpenIssue).linkedRoute ?? `/deal/${companyId}`
        : `/deal/${companyId}`,
      implemented: true
    },
    {
      key: "reporting",
      number: 5,
      label: "Reporting",
      statusLabel: "Workflow unavailable",
      tone: "neutral",
      progressPercent: null,
      dueDateLabel: "Not configured",
      detail: "Existing exports remain available; report workflow is not yet persisted.",
      metrics: [{ label: "Report records", value: "Unavailable" }],
      href: `/deal/${companyId}`,
      implemented: false
    },
    {
      key: "close",
      number: 6,
      label: "Close & Handover",
      statusLabel: "Unavailable",
      tone: "neutral",
      progressPercent: null,
      dueDateLabel: "Not configured",
      detail: "Closing checklist and adjustment records are not yet modeled.",
      metrics: [{ label: "Closing items", value: "Unavailable" }],
      href: `/deal/${companyId}/redesign-preview?section=close`,
      implemented: false
    }
  ];
}

export function buildOverviewPageViewModel(data: DashboardData): OverviewPageViewModel | null {
  if (!data.company) {
    return null;
  }

  const company = data.company;
  const financialCompletionPercent = data.completionSummary.completionPercent;
  const activeIssueCount = data.diligenceIssueSummary.open + data.diligenceIssueSummary.inReview;
  const backing = data.backing.summary.overall;
  const activities = buildActivities(data);
  const blockerCandidates = [
    ...data.diligenceReadiness.blockerIssueTitles,
    ...data.completionSummary.blockers
  ];
  const blockers = [...new Set(blockerCandidates)].slice(0, 6);
  const topIssue = data.diligenceIssueSummary.topOpenIssue;
  const topIssueTarget = topIssue ? resolveDiligenceIssueActionTarget(topIssue) : null;
  const nextActions: OverviewAction[] = [];

  if (topIssue && topIssueTarget?.linkedRoute) {
    nextActions.push({
      id: `issue-${topIssue.id}`,
      label: topIssueTarget.actionLabel ?? "Review top issue",
      detail: topIssue.title,
      href: topIssueTarget.linkedRoute,
      tone: topIssue.severity === "critical" || topIssue.severity === "high" ? "danger" : "warning"
    });
  }

  data.completionSummary.nextActions.slice(0, 3).forEach((action, index) => {
    nextActions.push({
      id: `completion-${index}`,
      label: action,
      detail: "Required by the existing financial completion model.",
      href: `/deal/${company.id}/underwriting`,
      tone: "informational"
    });
  });

  if (backing.status !== "backed") {
    nextActions.push({
      id: "backing",
      label: "Review source backing",
      detail: backing.note ?? "Some authoritative outputs are not fully backed.",
      href: backing.href,
      tone: backing.status === "unbacked" ? "danger" : "warning"
    });
  }

  return {
    shell: buildDealShellViewModel({
      company,
      requestedSection: "overview",
      context: "overview",
      progressPercent: financialCompletionPercent,
      progressLabel: "Financial completion",
      progressIsPreview: false
    }),
    identity: {
      title: company.deal_name?.trim() || company.name,
      companyName: company.name,
      projectId: company.id,
      dealType: company.deal_type?.trim() || "Not configured",
      dealStage: getDealStageLabel(data.stage),
      stageTone: stageTone(data.stage),
      industry: company.industry ?? "Not configured",
      baseCurrency: company.base_currency,
      client: "Unavailable",
      startDate: "Unavailable",
      targetClose: "Not configured"
    },
    overallProgress: {
      transactionProgressPercent: null,
      transactionProgressReason: "Authoritative cross-phase progress is unavailable until phase workflows are persisted.",
      financialCompletionPercent,
      financialCompletionStatus: data.completionSummary.completionStatus.replaceAll("_", " "),
      projectedCloseLabel: "Not configured",
      weeksRemainingLabel: "Unavailable",
      currentPhaseLabel: "Data Review & Analysis"
    },
    phases: buildPhases(data),
    keyMetrics: [
      {
        label: "Documents",
        value: String(data.documents.length),
        detail: "Authoritative source documents",
        tone: "informational",
        href: `/source-data?companyId=${company.id}`,
        available: true
      },
      {
        label: "Requests",
        value: "Unavailable",
        detail: "Not yet modeled",
        tone: "neutral",
        available: false
      },
      {
        label: "Open Issues",
        value: String(activeIssueCount),
        detail: `${data.diligenceIssueSummary.criticalOpen} critical`,
        tone: data.diligenceIssueSummary.criticalOpen > 0 ? "danger" : activeIssueCount > 0 ? "warning" : "success",
        href: topIssueTarget?.linkedRoute ?? `/deal/${company.id}`,
        available: true
      },
      {
        label: "Tasks",
        value: "Unavailable",
        detail: "Not yet modeled",
        tone: "neutral",
        available: false
      },
      {
        label: "Q&A",
        value: "Unavailable",
        detail: "Not yet modeled",
        tone: "neutral",
        available: false
      }
    ],
    activities,
    activityUnavailableReason: activities.length === 0
      ? "No authoritative document uploads or issue updates are available."
      : null,
    issueSeverity: ([
      { severity: "critical" as const, label: "Critical", count: data.diligenceIssueSummary.bySeverity.critical, tone: "danger" as const },
      { severity: "high" as const, label: "High", count: data.diligenceIssueSummary.bySeverity.high, tone: "danger" as const },
      { severity: "medium" as const, label: "Medium", count: data.diligenceIssueSummary.bySeverity.medium, tone: "warning" as const },
      { severity: "low" as const, label: "Low", count: data.diligenceIssueSummary.bySeverity.low, tone: "success" as const }
    ]).map((item) => ({
      ...item,
      percent: data.diligenceIssueSummary.total > 0
        ? (item.count / data.diligenceIssueSummary.total) * 100
        : 0
    })),
    issueTotal: data.diligenceIssueSummary.total,
    teamActivityAvailable: false,
    teamActivityUnavailableReason: "Team workload and staffing activity are not modeled in the current repository.",
    blockers,
    nextActions: nextActions.slice(0, 5),
    financialSnapshot: [
      {
        label: "Revenue",
        value: data.snapshot.revenue === null ? "Unavailable" : formatCurrency(data.snapshot.revenue),
        available: data.snapshot.revenue !== null
      },
      {
        label: "Adjusted EBITDA",
        value: data.snapshot.adjustedEbitda === null ? "Unavailable" : formatCurrency(data.snapshot.adjustedEbitda),
        available: data.snapshot.adjustedEbitda !== null
      },
      {
        label: "Reporting period",
        value: data.snapshot.periodId ? data.snapshot.label : "Unavailable",
        available: Boolean(data.snapshot.periodId)
      },
      {
        label: "Reconciliation",
        value: data.reconciliation.label,
        available: true
      }
    ],
    links: {
      legacyDeal: `/deal/${company.id}`,
      financials: `/financials?companyId=${company.id}`,
      underwriting: `/deal/${company.id}/underwriting`,
      sourceData: `/source-data?companyId=${company.id}`
    }
  };
}
