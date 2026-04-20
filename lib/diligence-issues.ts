import { buildFixItHref } from "./fix-it.ts";
import { deriveDiligenceReadiness } from "./diligence-readiness.ts";
import { getSupabaseServerClient } from "./supabase.ts";
import type { DealDerivedContext } from "./deal-derived-context.ts";
import {
  BALANCE_SHEET_VALIDATION_TOLERANCE,
  buildBalanceSheetRollup,
  buildBalanceSheetValidation
} from "../components/financials-view-rollup.ts";
import type {
  DiligenceIssue,
  DiligenceIssueActionTarget,
  DiligenceIssueCategory,
  DiligenceIssueCode,
  DiligenceIssueFeedback,
  DiligenceIssueLinkedPage,
  DiligenceIssueSeverity,
  DiligenceIssueSourceType,
  DiligenceIssueStatus,
  DiligenceIssueSummary
} from "./types.ts";

type DiligenceIssueCandidate = {
  company_id: string;
  period_id: string | null;
  source_type: DiligenceIssueSourceType;
  issue_code: DiligenceIssueCode | null;
  title: string;
  description: string;
  category: DiligenceIssueCategory;
  severity: DiligenceIssueSeverity;
  status: DiligenceIssueStatus;
  linked_page: DiligenceIssueLinkedPage;
  linked_field: string | null;
  linked_route: string | null;
  dedupe_key: string | null;
  created_by: string | null;
  owner: string | null;
};

type DiligenceIssueUpdate = Partial<
  Pick<
    DiligenceIssue,
    | "title"
    | "description"
    | "category"
    | "severity"
    | "linked_page"
    | "linked_field"
    | "linked_route"
    | "status"
    | "resolved_at"
    | "waived_at"
    | "updated_at"
  >
>;

type SyncPlan = {
  toCreate: DiligenceIssueCandidate[];
  toUpdate: Array<{ id: string; updates: DiligenceIssueUpdate }>;
};

type DiligenceIssueSyncResult = {
  issues: DiligenceIssue[];
  feedback: DiligenceIssueFeedback;
};

const DILIGENCE_ISSUE_COLUMNS = [
  "id",
  "company_id",
  "period_id",
  "source_type",
  "issue_code",
  "title",
  "description",
  "category",
  "severity",
  "status",
  "linked_page",
  "linked_field",
  "linked_route",
  "dedupe_key",
  "created_at",
  "updated_at",
  "resolved_at",
  "waived_at",
  "created_by",
  "owner"
].join(", ");

const EMPTY_ISSUE_SUMMARY: DiligenceIssueSummary = {
  total: 0,
  open: 0,
  inReview: 0,
  resolved: 0,
  waived: 0,
  criticalOpen: 0,
  bySeverity: {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0
  },
  byPage: {
    overview: 0,
    financials: 0,
    underwriting: 0,
    source_data: 0
  },
  topOpenIssue: null
};

const EMPTY_ISSUE_FEEDBACK: DiligenceIssueFeedback = {
  resolvedIssueTitles: [],
  resolvedIssueCount: 0,
  reopenedIssueTitles: [],
  reopenedIssueCount: 0,
  readinessChanged: false,
  previousReadinessLabel: null,
  currentReadinessLabel: null
};

function buildIssueRoute(params: {
  companyId: string;
  page: DiligenceIssueLinkedPage;
  actionLabel: string;
}) {
  if (params.page === "source_data") {
    return buildFixItHref(params.actionLabel, `/source-data?companyId=${params.companyId}`);
  }

  if (params.page === "underwriting") {
    return buildFixItHref(params.actionLabel, `/deal/${params.companyId}/underwriting`);
  }

  if (params.page === "financials") {
    return `/financials?companyId=${params.companyId}`;
  }

  return `/deal/${params.companyId}`;
}

function defaultActionLabelForPage(page: DiligenceIssueLinkedPage) {
  if (page === "source_data") {
    return "Open Source Data";
  }

  if (page === "financials") {
    return "Review Financials";
  }

  if (page === "underwriting") {
    return "Open Underwriting";
  }

  return "Open Overview";
}

export function resolveDiligenceIssueActionTarget(
  issue: Pick<DiligenceIssue, "linked_page" | "linked_route" | "linked_field" | "issue_code">
): DiligenceIssueActionTarget {
  let actionLabel = defaultActionLabelForPage(issue.linked_page);

  if (
    issue.issue_code === "gross_profit_reconciliation_mismatch" ||
    issue.issue_code === "ebitda_reconciliation_mismatch" ||
    issue.issue_code === "adjusted_ebitda_reconciliation_mismatch" ||
    issue.issue_code === "working_capital_reconciliation_mismatch" ||
    issue.issue_code === "source_reconciliation_incomplete"
  ) {
    actionLabel = "Review Reconciliation";
  } else if (issue.issue_code === "add_back_review_incomplete") {
    actionLabel = "Review Adjustments";
  }

  return {
    linkedPage: issue.linked_page,
    linkedRoute: issue.linked_route,
    linkedField: issue.linked_field,
    actionLabel: issue.linked_route ? actionLabel : null,
    isActionable: Boolean(issue.linked_route)
  };
}

function buildSystemIssueCandidate(params: {
  companyId: string;
  periodId: string | null;
  issueCode: DiligenceIssueCode;
  title: string;
  description: string;
  category: DiligenceIssueCategory;
  severity: DiligenceIssueSeverity;
  linkedPage: DiligenceIssueLinkedPage;
  linkedField?: string | null;
  actionLabel?: string;
}) {
  const dedupeKey = `${params.issueCode}:${params.periodId ?? "deal"}`;

  return {
    company_id: params.companyId,
    period_id: params.periodId,
    source_type: "system" as const,
    issue_code: params.issueCode,
    title: params.title,
    description: params.description,
    category: params.category,
    severity: params.severity,
    status: "open" as const,
    linked_page: params.linkedPage,
    linked_field: params.linkedField ?? null,
    linked_route: buildIssueRoute({
      companyId: params.companyId,
      page: params.linkedPage,
      actionLabel: params.actionLabel ?? params.title
    }),
    dedupe_key: dedupeKey,
    created_by: null,
    owner: null
  };
}

function issueRank(issue: Pick<DiligenceIssue, "status" | "severity">) {
  const statusRank: Record<DiligenceIssueStatus, number> = {
    open: 0,
    in_review: 1,
    resolved: 2,
    waived: 3
  };
  const severityRank: Record<DiligenceIssueSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3
  };

  return statusRank[issue.status] * 10 + severityRank[issue.severity];
}

function getCompletionItem(
  context: DealDerivedContext,
  sectionKey: string,
  itemKey: string
) {
  const section = context.completionSummary.sections.find(
    (candidate) => candidate.key === sectionKey
  );
  return section?.items.find((item) => item.key === itemKey);
}

function hasSuggestedAddBacks(context: DealDerivedContext) {
  return context.addBackReviewItems.some(
    (item) =>
      item.periodId === context.snapshot.periodId &&
      item.status === "suggested"
  );
}

export function buildSystemDiligenceIssueCandidatesForContext(
  context: DealDerivedContext
) {
  const candidates: DiligenceIssueCandidate[] = [];
  const companyId = context.company.id;
  const periodId = context.snapshot.periodId || null;

  if (!periodId) {
    return candidates;
  }

  const revenueItem = getCompletionItem(context, "financial_inputs", "revenue");
  if (
    context.dataQuality.missingCategories.includes("Revenue") ||
    revenueItem?.isComplete === false
  ) {
    candidates.push(
      buildSystemIssueCandidate({
        companyId,
        periodId,
        issueCode: "missing_revenue",
        title: "Revenue missing for selected period",
        description: "Revenue is missing for the selected period.",
        category: "source_data",
        severity: "critical",
        linkedPage: "source_data",
        linkedField: "revenue",
        actionLabel: revenueItem?.nextAction ?? "Load or map revenue for the selected period"
      })
    );
  }

  const cogsItem = getCompletionItem(context, "financial_inputs", "cogs");
  if (
    context.dataQuality.missingCategories.includes("COGS") ||
    cogsItem?.isComplete === false
  ) {
    candidates.push(
      buildSystemIssueCandidate({
        companyId,
        periodId,
        issueCode: "missing_cogs",
        title: "COGS missing for selected period",
        description: "COGS is missing for the selected period.",
        category: "source_data",
        severity: "high",
        linkedPage: "source_data",
        linkedField: "cogs",
        actionLabel: cogsItem?.nextAction ?? "Load or map COGS for the selected period"
      })
    );
  }

  const mappingCoverageItem = getCompletionItem(
    context,
    "mapping_completeness",
    "mapping_coverage"
  );
  if (
    context.dataQuality.mappingBreakdown.unmapped > 0 ||
    mappingCoverageItem?.isComplete === false
  ) {
    candidates.push(
      buildSystemIssueCandidate({
        companyId,
        periodId,
        issueCode: "required_mappings_incomplete",
        title: "Required mappings incomplete",
        description:
          context.dataQuality.mappingBreakdown.unmapped > 0
            ? `${context.dataQuality.mappingBreakdown.unmapped} row(s) remain unmapped.`
            : "Mapping coverage does not yet support reliable outputs.",
        category: "source_data",
        severity:
          mappingCoverageItem?.isBlocking || context.dataQuality.mappingCoveragePercent < 70
            ? "critical"
            : "high",
        linkedPage: "source_data",
        linkedField: "mapping_coverage",
        actionLabel:
          mappingCoverageItem?.nextAction ??
          "Improve mapping coverage before relying on underwriting outputs"
      })
    );
  }

  const lowConfidenceItem = getCompletionItem(
    context,
    "mapping_completeness",
    "low_confidence_rows"
  );
  const lowConfidenceCount = context.entries.filter(
    (entry) =>
      entry.period_id === periodId &&
      entry.confidence === "low"
  ).length;
  if (lowConfidenceCount > 0 && lowConfidenceItem?.isComplete === false) {
    candidates.push(
      buildSystemIssueCandidate({
        companyId,
        periodId,
        issueCode: "low_mapping_confidence",
        title: "Low-confidence mappings unresolved",
        description: `${lowConfidenceCount} low-confidence mapped row(s) remain in the selected period.`,
        category: "source_data",
        severity: "medium",
        linkedPage: "source_data",
        linkedField: "low_confidence_rows",
        actionLabel: lowConfidenceItem.nextAction ?? "Review the low-confidence mapped rows"
      })
    );
  }

  const financialInputsSection = context.completionSummary.sections.find(
    (section) => section.key === "financial_inputs"
  );
  if (financialInputsSection && financialInputsSection.status !== "complete") {
    candidates.push(
      buildSystemIssueCandidate({
        companyId,
        periodId,
        issueCode: "source_coverage_incomplete",
        title: "Source coverage incomplete",
        description: "Core source inputs remain incomplete for the selected period.",
        category: "source_data",
        severity: financialInputsSection.status === "blocked" ? "critical" : "medium",
        linkedPage: "source_data",
        linkedField: "source_coverage",
        actionLabel: "Review source data"
      })
    );
  }

  const balanceSheetRollup = buildBalanceSheetRollup(context.entries, periodId);
  const balanceSheetValidation = buildBalanceSheetValidation({
    entries: context.entries,
    snapshot: context.snapshot,
    rollup: balanceSheetRollup
  });
  const balanceEquationCheck = balanceSheetValidation.checks.find(
    (check) => check.key === "balance_equation"
  );

  if (
    balanceEquationCheck?.difference !== undefined &&
    Math.abs(balanceEquationCheck.difference) > BALANCE_SHEET_VALIDATION_TOLERANCE
  ) {
    candidates.push(
      buildSystemIssueCandidate({
        companyId,
        periodId,
        issueCode: "balance_sheet_out_of_balance",
        title: "Balance sheet out of balance",
        description: "Assets do not reconcile to liabilities and equity for the selected period.",
        category: "validation",
        severity: "critical",
        linkedPage: "financials",
        linkedField: "balance_sheet_validation",
        actionLabel: "Review balance sheet validation"
      })
    );
  }

  const ebitdaBasisItem = getCompletionItem(context, "financial_inputs", "ebitda_basis");
  if (ebitdaBasisItem?.isComplete === false) {
    candidates.push(
      buildSystemIssueCandidate({
        companyId,
        periodId,
        issueCode: "ebitda_basis_unavailable",
        title: "EBITDA basis unavailable",
        description: "The current financial structure does not support a complete EBITDA basis.",
        category: "financials",
        severity: "high",
        linkedPage: "financials",
        linkedField: "ebitda_basis",
        actionLabel:
          ebitdaBasisItem.nextAction ??
          "Complete the core income statement mapping needed to support EBITDA"
      })
    );
  }

  context.reconciliation.issues.forEach((issue) => {
    let issueCode: DiligenceIssueCode | null = null;
    let title = issue.metric;

    if (issue.key === "gross_profit_formula") {
      issueCode = "gross_profit_reconciliation_mismatch";
      title = "Gross profit reconciliation mismatch";
    } else if (issue.key === "ebitda_formula") {
      issueCode = "ebitda_reconciliation_mismatch";
      title = "EBITDA reconciliation mismatch";
    } else if (issue.key === "adjusted_ebitda_formula") {
      issueCode = "adjusted_ebitda_reconciliation_mismatch";
      title = "Adjusted EBITDA reconciliation mismatch";
    } else if (issue.key === "working_capital_formula") {
      issueCode = "working_capital_reconciliation_mismatch";
      title = "Working capital reconciliation mismatch";
    }

    if (!issueCode) {
      return;
    }

    candidates.push(
      buildSystemIssueCandidate({
        companyId,
        periodId,
        issueCode,
        title,
        description: issue.message,
        category: "reconciliation",
        severity: issue.severity === "critical" ? "critical" : "medium",
        linkedPage:
          issue.section === "balance_sheet" ? "financials" : "financials",
        linkedField: issue.key,
        actionLabel: "Review reconciliation"
      })
    );
  });

  if (context.taxSourceStatus.comparisonStatus !== "ready") {
    candidates.push(
      buildSystemIssueCandidate({
        companyId,
        periodId,
        issueCode: "source_reconciliation_incomplete",
        title: "Source reconciliation incomplete",
        description:
          context.taxSourceStatus.comparisonStatus === "not_loaded"
            ? "No matched tax comparison is available for the selected period."
            : "The reported versus tax comparison is not fully computable for the selected period.",
        category: "tax",
        severity:
          context.taxSourceStatus.comparisonStatus === "not_loaded" ? "medium" : "high",
        linkedPage: "source_data",
        linkedField: "tax_comparison",
        actionLabel: "Review source data"
      })
    );
  }

  const activeEbitda = context.snapshot.adjustedEbitda ?? context.snapshot.ebitda;
  if (activeEbitda !== null && activeEbitda <= 0) {
    candidates.push(
      buildSystemIssueCandidate({
        companyId,
        periodId,
        issueCode: "ebitda_non_positive",
        title: "EBITDA is non-positive",
        description: "EBITDA is non-positive for the selected period.",
        category: "credit",
        severity: "critical",
        linkedPage: "underwriting",
        linkedField: "ebitda",
        actionLabel: "Review negative EBITDA credit case"
      })
    );
  }

  if (context.snapshot.adjustedEbitda === null) {
    candidates.push(
      buildSystemIssueCandidate({
        companyId,
        periodId,
        issueCode: "adjusted_ebitda_unavailable",
        title: "Adjusted EBITDA unavailable",
        description: "Adjusted EBITDA is unavailable for the selected period.",
        category: "underwriting",
        severity: "high",
        linkedPage: "underwriting",
        linkedField: "adjusted_ebitda",
        actionLabel: "Review add-backs"
      })
    );
  }

  if (
    context.defaultCreditScenario.adverseSignals.includes(
      "Coverage not meaningful due to non-positive earnings"
    )
  ) {
    candidates.push(
      buildSystemIssueCandidate({
        companyId,
        periodId,
        issueCode: "dscr_not_meaningful_non_positive_earnings",
        title: "DSCR not meaningful with non-positive earnings",
        description: "Debt service coverage is not meaningful while earnings remain non-positive.",
        category: "credit",
        severity: "high",
        linkedPage: "underwriting",
        linkedField: "dscr",
        actionLabel: "Review negative EBITDA credit case"
      })
    );
  }

  const structureInputsSection = context.completionSummary.sections.find(
    (section) => section.key === "structure_inputs"
  );
  if (structureInputsSection && structureInputsSection.status !== "complete") {
    candidates.push(
      buildSystemIssueCandidate({
        companyId,
        periodId,
        issueCode: "underwriting_inputs_incomplete",
        title: "Underwriting inputs incomplete",
        description: "Required debt sizing inputs remain incomplete.",
        category: "underwriting",
        severity: structureInputsSection.status === "blocked" ? "high" : "medium",
        linkedPage: "underwriting",
        linkedField: "structure_inputs",
        actionLabel: "Enter loan terms"
      })
    );
  }

  if (
    context.defaultCreditScenario.metrics.debtToEbitda.status === "insufficient" ||
    context.defaultCreditScenario.metrics.dscr.status === "insufficient" ||
    context.defaultCreditScenario.metrics.ltv.status === "insufficient"
  ) {
    candidates.push(
      buildSystemIssueCandidate({
        companyId,
        periodId,
        issueCode: "debt_sizing_outputs_unavailable",
        title: "Debt sizing outputs unavailable",
        description: "Debt sizing outputs are unavailable because required assumptions or the earnings basis are incomplete.",
        category: "credit",
        severity: "high",
        linkedPage: "underwriting",
        linkedField: "credit_outputs",
        actionLabel: "Enter loan terms"
      })
    );
  }

  if (hasSuggestedAddBacks(context)) {
    candidates.push(
      buildSystemIssueCandidate({
        companyId,
        periodId,
        issueCode: "add_back_review_incomplete",
        title: "Add-back review incomplete",
        description: "Suggested add-backs remain under review for the selected period.",
        category: "underwriting",
        severity: "medium",
        linkedPage: "underwriting",
        linkedField: "add_backs",
        actionLabel: "Review add-backs"
      })
    );
  }

  return Array.from(
    new Map(candidates.map((candidate) => [candidate.dedupe_key, candidate])).values()
  );
}

export function planDiligenceIssueSync(params: {
  existingIssues: DiligenceIssue[];
  candidates: DiligenceIssueCandidate[];
  now?: string;
}): SyncPlan {
  const now = params.now ?? new Date().toISOString();
  const toCreate: DiligenceIssueCandidate[] = [];
  const toUpdate: Array<{ id: string; updates: DiligenceIssueUpdate }> = [];
  const candidateByKey = new Map(
    params.candidates
      .filter((candidate) => candidate.dedupe_key)
      .map((candidate) => [candidate.dedupe_key as string, candidate] as const)
  );
  const systemIssues = params.existingIssues.filter(
    (issue) => issue.source_type === "system"
  );

  systemIssues.forEach((issue) => {
    if (!issue.dedupe_key) {
      return;
    }

    const nextCandidate = candidateByKey.get(issue.dedupe_key);

    if (!nextCandidate) {
      if (issue.status === "open" || issue.status === "in_review") {
        toUpdate.push({
          id: issue.id,
          updates: {
            status: "resolved",
            resolved_at: now,
            updated_at: now
          }
        });
      }
      return;
    }

    candidateByKey.delete(issue.dedupe_key);

    if (issue.status === "waived") {
      toUpdate.push({
        id: issue.id,
        updates: {
          title: nextCandidate.title,
          description: nextCandidate.description,
          category: nextCandidate.category,
          severity: nextCandidate.severity,
          linked_page: nextCandidate.linked_page,
          linked_field: nextCandidate.linked_field,
          linked_route: nextCandidate.linked_route,
          updated_at: now
        }
      });
      return;
    }

    const nextStatus = issue.status === "resolved" ? "open" : issue.status;
    toUpdate.push({
      id: issue.id,
      updates: {
        title: nextCandidate.title,
        description: nextCandidate.description,
        category: nextCandidate.category,
        severity: nextCandidate.severity,
        linked_page: nextCandidate.linked_page,
        linked_field: nextCandidate.linked_field,
        linked_route: nextCandidate.linked_route,
        status: nextStatus,
        resolved_at: null,
        waived_at: issue.waived_at,
        updated_at: now
      }
    });
  });

  candidateByKey.forEach((candidate) => {
    toCreate.push(candidate);
  });

  return { toCreate, toUpdate };
}

export function buildDiligenceIssueFeedback(params: {
  previousIssues: DiligenceIssue[];
  nextIssues: DiligenceIssue[];
  plan: SyncPlan;
}) {
  const previousReadiness = deriveDiligenceReadiness({ issues: params.previousIssues });
  const currentReadiness = deriveDiligenceReadiness({ issues: params.nextIssues });
  const resolvedIssueTitles = params.plan.toUpdate
    .filter((update) => update.updates.status === "resolved")
    .map((update) => params.previousIssues.find((issue) => issue.id === update.id)?.title)
    .filter((title): title is string => Boolean(title));
  const reopenedIssueTitles = params.plan.toUpdate
    .filter((update) => {
      const existingIssue = params.previousIssues.find((issue) => issue.id === update.id);
      return existingIssue?.status === "resolved" && update.updates.status === "open";
    })
    .map(
      (update) =>
        update.updates.title ??
        params.previousIssues.find((issue) => issue.id === update.id)?.title
    )
    .filter((title): title is string => Boolean(title));

  return {
    resolvedIssueTitles,
    resolvedIssueCount: resolvedIssueTitles.length,
    reopenedIssueTitles,
    reopenedIssueCount: reopenedIssueTitles.length,
    readinessChanged:
      previousReadiness.readinessLabel !== currentReadiness.readinessLabel,
    previousReadinessLabel: previousReadiness.readinessLabel,
    currentReadinessLabel: currentReadiness.readinessLabel
  } satisfies DiligenceIssueFeedback;
}

async function getCompanyIssues(companyId: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("diligence_issues")
    .select(DILIGENCE_ISSUE_COLUMNS)
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .returns<DiligenceIssue[]>();

  if (error) {
    console.error("Failed to load diligence issues", { companyId, error });
    return [];
  }

  return Array.isArray(data) ? data : [];
}

export async function syncDiligenceIssuesForContext(
  context: DealDerivedContext
): Promise<DiligenceIssueSyncResult> {
  const existingIssues = await getCompanyIssues(context.company.id);
  const candidates = buildSystemDiligenceIssueCandidatesForContext(context);
  const plan = planDiligenceIssueSync({ existingIssues, candidates });
  const supabase = getSupabaseServerClient();

  for (const candidate of plan.toCreate) {
    const { error } = await supabase.from("diligence_issues").insert({
      company_id: candidate.company_id,
      period_id: candidate.period_id,
      source_type: candidate.source_type,
      issue_code: candidate.issue_code,
      title: candidate.title,
      description: candidate.description,
      category: candidate.category,
      severity: candidate.severity,
      status: candidate.status,
      linked_page: candidate.linked_page,
      linked_field: candidate.linked_field,
      linked_route: candidate.linked_route,
      dedupe_key: candidate.dedupe_key,
      created_by: candidate.created_by,
      owner: candidate.owner
    });

    if (error) {
      console.error("Failed to create diligence issue", {
        companyId: candidate.company_id,
        dedupeKey: candidate.dedupe_key,
        error
      });
    }
  }

  for (const update of plan.toUpdate) {
    const { error } = await supabase
      .from("diligence_issues")
      .update(update.updates)
      .eq("id", update.id);

    if (error) {
      console.error("Failed to update diligence issue", {
        id: update.id,
        error
      });
    }
  }

  const issues = await getCompanyIssues(context.company.id);

  return {
    issues,
    feedback: buildDiligenceIssueFeedback({
      previousIssues: existingIssues,
      nextIssues: issues,
      plan
    })
  };
}

export function buildEmptyDiligenceIssueFeedback() {
  return { ...EMPTY_ISSUE_FEEDBACK };
}

export async function getDiligenceIssues(params: {
  companyId: string;
  periodId?: string | null;
  status?: DiligenceIssueStatus | "active";
  linkedPage?: DiligenceIssueLinkedPage;
}) {
  const issues = await getCompanyIssues(params.companyId);

  return issues.filter((issue) => {
    if (params.periodId !== undefined && issue.period_id !== params.periodId) {
      return false;
    }

    if (params.linkedPage && issue.linked_page !== params.linkedPage) {
      return false;
    }

    if (params.status === "active") {
      return issue.status === "open" || issue.status === "in_review";
    }

    if (params.status && issue.status !== params.status) {
      return false;
    }

    return true;
  });
}

export function summarizeDiligenceIssues(issues: DiligenceIssue[]): DiligenceIssueSummary {
  const summary = {
    ...EMPTY_ISSUE_SUMMARY,
    bySeverity: { ...EMPTY_ISSUE_SUMMARY.bySeverity },
    byPage: { ...EMPTY_ISSUE_SUMMARY.byPage }
  };

  issues.forEach((issue) => {
    summary.total += 1;
    summary.bySeverity[issue.severity] += 1;
    summary.byPage[issue.linked_page] += 1;

    if (issue.status === "open") {
      summary.open += 1;
    } else if (issue.status === "in_review") {
      summary.inReview += 1;
    } else if (issue.status === "resolved") {
      summary.resolved += 1;
    } else if (issue.status === "waived") {
      summary.waived += 1;
    }

    if (issue.status === "open" && issue.severity === "critical") {
      summary.criticalOpen += 1;
    }
  });

  summary.topOpenIssue =
    issues
      .filter((issue) => issue.status === "open" || issue.status === "in_review")
      .sort((left, right) => issueRank(left) - issueRank(right))[0] ?? null;

  return summary;
}

export async function createManualDiligenceIssue(params: {
  companyId: string;
  periodId?: string | null;
  title: string;
  description: string;
  category: DiligenceIssueCategory;
  severity: DiligenceIssueSeverity;
  linkedPage: DiligenceIssueLinkedPage;
  linkedField?: string | null;
  linkedRoute?: string | null;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("diligence_issues")
    .insert({
      company_id: params.companyId,
      period_id: params.periodId ?? null,
      source_type: "manual",
      issue_code: null,
      title: params.title,
      description: params.description,
      category: params.category,
      severity: params.severity,
      status: "open",
      linked_page: params.linkedPage,
      linked_field: params.linkedField ?? null,
      linked_route:
        params.linkedRoute ??
        buildIssueRoute({
          companyId: params.companyId,
          page: params.linkedPage,
          actionLabel: params.title
        }),
      dedupe_key: null,
      created_by: null,
      owner: null
    })
    .select(DILIGENCE_ISSUE_COLUMNS)
    .single<DiligenceIssue>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateDiligenceIssue(params: {
  id: string;
  status?: DiligenceIssueStatus;
  owner?: string | null;
}) {
  const supabase = getSupabaseServerClient();
  const updates: Record<string, string | null> = {
    updated_at: new Date().toISOString()
  };

  if (params.status) {
    updates.status = params.status;
    updates.resolved_at =
      params.status === "resolved" ? new Date().toISOString() : null;
    updates.waived_at =
      params.status === "waived" ? new Date().toISOString() : null;
  }

  if (params.owner !== undefined) {
    updates.owner = params.owner;
  }

  const { data, error } = await supabase
    .from("diligence_issues")
    .update(updates)
    .eq("id", params.id)
    .select(DILIGENCE_ISSUE_COLUMNS)
    .single<DiligenceIssue>();

  if (error) {
    throw error;
  }

  return data;
}

export async function getPortfolioIssueSummaries(companyIds: string[]) {
  const summaries = await Promise.all(
    companyIds.map(async (companyId) => {
      const issues = await getDiligenceIssues({ companyId });
      return [companyId, summarizeDiligenceIssues(issues)] as const;
    })
  );

  return new Map(summaries);
}
