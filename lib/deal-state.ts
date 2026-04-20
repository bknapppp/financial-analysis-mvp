import { buildFixItHref } from "@/lib/fix-it";
import type {
  CreditScenarioResult,
  DataQualityReport,
  PeriodSnapshot,
  ReconciliationReport,
  UnderwritingCompletionSection,
  UnderwritingCompletionSummary
} from "@/lib/types";

export type DealIssue = {
  id: string;
  type: "missing_data" | "reconciliation" | "credit" | "mapping";
  severity: "blocker" | "warning";
  message: string;
  location: "source" | "underwriting";
};

export type DealAction = {
  id: string;
  label: string;
  issueId: string;
  location: "source" | "underwriting";
  autoFixAvailable: boolean;
};

export type DealState = {
  completeness: number;
  trustScore: number;
  issues: DealIssue[];
  actions: DealAction[];
};

export type DealScreenerOutputs = {
  completionSummary?: Pick<UnderwritingCompletionSummary, "completionPercent" | "sections"> | null;
  dataQuality?: Pick<DataQualityReport, "confidenceScore" | "mappingBreakdown" | "missingCategories"> | null;
  reconciliation?: Pick<ReconciliationReport, "issues"> | null;
  creditScenario?: Pick<CreditScenarioResult, "adverseSignals"> | null;
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getSectionItem(
  summary: DealScreenerOutputs["completionSummary"],
  sectionKey: string,
  itemKey: string
) {
  const section = summary?.sections.find(
    (candidate) => candidate.key === sectionKey
  ) as UnderwritingCompletionSection | undefined;
  return section?.items.find((item) => item.key === itemKey);
}

function issueSeverityRank(issue: DealIssue) {
  return issue.severity === "blocker" ? 0 : 1;
}

function createAction(params: {
  id: string;
  label: string;
  issueId: string;
  location: DealAction["location"];
  autoFixAvailable: boolean;
}): DealAction {
  return {
    id: params.id,
    label: params.label,
    issueId: params.issueId,
    location: params.location,
    autoFixAvailable: params.autoFixAvailable
  };
}

export function buildDealState(
  snapshot: PeriodSnapshot | null | undefined,
  screenerOutputs: DealScreenerOutputs
): DealState {
  const issues: DealIssue[] = [];
  const actions: DealAction[] = [];
  const completionSummary = screenerOutputs.completionSummary ?? null;
  const dataQuality = screenerOutputs.dataQuality ?? null;
  const reconciliation = screenerOutputs.reconciliation ?? null;
  const creditScenario = screenerOutputs.creditScenario ?? null;
  const hasPeriod = Boolean(snapshot?.periodId);

  const cogsItem = getSectionItem(completionSummary, "financial_inputs", "cogs");
  const hasMissingCogs =
    hasPeriod &&
    (
      dataQuality?.missingCategories.includes("COGS") ||
      (cogsItem ? !cogsItem.isComplete : false)
    );

  if (hasMissingCogs) {
    issues.push({
      id: "missing-cogs",
      type: "missing_data",
      severity: "blocker",
      message: "COGS is missing for the selected period.",
      location: "source"
    });
    actions.push(
      createAction({
        id: "resolve-missing-cogs",
        label: cogsItem?.nextAction ?? "Load or map COGS for the selected period",
        issueId: "missing-cogs",
        location: "source",
        autoFixAvailable: true
      })
    );
  }

  const ebitdaMismatchIssue = reconciliation?.issues.find(
    (issue) =>
      issue.key === "ebitda_formula" || issue.key === "adjusted_ebitda_formula"
  );

  if (ebitdaMismatchIssue) {
    issues.push({
      id: "ebitda-mismatch",
      type: "reconciliation",
      severity: ebitdaMismatchIssue.severity === "critical" ? "blocker" : "warning",
      message: ebitdaMismatchIssue.message,
      location: "source"
    });
    actions.push(
      createAction({
        id: "review-ebitda-mismatch",
        label: "Review EBITDA reconciliation",
        issueId: "ebitda-mismatch",
        location: "source",
        autoFixAvailable: false
      })
    );
  }

  const hasNegativeEbitda =
    creditScenario?.adverseSignals.includes("Negative EBITDA") ||
    (snapshot?.adjustedEbitda ?? snapshot?.ebitda ?? null) !== null &&
      ((snapshot?.adjustedEbitda ?? snapshot?.ebitda ?? 0) < 0);

  if (hasPeriod && hasNegativeEbitda) {
    issues.push({
      id: "negative-ebitda",
      type: "credit",
      severity: "warning",
      message: "EBITDA is negative, so leverage and coverage should be reviewed with caution.",
      location: "underwriting"
    });
    actions.push(
      createAction({
        id: "review-negative-ebitda",
        label: "Review negative EBITDA credit case",
        issueId: "negative-ebitda",
        location: "underwriting",
        autoFixAvailable: false
      })
    );
  }

  const mappingCoverageItem = getSectionItem(
    completionSummary,
    "mapping_completeness",
    "mapping_coverage"
  );
  const unmappedRowsItem = getSectionItem(
    completionSummary,
    "mapping_completeness",
    "unmapped_rows"
  );
  const hasMissingMappings =
    hasPeriod &&
    (
      (dataQuality?.mappingBreakdown.unmapped ?? 0) > 0 ||
      (mappingCoverageItem ? !mappingCoverageItem.isComplete : false) ||
      (unmappedRowsItem ? !unmappedRowsItem.isComplete : false)
    );

  if (hasMissingMappings) {
    issues.push({
      id: "missing-mappings",
      type: "mapping",
      severity: (dataQuality?.mappingBreakdown.unmapped ?? 0) > 0 ? "blocker" : "warning",
      message:
        (dataQuality?.mappingBreakdown.unmapped ?? 0) > 0
          ? `${dataQuality?.mappingBreakdown.unmapped ?? 0} row(s) remain unmapped.`
          : "Mapping coverage still needs review before outputs are fully reliable.",
      location: "source"
    });
    actions.push(
      createAction({
        id: "resolve-missing-mappings",
        label:
          unmappedRowsItem?.nextAction ??
          mappingCoverageItem?.nextAction ??
          "Resolve the remaining unmapped rows",
        issueId: "missing-mappings",
        location: "source",
        autoFixAvailable: true
      })
    );
  }

  const blockerCount = issues.filter((issue) => issue.severity === "blocker").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const completeness = clampScore(completionSummary?.completionPercent ?? 0);
  const baseTrustScore = dataQuality?.confidenceScore ?? completionSummary?.completionPercent ?? 0;
  const trustScore = clampScore(baseTrustScore - blockerCount * 15 - warningCount * 7);

  return {
    completeness,
    trustScore,
    issues: issues.sort((left, right) => issueSeverityRank(left) - issueSeverityRank(right)),
    actions
  };
}

export function buildDealActionHref(action: DealAction, companyId: string) {
  const baseHref =
    action.location === "source"
      ? `/source-data?companyId=${companyId}`
      : `/deal/${companyId}/underwriting`;

  return buildFixItHref(action.label, baseHref);
}
