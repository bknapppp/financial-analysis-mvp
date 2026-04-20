import { groupDiligenceIssues } from "./diligence-issue-groups.ts";
import type {
  DiligenceIssue,
  DiligenceIssueGroup,
  DiligenceIssueGroupKey,
  DiligenceReadiness,
  DiligenceReadinessState
} from "./types.ts";

const READINESS_LABELS = {
  not_ready: "Not Ready",
  needs_validation: "Needs Validation",
  under_review: "Under Review",
  structurally_ready: "Structurally Ready",
  ready_for_ic: "Ready for IC",
  ready_for_lender: "Ready for Lender",
  completed: "Completed"
} as const;

const READINESS_PRIORITY = {
  not_ready: 0,
  needs_validation: 1,
  under_review: 2,
  structurally_ready: 3,
  ready_for_ic: 4,
  ready_for_lender: 5,
  completed: 6
} as const;

const GROUP_RELEVANCE_ORDER: Record<DiligenceReadinessState, DiligenceIssueGroupKey[]> = {
  not_ready: ["source_data", "financial_validation", "reconciliation", "underwriting", "credit", "adjustments", "tax", "other"],
  needs_validation: ["financial_validation", "reconciliation", "source_data", "underwriting", "credit", "adjustments", "tax", "other"],
  under_review: ["underwriting", "credit", "adjustments", "reconciliation", "financial_validation", "source_data", "tax", "other"],
  structurally_ready: [],
  ready_for_ic: [],
  ready_for_lender: [],
  completed: []
};

function hasIssueCode(issues: DiligenceIssue[], issueCode: DiligenceIssue["issue_code"]) {
  return issues.some((issue) => issue.issue_code === issueCode);
}

function getGroup(groups: DiligenceIssueGroup[], groupKey: DiligenceIssueGroupKey) {
  return groups.find((group) => group.groupKey === groupKey) ?? null;
}

function hasAnyGroup(groups: DiligenceIssueGroup[], groupKeys: DiligenceIssueGroupKey[]) {
  return groupKeys.some((groupKey) => getGroup(groups, groupKey)?.issueCount);
}

function hasHighOrCritical(groups: DiligenceIssueGroup[], groupKeys: DiligenceIssueGroupKey[]) {
  return groupKeys.some((groupKey) => {
    const group = getGroup(groups, groupKey);
    return Boolean(group && (group.criticalCount > 0 || group.highCount > 0));
  });
}

function countBySeverity(issues: DiligenceIssue[]) {
  return issues.reduce(
    (totals, issue) => {
      totals[issue.severity] += 1;
      return totals;
    },
    { low: 0, medium: 0, high: 0, critical: 0 }
  );
}

function buildBaseReadiness(params: {
  state: DiligenceReadinessState;
  readinessReason: string;
  groups: DiligenceIssueGroup[];
  activeIssues: DiligenceIssue[];
  criticalIssueCount: number;
  highIssueCount: number;
}) {
  const groupOrder = GROUP_RELEVANCE_ORDER[params.state];
  const blockerGroups =
    groupOrder.length === 0
      ? []
      : params.groups
          .filter((group) => group.issueCount > 0)
          .sort(
            (left, right) =>
              groupOrder.indexOf(left.groupKey) - groupOrder.indexOf(right.groupKey)
          );
  const blockerIssues = blockerGroups
    .flatMap((group) => group.orderedIssues)
    .filter((issue) => issue.status === "open" || issue.status === "in_review");
  const primaryBlockerGroup = blockerGroups[0] ?? null;
  const primaryBlockerIssue = blockerIssues[0] ?? null;

  return {
    state: params.state,
    readinessLabel: READINESS_LABELS[params.state],
    readinessReason: params.readinessReason,
    readinessPriorityRank: READINESS_PRIORITY[params.state],
    blockingGroupKey: primaryBlockerGroup?.groupKey ?? null,
    blockerGroups: blockerGroups.map((group) => group.groupKey),
    blockerGroupLabels: blockerGroups.map((group) => group.groupLabel),
    blockerIssueTitles: blockerIssues.map((issue) => issue.title),
    blockerIssueIds: blockerIssues.map((issue) => issue.id),
    blockerCount: blockerIssues.length,
    primaryBlockerGroup: primaryBlockerGroup?.groupKey ?? null,
    primaryBlockerLabel: primaryBlockerGroup?.groupLabel ?? null,
    primaryBlockerIssueTitle: primaryBlockerIssue?.title ?? null,
    primaryBlockerIssueId: primaryBlockerIssue?.id ?? null,
    activeIssueCount: params.activeIssues.length,
    criticalIssueCount: params.criticalIssueCount,
    highIssueCount: params.highIssueCount
  } satisfies DiligenceReadiness;
}

export function deriveDiligenceReadiness(params: {
  issues: DiligenceIssue[];
  isCompleted?: boolean;
}) {
  if (params.isCompleted) {
    return {
      state: "completed",
      readinessLabel: READINESS_LABELS.completed,
      readinessReason: "Deal marked completed",
      readinessPriorityRank: READINESS_PRIORITY.completed,
      blockingGroupKey: null,
      blockerGroups: [],
      blockerGroupLabels: [],
      blockerIssueTitles: [],
      blockerIssueIds: [],
      blockerCount: 0,
      primaryBlockerGroup: null,
      primaryBlockerLabel: null,
      primaryBlockerIssueTitle: null,
      primaryBlockerIssueId: null,
      activeIssueCount: 0,
      criticalIssueCount: 0,
      highIssueCount: 0
    } satisfies DiligenceReadiness;
  }

  const activeIssues = params.issues.filter(
    (issue) => issue.status === "open" || issue.status === "in_review"
  );
  const groups = groupDiligenceIssues({ issues: activeIssues });
  const severityTotals = countBySeverity(activeIssues);
  const sourceGroup = getGroup(groups, "source_data");
  const validationGroup = getGroup(groups, "financial_validation");
  const reconciliationGroup = getGroup(groups, "reconciliation");
  const underwritingGroup = getGroup(groups, "underwriting");
  const creditGroup = getGroup(groups, "credit");
  const adjustmentsGroup = getGroup(groups, "adjustments");

  if (
    hasHighOrCritical(groups, ["source_data", "financial_validation", "reconciliation"]) ||
    hasIssueCode(activeIssues, "missing_revenue") ||
    hasIssueCode(activeIssues, "missing_cogs") ||
    hasIssueCode(activeIssues, "required_mappings_incomplete") ||
    hasIssueCode(activeIssues, "ebitda_basis_unavailable")
  ) {
    return buildBaseReadiness({
      state: "not_ready",
      readinessReason:
        sourceGroup?.issueCount &&
        (hasIssueCode(activeIssues, "missing_revenue") ||
          hasIssueCode(activeIssues, "missing_cogs") ||
          sourceGroup.criticalCount > 0)
          ? "Critical source-data issues remain open"
          : validationGroup?.criticalCount
            ? "Critical financial validation issues remain open"
            : reconciliationGroup?.issueCount
              ? "Reconciliation issues prevent a reliable diligence basis"
              : "Core financial structure remains incomplete",
      groups: groups.filter((group) =>
        ["source_data", "financial_validation", "reconciliation", "underwriting", "credit"].includes(group.groupKey)
      ),
      activeIssues,
      criticalIssueCount: severityTotals.critical,
      highIssueCount: severityTotals.high
    });
  }

  if (
    severityTotals.high > 0 ||
    reconciliationGroup?.issueCount ||
    validationGroup?.issueCount ||
    hasIssueCode(activeIssues, "adjusted_ebitda_unavailable")
  ) {
    return buildBaseReadiness({
      state: "needs_validation",
      readinessReason: hasIssueCode(activeIssues, "adjusted_ebitda_unavailable")
        ? "Adjusted EBITDA remains unavailable"
        : reconciliationGroup?.issueCount
          ? "Reconciliation issues remain open"
          : "Material validation issues remain open",
      groups: groups.filter((group) =>
        ["financial_validation", "reconciliation", "source_data", "underwriting"].includes(group.groupKey)
      ),
      activeIssues,
      criticalIssueCount: severityTotals.critical,
      highIssueCount: severityTotals.high
    });
  }

  if (hasAnyGroup(groups, ["underwriting", "credit", "adjustments"])) {
    return buildBaseReadiness({
      state: "under_review",
      readinessReason: creditGroup?.issueCount
        ? "Underwriting and credit issues remain open"
        : adjustmentsGroup?.issueCount
          ? "Adjustment review remains open"
          : underwritingGroup?.issueCount
            ? "Underwriting issues remain open"
            : "Underwriting structure remains under review",
      groups: groups.filter((group) =>
        ["underwriting", "credit", "adjustments"].includes(group.groupKey)
      ),
      activeIssues,
      criticalIssueCount: severityTotals.critical,
      highIssueCount: severityTotals.high
    });
  }

  if (activeIssues.length === 0) {
    return {
      state: "ready_for_lender",
      readinessLabel: READINESS_LABELS.ready_for_lender,
      readinessReason: "Core financial and credit outputs are available",
      readinessPriorityRank: READINESS_PRIORITY.ready_for_lender,
      blockingGroupKey: null,
      blockerGroups: [],
      blockerGroupLabels: [],
      blockerIssueTitles: [],
      blockerIssueIds: [],
      blockerCount: 0,
      primaryBlockerGroup: null,
      primaryBlockerLabel: null,
      primaryBlockerIssueTitle: null,
      primaryBlockerIssueId: null,
      activeIssueCount: 0,
      criticalIssueCount: 0,
      highIssueCount: 0
    } satisfies DiligenceReadiness;
  }

  if (severityTotals.medium === 0 && severityTotals.low > 0) {
    return {
      state: "ready_for_ic",
      readinessLabel: READINESS_LABELS.ready_for_ic,
      readinessReason: "Only minor diligence issues remain",
      readinessPriorityRank: READINESS_PRIORITY.ready_for_ic,
      blockingGroupKey: null,
      blockerGroups: [],
      blockerGroupLabels: [],
      blockerIssueTitles: [],
      blockerIssueIds: [],
      blockerCount: 0,
      primaryBlockerGroup: null,
      primaryBlockerLabel: null,
      primaryBlockerIssueTitle: null,
      primaryBlockerIssueId: null,
      activeIssueCount: activeIssues.length,
      criticalIssueCount: severityTotals.critical,
      highIssueCount: severityTotals.high
    } satisfies DiligenceReadiness;
  }

  return {
    state: "structurally_ready",
    readinessLabel: READINESS_LABELS.structurally_ready,
    readinessReason: "Core financial and underwriting structure is in place",
    readinessPriorityRank: READINESS_PRIORITY.structurally_ready,
    blockingGroupKey: null,
    blockerGroups: [],
    blockerGroupLabels: [],
    blockerIssueTitles: [],
    blockerIssueIds: [],
    blockerCount: 0,
    primaryBlockerGroup: null,
    primaryBlockerLabel: null,
    primaryBlockerIssueTitle: null,
    primaryBlockerIssueId: null,
    activeIssueCount: activeIssues.length,
    criticalIssueCount: severityTotals.critical,
    highIssueCount: severityTotals.high
  } satisfies DiligenceReadiness;
}
