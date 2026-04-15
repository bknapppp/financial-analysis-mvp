import type { RiskFlagSeverity } from "@/lib/risk-flags";
import { buildFixItHref } from "./fix-it.ts";
import type {
  DataReadiness,
  PeriodSnapshot,
  TaxSourceStatus,
  UnderwritingCompletionSection,
  UnderwritingCompletionSectionKey,
  UnderwritingCompletionSummary
} from "@/lib/types";

export type PortfolioDealStatus =
  | "Needs source data"
  | "Needs mapping"
  | "Needs underwriting inputs"
  | "Underwriting in progress"
  | "Ready for structure"
  | "Ready for output";

export type PortfolioDealState = {
  status: PortfolioDealStatus;
  currentBlocker: string | null;
  nextAction: string;
  nextActionHref: string;
  hasCriticalInputsMissing: boolean;
  hasAddBacks: boolean;
  addBacksPercentOfEbitda: number | null;
  addBacksAboveThreshold: boolean;
};

function getSection(
  summary: UnderwritingCompletionSummary,
  key: UnderwritingCompletionSectionKey
): UnderwritingCompletionSection | undefined {
  return summary.sections.find((section) => section.key === key);
}

function firstIncompleteLabel(section: UnderwritingCompletionSection | undefined) {
  return section?.items.find((item) => !item.isComplete)?.label ?? null;
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

export function derivePortfolioDealState(params: {
  companyId: string;
  completionSummary: UnderwritingCompletionSummary;
  readiness: DataReadiness;
  taxSourceStatus: TaxSourceStatus;
  snapshot?: PeriodSnapshot | null;
}): PortfolioDealState {
  const { companyId, completionSummary, readiness, taxSourceStatus, snapshot } = params;
  const financialInputs = getSection(completionSummary, "financial_inputs");
  const mappingCompleteness = getSection(completionSummary, "mapping_completeness");
  const structureInputs = getSection(completionSummary, "structure_inputs");
  const underwritingReadiness = getSection(completionSummary, "underwriting_readiness");
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

  function withAddBackState(base: Omit<PortfolioDealState, "hasAddBacks" | "addBacksPercentOfEbitda" | "addBacksAboveThreshold">): PortfolioDealState {
    return {
      ...base,
      hasAddBacks,
      addBacksPercentOfEbitda,
      addBacksAboveThreshold
    };
  }

  if (completionSummary.sections.length === 0 || financialInputs?.status === "blocked") {
    return withAddBackState({
      status: "Needs source data",
      currentBlocker: buildSourceBlocker(completionSummary, financialInputs),
      nextAction: "Upload financials",
      nextActionHref: buildFixItHref(
        "Upload financials",
        `/source-data?companyId=${companyId}`
      ),
      hasCriticalInputsMissing: true
    });
  }

  if (mappingCompleteness && mappingCompleteness.status !== "complete") {
    return withAddBackState({
      status: "Needs mapping",
      currentBlocker: buildMappingBlocker(mappingCompleteness),
      nextAction: "Complete mapping",
      nextActionHref: buildFixItHref(
        "Complete mapping",
        `/source-data?companyId=${companyId}`
      ),
      hasCriticalInputsMissing: mappingCompleteness.status === "blocked"
    });
  }

  if (structureInputs?.status === "blocked" || underwritingReadiness?.status === "blocked") {
    return withAddBackState({
      status: "Needs underwriting inputs",
      currentBlocker: buildUnderwritingBlocker(structureInputs, underwritingReadiness),
      nextAction: "Enter loan terms",
      nextActionHref: buildFixItHref("Enter loan terms", `/deal/${companyId}`),
      hasCriticalInputsMissing: true
    });
  }

  if (
    completionSummary.completionStatus === "ready" &&
    readiness.status === "ready" &&
    taxSourceStatus.comparisonStatus === "ready"
  ) {
    return withAddBackState({
      status: "Ready for output",
      currentBlocker:
        addBacksAboveThreshold && addBacksPercentOfEbitda !== null
          ? `Accepted add-backs equal ${addBacksPercentOfEbitda.toFixed(1)}% of EBITDA`
          : "Ready for output",
      nextAction: addBacksAboveThreshold ? "Review add-backs" : "Prepare output",
      nextActionHref: buildFixItHref(
        addBacksAboveThreshold ? "Review add-backs" : "Prepare output",
        `/deal/${companyId}`
      ),
      hasCriticalInputsMissing: false
    });
  }

  if (
    structureInputs?.status === "complete" &&
    underwritingReadiness?.status === "complete"
  ) {
    return withAddBackState({
      status: "Ready for structure",
      currentBlocker:
        addBacksAboveThreshold && addBacksPercentOfEbitda !== null
          ? `Accepted add-backs equal ${addBacksPercentOfEbitda.toFixed(1)}% of EBITDA`
          : taxSourceStatus.comparisonStatus !== "ready"
          ? "Missing: Tax comparison incomplete"
          : readiness.status === "caution"
            ? `Missing: ${readiness.cautionReasons[0] ?? "Validation items remain"}`
            : "Ready for structure",
      nextAction: addBacksAboveThreshold ? "Review add-backs" : "Run structure",
      nextActionHref: buildFixItHref(
        addBacksAboveThreshold ? "Review add-backs" : "Run structure",
        `/deal/${companyId}`
      ),
      hasCriticalInputsMissing: false
    });
  }

  return withAddBackState({
    status: "Underwriting in progress",
    currentBlocker:
      addBacksAboveThreshold && addBacksPercentOfEbitda !== null
        ? `Accepted add-backs equal ${addBacksPercentOfEbitda.toFixed(1)}% of EBITDA`
        : completionSummary.missingItems[0]
        ? `Missing: ${completionSummary.missingItems[0]}`
        : "Underwriting in progress",
    nextAction:
      hasAddBacks && completionSummary.nextActions.length === 0
        ? "Review add-backs"
        : completionSummary.nextActions[0] ?? "Continue underwriting",
    nextActionHref: buildFixItHref(
      hasAddBacks && completionSummary.nextActions.length === 0
        ? "Review add-backs"
        : completionSummary.nextActions[0] ?? "Continue underwriting",
      `/deal/${companyId}`
    ),
    hasCriticalInputsMissing: false
  });
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
