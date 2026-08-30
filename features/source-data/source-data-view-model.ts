import { DEFAULT_UNDERWRITING_INPUTS } from "../../lib/deal-derived-context.ts";
import { buildDealState, type DealState } from "../../lib/deal-state.ts";
import { buildUnderwritingAnalysis } from "../../lib/underwriting/analysis.ts";
import { buildDealShellViewModel, type DealShellViewModel } from "../../lib/view-models/deal-shell.ts";
import type { DashboardData, DiligenceIssue } from "../../lib/types.ts";

export type SourceIssueSupport = {
  status: "backed" | "partial" | "unbacked";
  detail: string;
  documents?: string[];
};

export type SourceDataPageViewModel =
  | {
      kind: "empty";
      title: "Source Data";
      description: string;
    }
  | {
      kind: "deal";
      title: "Source Data";
      description: string;
      companyId: string;
      companyName: string;
      periodLabel: string;
      shell: DealShellViewModel;
      workspaceData: DashboardData;
      mappingCoveragePercent: number;
      missingDocumentCount: number;
      outstandingIssueCount: number;
      sourceIssues: DiligenceIssue[];
      issueSupport: Record<string, SourceIssueSupport>;
      sourceActions: DealState["actions"];
      sourceIssuesForActions: DealState["issues"];
      completeness: number;
      trustScore: number;
      financialsHref: string;
      dataReviewHref: string;
    };

function getOpenSourceIssues(data: DashboardData) {
  return data.diligenceIssues.filter(
    (issue) =>
      (issue.status === "open" || issue.status === "in_review") &&
      (issue.period_id === null || issue.period_id === data.snapshot.periodId) &&
      (issue.linked_page === "source_data" ||
        issue.category === "source_data" ||
        issue.category === "reconciliation" ||
        issue.category === "tax")
  );
}

function buildIssueSupport(
  data: DashboardData,
  issues: DiligenceIssue[]
): Record<string, SourceIssueSupport> {
  return Object.fromEntries(
    issues.map((issue) => {
      const requirement =
        data.backing.sourceRequirements.find(
          (item) => item.id === issue.linked_field
        ) ??
        data.backing.sourceRequirements.find((item) =>
          issue.issue_code === "missing_income_statement"
            ? item.id === "income_statement"
            : issue.issue_code === "missing_balance_sheet"
              ? item.id === "balance_sheet"
              : false
        );

      if (!requirement) {
        return [
          issue.id,
          {
            status: "unbacked" as const,
            detail: "Support: No supporting documents linked."
          }
        ] as const;
      }

      return [
        issue.id,
        {
          status: requirement.status,
          detail:
            requirement.linkedDocuments.length > 0
              ? "Supporting documents linked."
              : requirement.missingReason ??
                "Support: No supporting documents linked.",
          documents: requirement.linkedDocuments.map(
            (document) =>
              document.name ?? document.source_file_name ?? "Document"
          )
        }
      ] as const;
    })
  );
}

function deriveDealState(data: DashboardData) {
  const underwritingAnalysis = buildUnderwritingAnalysis({
    snapshot: data.snapshot,
    entries: data.entries,
    dataQuality: data.dataQuality,
    taxSourceStatus: data.taxSourceStatus,
    reconciliation: data.reconciliation,
    readiness: data.readiness,
    underwritingInputs: DEFAULT_UNDERWRITING_INPUTS,
    ebitdaBasis: "adjusted"
  });

  return buildDealState(data.snapshot, {
    completionSummary: data.completionSummary,
    dataQuality: data.dataQuality,
    reconciliation: data.reconciliation,
    creditScenario: underwritingAnalysis.creditScenario
  });
}

export function buildSourceDataPageViewModel(
  data: DashboardData,
  options?: { dealState?: DealState }
): SourceDataPageViewModel {
  if (!data.company) {
    return {
      kind: "empty",
      title: "Source Data",
      description:
        "Create a deal before uploading and mapping a source package."
    };
  }

  const dealState = options?.dealState ?? deriveDealState(data);
  const sourceActions = dealState.actions.filter(
    (action) => action.location === "source"
  );
  const sourceIssueIds = new Set(sourceActions.map((action) => action.issueId));
  const sourceIssuesForActions = dealState.issues.filter((issue) =>
    sourceIssueIds.has(issue.id)
  );
  const sourceIssues = getOpenSourceIssues(data);
  const companyId = data.company.id;

  return {
    kind: "deal",
    title: "Source Data",
    description: `${data.company.name} · ingestion, mapping, source support, and reconciliation.`,
    companyId,
    companyName: data.company.name,
    periodLabel: data.snapshot.label || "No reporting period loaded",
    shell: buildDealShellViewModel({
      company: data.company,
      requestedSection: "source-data",
      context: "source-data",
      progressPercent: data.completionSummary.completionPercent,
      progressLabel: "Source readiness",
      progressIsPreview: false
    }),
    workspaceData: data,
    mappingCoveragePercent: Math.round(
      data.dataQuality.mappingCoveragePercent
    ),
    missingDocumentCount: data.backing.sourceRequirements.filter(
      (row) => row.status === "unbacked"
    ).length,
    outstandingIssueCount: sourceIssues.length,
    sourceIssues,
    issueSupport: buildIssueSupport(data, sourceIssues),
    sourceActions,
    sourceIssuesForActions,
    completeness: dealState.completeness,
    trustScore: dealState.trustScore,
    financialsHref: `/financials?companyId=${companyId}`,
    dataReviewHref: `/deal/${companyId}/phases/data-review`
  };
}
