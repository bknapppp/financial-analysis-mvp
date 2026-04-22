import { buildDealActionHref, buildDealState, type DealScreenerOutputs } from "./deal-state.ts";
import { deriveDiligenceReadiness } from "./diligence-readiness.ts";
import type { RiskFlagSeverity } from "./risk-flags.ts";
import { buildFixItHref } from "./fix-it.ts";
import type { WorkbookFixItTask } from "./workbook-fix-its.ts";
import type {
  DataReadiness,
  DiligenceIssue,
  PeriodSnapshot,
  TaxSourceStatus,
  UnderwritingCompletionSection,
  UnderwritingCompletionSectionKey,
  UnderwritingCompletionSummary
} from "./types.ts";

export type PortfolioReadinessStateKey =
  | "needs_source_upload"
  | "needs_workbook_review"
  | "needs_mapping"
  | "needs_source_completion"
  | "needs_underwriting_inputs"
  | "underwriting_in_progress"
  | "ready_for_structure"
  | "ready_for_output";

export type PortfolioDealStatus =
  | "Needs source data"
  | "Needs workbook review"
  | "Needs mapping"
  | "Needs source completion"
  | "Needs underwriting inputs"
  | "Underwriting in progress"
  | "Ready for structure"
  | "Ready for output";

export type PortfolioReadinessBlockerCategory =
  | "workbook"
  | "mapping"
  | "source_data"
  | "reconciliation"
  | "underwriting"
  | "structure";

export type PortfolioReadinessBlockerSeverity = "critical" | "warning" | "info";

export type PortfolioReadinessBlocker = {
  key: string;
  category: PortfolioReadinessBlockerCategory;
  severity: PortfolioReadinessBlockerSeverity;
  label: string;
  reason: string;
  actionLabel: string;
  href: string;
};

export type PortfolioReadinessNextAction = {
  label: string;
  href: string;
  source: PortfolioReadinessBlockerCategory | "state";
};

export type PortfolioReadinessRecord = {
  stateKey: PortfolioReadinessStateKey;
  status: PortfolioDealStatus;
  blockers: PortfolioReadinessBlocker[];
  primaryBlocker: PortfolioReadinessBlocker | null;
  currentBlocker: string | null;
  nextAction: PortfolioReadinessNextAction;
  hasCriticalInputsMissing: boolean;
  hasAddBacks: boolean;
  addBacksPercentOfEbitda: number | null;
  addBacksAboveThreshold: boolean;
};

export type PortfolioDealState = Omit<PortfolioReadinessRecord, "nextAction"> & {
  nextActionSource: PortfolioReadinessNextAction["source"];
  nextAction: string;
  nextActionHref: string;
};

function getSection(
  summary: UnderwritingCompletionSummary,
  key: UnderwritingCompletionSectionKey
): UnderwritingCompletionSection | undefined {
  return summary.sections.find((section) => section.key === key);
}

function incompleteLabels(section: UnderwritingCompletionSection | undefined) {
  return section?.items.filter((item) => !item.isComplete).map((item) => item.label) ?? [];
}

function categorizeSourceLabel(label: string) {
  if (
    label === "Revenue available" ||
    label === "COGS available" ||
    label === "Operating expenses available"
  ) {
    return "Financials";
  }

  if (label === "EBITDA basis available") {
    return "EBITDA basis";
  }

  if (label === "Key balance sheet components available") {
    return "Balance sheet";
  }

  return label;
}

function buildSourceBlocker(
  summary: UnderwritingCompletionSummary,
  section: UnderwritingCompletionSection | undefined
) {
  const sourceLabels = [
    "Revenue available",
    "COGS available",
    "Operating expenses available",
    "EBITDA basis available",
    "Key balance sheet components available"
  ];
  const labels = [
    ...summary.missingItems.filter((item) => sourceLabels.includes(item)),
    ...incompleteLabels(section).filter((item) => sourceLabels.includes(item))
  ];

  const mapped = Array.from(new Set(labels.map((label) => categorizeSourceLabel(label))));
  return mapped.length > 0 ? `Missing: ${mapped.join(" • ")}` : "Missing: Financials";
}

function categorizeMappingLabel(label: string) {
  if (
    label === "Coverage supports usable outputs" ||
    label === "No unmapped rows remain"
  ) {
    return "Mapping";
  }

  if (label === "Low-confidence mappings resolved") {
    return "Low-confidence mapping";
  }

  if (label === "Broad classifications narrowed") {
    return "Classification";
  }

  return label;
}

function buildMappingBlocker(section: UnderwritingCompletionSection | undefined) {
  const labels = Array.from(
    new Set(incompleteLabels(section).map((label) => categorizeMappingLabel(label)))
  );
  return labels.length > 0 ? `Missing: ${labels.join(" • ")}` : "Missing: Mapping";
}

function categorizeUnderwritingLabel(label: string) {
  if (
    label === "Loan amount entered" ||
    label === "Interest rate entered" ||
    label === "Term entered" ||
    label === "Amortization entered" ||
    label === "Purchase price / collateral support entered"
  ) {
    return "Structure Inputs";
  }

  if (
    label === "DSCR can be computed" ||
    label === "Debt / EBITDA can be computed" ||
    label === "LTV can be computed" ||
    label === "Coverage outputs are available"
  ) {
    return "Coverage Metrics";
  }

  return label;
}

function buildUnderwritingBlocker(
  structureInputs: UnderwritingCompletionSection | undefined,
  underwritingReadiness: UnderwritingCompletionSection | undefined
) {
  const labels = Array.from(
    new Set(
      [
        ...incompleteLabels(structureInputs).map((label) => categorizeUnderwritingLabel(label)),
        ...incompleteLabels(underwritingReadiness).map((label) => categorizeUnderwritingLabel(label))
      ]
    )
  );

  return labels.length > 0 ? `Missing: ${labels.join(" • ")}` : "Missing: Underwriting inputs";
}

function statusForStateKey(stateKey: PortfolioReadinessStateKey): PortfolioDealStatus {
  if (stateKey === "needs_source_upload") return "Needs source data";
  if (stateKey === "needs_workbook_review") return "Needs workbook review";
  if (stateKey === "needs_mapping") return "Needs mapping";
  if (stateKey === "needs_source_completion") return "Needs source completion";
  if (stateKey === "needs_underwriting_inputs") return "Needs underwriting inputs";
  if (stateKey === "underwriting_in_progress") return "Underwriting in progress";
  if (stateKey === "ready_for_structure") return "Ready for structure";
  return "Ready for output";
}

function buildBlocker(params: {
  key: string;
  category: PortfolioReadinessBlockerCategory;
  severity: PortfolioReadinessBlockerSeverity;
  label: string;
  reason: string;
  actionLabel: string;
  href: string;
}): PortfolioReadinessBlocker {
  return {
    key: params.key,
    category: params.category,
    severity: params.severity,
    label: params.label,
    reason: params.reason,
    actionLabel: params.actionLabel,
    href: params.href
  };
}

function dedupeBlockers(blockers: PortfolioReadinessBlocker[]) {
  return blockers.filter(
    (blocker, index, collection) =>
      collection.findIndex(
        (candidate) =>
          candidate.category === blocker.category &&
          candidate.label === blocker.label &&
          candidate.actionLabel === blocker.actionLabel
      ) === index
  );
}

function blockerPriority(blocker: PortfolioReadinessBlocker) {
  const severityScore =
    blocker.severity === "critical" ? 0 : blocker.severity === "warning" ? 1 : 2;
  const categoryScore: Record<PortfolioReadinessBlockerCategory, number> = {
    workbook: 0,
    source_data: 1,
    mapping: 2,
    reconciliation: 3,
    underwriting: 4,
    structure: 5
  };

  return severityScore * 10 + categoryScore[blocker.category];
}

function compareBlockers(left: PortfolioReadinessBlocker, right: PortfolioReadinessBlocker) {
  const priorityDifference = blockerPriority(left) - blockerPriority(right);
  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  return left.label.localeCompare(right.label);
}

function buildSourceDataHref(companyId: string) {
  return `/source-data?companyId=${companyId}`;
}

function buildDealHref(companyId: string) {
  return `/deal/${companyId}`;
}

function deriveWorkbookBlockers(params: {
  workbookFixIts: WorkbookFixItTask[];
}): PortfolioReadinessBlocker[] {
  return params.workbookFixIts.map((task) =>
    buildBlocker({
      key: task.key,
      category: "workbook",
      severity: task.severity,
      label: task.label,
      reason: task.reason,
      actionLabel: task.actionLabel,
      href: task.href
    })
  );
}

function deriveSourceDataBlockers(params: {
  companyId: string;
  completionSummary: UnderwritingCompletionSummary;
  readiness: DataReadiness;
  taxSourceStatus: TaxSourceStatus;
}) {
  const financialInputs = getSection(params.completionSummary, "financial_inputs");
  const sourceDataHref = buildSourceDataHref(params.companyId);
  const blockers: PortfolioReadinessBlocker[] = [];

  if (
    params.completionSummary.sections.length === 0 ||
    financialInputs?.status === "blocked"
  ) {
    blockers.push(
      buildBlocker({
        key: "source_upload_missing",
        category: "source_data",
        severity: "critical",
        label: buildSourceBlocker(params.completionSummary, financialInputs),
        reason: "Reported financial statements are not loaded deeply enough to support workflow progression.",
        actionLabel: "Upload financials",
        href: buildFixItHref("Upload financials", sourceDataHref)
      })
    );
  }

  if (financialInputs?.status === "in_progress") {
    blockers.push(
      buildBlocker({
        key: "source_completion_review",
        category: "source_data",
        severity: "warning",
        label: buildSourceBlocker(params.completionSummary, financialInputs),
        reason: "Core source-data coverage exists, but the financial package still needs completion review.",
        actionLabel: "Review source data",
        href: sourceDataHref
      })
    );
  }

  params.readiness.blockingReasons.forEach((reason, index) => {
    blockers.push(
      buildBlocker({
        key: `source_data_blocked_${index}`,
        category: "source_data",
        severity: "critical",
        label: `Missing: ${reason}`,
        reason,
        actionLabel: "Review source data",
        href: sourceDataHref
      })
    );
  });

  params.readiness.cautionReasons.forEach((reason, index) => {
    blockers.push(
      buildBlocker({
        key: `source_data_warning_${index}`,
        category: "source_data",
        severity: "warning",
        label: `Review: ${reason}`,
        reason,
        actionLabel: "Review source data",
        href: sourceDataHref
      })
    );
  });

  if (params.taxSourceStatus.comparisonStatus !== "ready") {
    const comparisonLabel =
      params.taxSourceStatus.comparisonStatus === "not_loaded"
        ? "Tax comparison source not loaded"
        : "Tax comparison coverage incomplete";

    blockers.push(
      buildBlocker({
        key: `tax_comparison_${params.taxSourceStatus.comparisonStatus}`,
        category: "reconciliation",
        severity:
          params.taxSourceStatus.comparisonStatus === "not_loaded" ? "warning" : "warning",
        label: comparisonLabel,
        reason:
          params.taxSourceStatus.comparisonStatus === "not_loaded"
            ? "No matched tax source is available for reconciliation yet."
            : "A tax source exists, but the reported-vs-tax comparison is not fully usable yet.",
        actionLabel: "Review source data",
        href: sourceDataHref
      })
    );
  }

  params.taxSourceStatus.missingComponents.forEach((reason, index) => {
    blockers.push(
      buildBlocker({
        key: `tax_missing_component_${index}`,
        category: "reconciliation",
        severity: "warning",
        label: `Tax comparison gap: ${reason}`,
        reason,
        actionLabel: "Review source data",
        href: sourceDataHref
      })
    );
  });

  return dedupeBlockers(blockers).sort(compareBlockers);
}

function deriveMappingBlockers(params: {
  companyId: string;
  completionSummary: UnderwritingCompletionSummary;
}) {
  const mappingCompleteness = getSection(params.completionSummary, "mapping_completeness");
  if (!mappingCompleteness || mappingCompleteness.status === "complete") {
    return [];
  }

  return [
    buildBlocker({
      key: "mapping_completeness",
      category: "mapping",
      severity: mappingCompleteness.status === "blocked" ? "critical" : "warning",
      label: buildMappingBlocker(mappingCompleteness),
      reason:
        mappingCompleteness.status === "blocked"
          ? "Mapped financial rows are still missing required coverage."
          : "Mappings are usable but still need review before they are considered complete.",
      actionLabel: "Complete mapping",
      href: buildFixItHref("Complete mapping", buildSourceDataHref(params.companyId))
    })
  ];
}

function deriveUnderwritingBlockers(params: {
  companyId: string;
  completionSummary: UnderwritingCompletionSummary;
  addBacksAboveThreshold: boolean;
  addBacksPercentOfEbitda: number | null;
}) {
  const structureInputs = getSection(params.completionSummary, "structure_inputs");
  const underwritingReadiness = getSection(params.completionSummary, "underwriting_readiness");
  const blockers: PortfolioReadinessBlocker[] = [];

  if (
    structureInputs?.status === "blocked" ||
    underwritingReadiness?.status === "blocked"
  ) {
    blockers.push(
      buildBlocker({
        key: "underwriting_inputs_missing",
        category: "underwriting",
        severity: "critical",
        label: buildUnderwritingBlocker(structureInputs, underwritingReadiness),
        reason: "Required debt sizing or underwriting inputs are still missing.",
        actionLabel: "Enter loan terms",
        href: buildFixItHref("Enter loan terms", buildDealHref(params.companyId))
      })
    );
  } else if (
    structureInputs?.status === "in_progress" ||
    underwritingReadiness?.status === "in_progress"
  ) {
    blockers.push(
      buildBlocker({
        key: "underwriting_review_remaining",
        category: "underwriting",
        severity: "warning",
        label: buildUnderwritingBlocker(structureInputs, underwritingReadiness),
        reason: "Underwriting setup is underway, but not all requirements are complete yet.",
        actionLabel: params.completionSummary.nextActions[0] ?? "Continue underwriting",
        href: buildFixItHref(
          params.completionSummary.nextActions[0] ?? "Continue underwriting",
          buildDealHref(params.companyId)
        )
      })
    );
  }

  if (
    params.addBacksAboveThreshold &&
    params.addBacksPercentOfEbitda !== null
  ) {
    blockers.push(
      buildBlocker({
        key: "add_backs_review",
        category: "structure",
        severity: "warning",
        label: `Accepted add-backs equal ${params.addBacksPercentOfEbitda.toFixed(1)}% of EBITDA`,
        reason: "Add-backs are large enough that they should be reviewed before relying on the structure outcome.",
        actionLabel: "Review add-backs",
        href: buildFixItHref("Review add-backs", buildDealHref(params.companyId))
      })
    );
  }

  return dedupeBlockers(blockers).sort(compareBlockers);
}

function deriveDealStateBlockers(params: {
  companyId: string;
  snapshot?: PeriodSnapshot | null;
  screenerOutputs?: DealScreenerOutputs;
}) {
  if (!params.snapshot || !params.screenerOutputs) {
    return [];
  }

  const dealState = buildDealState(params.snapshot, params.screenerOutputs);
  const actionsByIssueId = new Map(
    dealState.actions.map((action) => [action.issueId, action] as const)
  );

  return dealState.issues.map((issue) => {
    const action = actionsByIssueId.get(issue.id);
    const category: PortfolioReadinessBlockerCategory =
      issue.type === "mapping"
        ? "mapping"
        : issue.type === "reconciliation"
          ? "reconciliation"
          : issue.type === "credit"
            ? "underwriting"
            : "source_data";

    return buildBlocker({
      key: issue.id,
      category,
      severity: issue.severity === "blocker" ? "critical" : "warning",
      label: issue.message,
      reason: issue.message,
      actionLabel: action?.label ?? "Review source data",
      href: action ? buildDealActionHref(action, params.companyId) : buildSourceDataHref(params.companyId)
    });
  });
}

function deriveStateKey(params: {
  completionSummary: UnderwritingCompletionSummary;
  readiness: DataReadiness;
  taxSourceStatus: TaxSourceStatus;
  workbookBlockers: PortfolioReadinessBlocker[];
  sourceBlockers: PortfolioReadinessBlocker[];
  mappingBlockers: PortfolioReadinessBlocker[];
  underwritingBlockers: PortfolioReadinessBlocker[];
}) {
  const financialInputs = getSection(params.completionSummary, "financial_inputs");
  const mappingCompleteness = getSection(params.completionSummary, "mapping_completeness");
  const structureInputs = getSection(params.completionSummary, "structure_inputs");
  const underwritingReadiness = getSection(params.completionSummary, "underwriting_readiness");
  const hasCriticalWorkbookBlockers = params.workbookBlockers.length > 0;
  const hasSourceUploadBlocker =
    params.completionSummary.sections.length === 0 || financialInputs?.status === "blocked";
  const hasMappingBlocker =
    Boolean(mappingCompleteness) && mappingCompleteness?.status !== "complete";
  const hasCriticalSourceCompletionBlocker =
    financialInputs?.status === "in_progress" || params.readiness.status === "blocked";
  const hasCriticalUnderwritingBlocker =
    structureInputs?.status === "blocked" || underwritingReadiness?.status === "blocked";

  if (hasCriticalWorkbookBlockers) {
    return "needs_workbook_review" as const;
  }

  if (hasSourceUploadBlocker) {
    return "needs_source_upload" as const;
  }

  if (hasMappingBlocker) {
    return "needs_mapping" as const;
  }

  if (hasCriticalSourceCompletionBlocker) {
    return "needs_source_completion" as const;
  }

  if (hasCriticalUnderwritingBlocker) {
    return "needs_underwriting_inputs" as const;
  }

  if (
    params.completionSummary.completionStatus === "ready" &&
    params.readiness.status === "ready" &&
    params.taxSourceStatus.comparisonStatus === "ready"
  ) {
    return "ready_for_output" as const;
  }

  if (
    structureInputs?.status === "complete" &&
    underwritingReadiness?.status === "complete"
  ) {
    return "ready_for_structure" as const;
  }

  if (
    params.sourceBlockers.some((blocker) => blocker.severity !== "info") &&
    params.readiness.status !== "ready"
  ) {
    return "needs_source_completion" as const;
  }

  return "underwriting_in_progress" as const;
}

function buildStateNextAction(params: {
  stateKey: PortfolioReadinessStateKey;
  companyId: string;
  completionSummary: UnderwritingCompletionSummary;
  addBacksAboveThreshold: boolean;
}) {
  if (params.stateKey === "ready_for_output") {
    const label = params.addBacksAboveThreshold ? "Review add-backs" : "Prepare output";
    return {
      label,
      href: buildFixItHref(label, buildDealHref(params.companyId)),
      source: "state" as const
    };
  }

  if (params.stateKey === "ready_for_structure") {
    const label = params.addBacksAboveThreshold ? "Review add-backs" : "Run structure";
    return {
      label,
      href: buildFixItHref(label, buildDealHref(params.companyId)),
      source: "state" as const
    };
  }

  if (params.stateKey === "underwriting_in_progress") {
    const label =
      params.addBacksAboveThreshold && params.completionSummary.nextActions.length === 0
        ? "Review add-backs"
        : params.completionSummary.nextActions[0] ?? "Continue underwriting";

    return {
      label,
      href: buildFixItHref(label, buildDealHref(params.companyId)),
      source: "state" as const
    };
  }

  return {
    label: "Review source data",
    href: buildSourceDataHref(params.companyId),
    source: "state" as const
  };
}

function mapReadinessStateToPortfolioStateKey(params: {
  readinessState: ReturnType<typeof deriveDiligenceReadiness>["state"];
  blockingGroupKey: ReturnType<typeof deriveDiligenceReadiness>["blockingGroupKey"];
}) {
  if (params.readinessState === "ready_for_lender" || params.readinessState === "completed") {
    return "ready_for_output" as const;
  }

  if (
    params.readinessState === "ready_for_ic" ||
    params.readinessState === "structurally_ready"
  ) {
    return "ready_for_structure" as const;
  }

  if (params.readinessState === "under_review") {
    return "underwriting_in_progress" as const;
  }

  if (params.blockingGroupKey === "source_data" || params.blockingGroupKey === "reconciliation") {
    return "needs_source_completion" as const;
  }

  if (params.blockingGroupKey === "financial_validation") {
    return "needs_workbook_review" as const;
  }

  return "needs_underwriting_inputs" as const;
}

export function derivePortfolioReadiness(params: {
  companyId: string;
  completionSummary: UnderwritingCompletionSummary;
  readiness: DataReadiness;
  taxSourceStatus: TaxSourceStatus;
  diligenceIssues?: DiligenceIssue[];
  workbookFixIts?: WorkbookFixItTask[];
  snapshot?: PeriodSnapshot | null;
  screenerOutputs?: DealScreenerOutputs;
}): PortfolioReadinessRecord {
  const { companyId, completionSummary, readiness, taxSourceStatus, snapshot } = params;
  const workbookFixIts = params.workbookFixIts ?? [];
  const hasAddBacks = (snapshot?.acceptedAddBacks ?? 0) > 0;
  const addBacksPercentOfEbitda =
    snapshot?.ebitda !== null &&
    snapshot?.ebitda !== undefined &&
    snapshot.ebitda !== 0 &&
    hasAddBacks
      ? (snapshot.acceptedAddBacks / Math.abs(snapshot.ebitda)) * 100
      : null;
  const addBacksAboveThreshold =
    addBacksPercentOfEbitda !== null && addBacksPercentOfEbitda >= 25;

  const workbookBlockers = deriveWorkbookBlockers({ workbookFixIts });
  const sourceBlockers = deriveSourceDataBlockers({
    companyId,
    completionSummary,
    readiness,
    taxSourceStatus
  });
  const mappingBlockers = deriveMappingBlockers({
    companyId,
    completionSummary
  });
  const underwritingBlockers = deriveUnderwritingBlockers({
    companyId,
    completionSummary,
    addBacksAboveThreshold,
    addBacksPercentOfEbitda
  });
  const dealStateBlockers = deriveDealStateBlockers({
    companyId,
    snapshot,
    screenerOutputs: params.screenerOutputs
  });

  const blockers = dedupeBlockers([
    ...workbookBlockers,
    ...sourceBlockers,
    ...mappingBlockers,
    ...underwritingBlockers,
    ...dealStateBlockers
  ]).sort(compareBlockers);

  const issueReadiness = deriveDiligenceReadiness({
    issues: params.diligenceIssues ?? []
  });
  const fallbackStateKey = deriveStateKey({
    completionSummary,
    readiness,
    taxSourceStatus,
    workbookBlockers,
    sourceBlockers,
    mappingBlockers,
    underwritingBlockers
  });
  const stateKey =
    params.diligenceIssues && params.diligenceIssues.length > 0
      ? mapReadinessStateToPortfolioStateKey({
          readinessState: issueReadiness.state,
          blockingGroupKey: issueReadiness.blockingGroupKey
        })
      : fallbackStateKey;
  const status = statusForStateKey(stateKey);
  const primaryBlocker =
    stateKey === "ready_for_structure" || stateKey === "ready_for_output"
      ? blockers.find((blocker) => blocker.category === "structure") ??
        dealStateBlockers[0] ??
        null
      : blockers[0] ?? null;
  const dealState = snapshot
    ? buildDealState(snapshot, {
        completionSummary,
        ...params.screenerOutputs
      })
    : null;
  const prioritizedDealAction = dealState?.actions[0] ?? null;
  const nextAction =
    primaryBlocker &&
    stateKey !== "ready_for_structure" &&
    stateKey !== "ready_for_output" &&
    stateKey !== "underwriting_in_progress"
      ? {
          label: primaryBlocker.actionLabel,
          href: primaryBlocker.href,
          source: primaryBlocker.category
        }
      : prioritizedDealAction
        ? {
            label: prioritizedDealAction.label,
            href: buildDealActionHref(prioritizedDealAction, companyId),
            source:
              prioritizedDealAction.location === "source"
                ? ("source_data" as const)
                : ("underwriting" as const)
          }
      : buildStateNextAction({
          stateKey,
          companyId,
          completionSummary,
          addBacksAboveThreshold
        });
  const currentBlocker = primaryBlocker?.label ?? issueReadiness.readinessReason ?? null;

  return {
    stateKey,
    status,
    blockers,
    primaryBlocker,
    currentBlocker,
    nextAction,
    hasCriticalInputsMissing: blockers.some((blocker) => blocker.severity === "critical"),
    hasAddBacks,
    addBacksPercentOfEbitda,
    addBacksAboveThreshold
  };
}

export function derivePortfolioDealState(params: {
  companyId: string;
  completionSummary: UnderwritingCompletionSummary;
  readiness: DataReadiness;
  taxSourceStatus: TaxSourceStatus;
  diligenceIssues?: DiligenceIssue[];
  workbookFixIts?: WorkbookFixItTask[];
  snapshot?: PeriodSnapshot | null;
  screenerOutputs?: DealScreenerOutputs;
}): PortfolioDealState {
  const readinessRecord = derivePortfolioReadiness(params);

  return {
    ...readinessRecord,
    nextActionSource: readinessRecord.nextAction.source,
    nextAction: readinessRecord.nextAction.label,
    nextActionHref: readinessRecord.nextAction.href
  };
}

export function getPrimaryRiskSeverity(
  severities: Array<RiskFlagSeverity | null | undefined>
): RiskFlagSeverity | null {
  if (severities.includes("high")) {
    return "high";
  }

  if (severities.includes("medium")) {
    return "medium";
  }

  if (severities.includes("low")) {
    return "low";
  }

  return null;
}

export function isRecentlyUpdated(
  lastUpdated: string | null,
  now = new Date(),
  withinDays = 14
) {
  if (!lastUpdated) {
    return false;
  }

  const updatedAt = new Date(lastUpdated);
  if (Number.isNaN(updatedAt.getTime())) {
    return false;
  }

  return now.getTime() - updatedAt.getTime() <= withinDays * 24 * 60 * 60 * 1000;
}
