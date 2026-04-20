import type {
  DiligenceIssue,
  DiligenceIssueGroup,
  DiligenceIssueGroupKey,
  DiligenceIssueGroupSummary,
  DiligenceIssueStatus
} from "./types.ts";

const ACTIVE_STATUSES: DiligenceIssueStatus[] = ["open", "in_review"];

const GROUP_LABELS: Record<DiligenceIssueGroupKey, string> = {
  source_data: "Source Data",
  financial_validation: "Financial Validation",
  reconciliation: "Reconciliation",
  underwriting: "Underwriting",
  credit: "Credit",
  adjustments: "Adjustments",
  tax: "Tax",
  other: "Other"
};

const ISSUE_CODE_PRIORITY: Partial<Record<NonNullable<DiligenceIssue["issue_code"]>, number>> = {
  missing_revenue: 0,
  missing_cogs: 1,
  required_mappings_incomplete: 2,
  balance_sheet_out_of_balance: 3,
  ebitda_non_positive: 4,
  adjusted_ebitda_unavailable: 5,
  ebitda_basis_unavailable: 6,
  source_reconciliation_incomplete: 7,
  debt_sizing_outputs_unavailable: 8,
  add_back_review_incomplete: 9
};

function issuePriority(issue: DiligenceIssue) {
  const severityRank = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3
  } as const;
  const statusRank = {
    open: 0,
    in_review: 1,
    resolved: 2,
    waived: 3
  } as const;
  const issueCodeRank =
    issue.issue_code !== null && ISSUE_CODE_PRIORITY[issue.issue_code] !== undefined
      ? ISSUE_CODE_PRIORITY[issue.issue_code] as number
      : 99;

  return statusRank[issue.status] * 1000 + severityRank[issue.severity] * 100 + issueCodeRank;
}

function createdAtRank(issue: DiligenceIssue) {
  const timestamp = new Date(issue.created_at).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function compareIssues(left: DiligenceIssue, right: DiligenceIssue) {
  const priorityDifference = issuePriority(left) - issuePriority(right);
  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  const createdAtDifference = createdAtRank(left) - createdAtRank(right);
  if (createdAtDifference !== 0) {
    return createdAtDifference;
  }

  return left.title.localeCompare(right.title);
}

export function resolveDiligenceIssueGroupKey(
  issue: Pick<DiligenceIssue, "category" | "linked_page" | "issue_code">
): DiligenceIssueGroupKey {
  if (issue.category === "tax") {
    return "tax";
  }

  if (
    issue.issue_code === "add_back_review_incomplete" ||
    issue.issue_code === "adjusted_ebitda_unavailable"
  ) {
    return issue.issue_code === "add_back_review_incomplete"
      ? "adjustments"
      : "underwriting";
  }

  if (
    issue.issue_code === "ebitda_non_positive" ||
    issue.issue_code === "dscr_not_meaningful_non_positive_earnings" ||
    issue.issue_code === "debt_sizing_outputs_unavailable"
  ) {
    return "credit";
  }

  if (
    issue.issue_code === "ebitda_basis_unavailable" ||
    issue.issue_code === "underwriting_inputs_incomplete"
  ) {
    return "underwriting";
  }

  if (
    issue.issue_code === "gross_profit_reconciliation_mismatch" ||
    issue.issue_code === "ebitda_reconciliation_mismatch" ||
    issue.issue_code === "adjusted_ebitda_reconciliation_mismatch" ||
    issue.issue_code === "working_capital_reconciliation_mismatch" ||
    issue.issue_code === "source_reconciliation_incomplete" ||
    issue.category === "reconciliation"
  ) {
    return "reconciliation";
  }

  if (
    issue.issue_code === "balance_sheet_out_of_balance" ||
    issue.category === "validation" ||
    issue.category === "financials" ||
    issue.linked_page === "financials"
  ) {
    return "financial_validation";
  }

  if (
    issue.issue_code === "missing_revenue" ||
    issue.issue_code === "missing_cogs" ||
    issue.issue_code === "required_mappings_incomplete" ||
    issue.issue_code === "source_coverage_incomplete" ||
    issue.issue_code === "low_mapping_confidence" ||
    issue.category === "source_data" ||
    issue.linked_page === "source_data"
  ) {
    return "source_data";
  }

  if (issue.category === "underwriting" || issue.linked_page === "underwriting") {
    return "underwriting";
  }

  if (issue.category === "credit") {
    return "credit";
  }

  return "other";
}

export function groupDiligenceIssues(params: {
  issues: DiligenceIssue[];
  statuses?: DiligenceIssueStatus[];
}) {
  const statuses = params.statuses ?? ACTIVE_STATUSES;
  const activeStatusSet = new Set(statuses);
  const filteredIssues = params.issues.filter((issue) => activeStatusSet.has(issue.status));
  const groups = new Map<DiligenceIssueGroupKey, DiligenceIssue[]>();

  filteredIssues.forEach((issue) => {
    const groupKey = resolveDiligenceIssueGroupKey(issue);
    const current = groups.get(groupKey) ?? [];
    current.push(issue);
    groups.set(groupKey, current);
  });

  return Array.from(groups.entries())
    .map(([groupKey, issues]) => {
      const orderedIssues = [...issues].sort(compareIssues);
      const primaryIssue = orderedIssues[0] ?? null;
      const group: DiligenceIssueGroup = {
        groupKey,
        groupLabel: GROUP_LABELS[groupKey],
        issueCount: orderedIssues.length,
        criticalCount: orderedIssues.filter((issue) => issue.severity === "critical").length,
        highCount: orderedIssues.filter((issue) => issue.severity === "high").length,
        topIssueTitle: primaryIssue?.title ?? null,
        primaryIssue,
        remainingIssueCount: Math.max(orderedIssues.length - 1, 0),
        hasMoreIssues: orderedIssues.length > 1,
        orderedIssues,
        issues: orderedIssues
      };

      return group;
    })
    .sort((left, right) => {
      const leftPriority =
        (left.criticalCount > 0 ? 0 : left.highCount > 0 ? 1 : 2) * 100 - left.issueCount;
      const rightPriority =
        (right.criticalCount > 0 ? 0 : right.highCount > 0 ? 1 : 2) * 100 - right.issueCount;

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return left.groupLabel.localeCompare(right.groupLabel);
    });
}

export function summarizeDiligenceIssueGroups(groups: DiligenceIssueGroup[]): DiligenceIssueGroupSummary {
  return {
    totalGroups: groups.length,
    totalActiveIssues: groups.reduce((total, group) => total + group.issueCount, 0),
    topGroup: groups[0] ?? null,
    groups
  };
}
