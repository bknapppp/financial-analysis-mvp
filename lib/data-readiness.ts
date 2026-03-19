import { getCanonicalPeriodAdjustment } from "@/lib/add-backs";
import type {
  AddBack,
  AddBackReviewItem,
  DataQualityReport,
  FinancialEntry,
  DataReadiness,
  PeriodSnapshot,
  ReconciliationReport
} from "@/lib/types";

function dedupeMessages(messages: string[]) {
  return Array.from(
    new Set(messages.map((message) => message.trim()).filter(Boolean))
  );
}

function mapBlockingMessage(item: string) {
  if (item === "Revenue") {
    return "Revenue is missing for the selected period.";
  }

  if (item === "Operating Expenses") {
    return "Operating expenses are missing for the selected period.";
  }

  return "";
}

function mapCautionMessage(item: string) {
  if (item === "COGS") {
    return "COGS is missing for the selected period.";
  }

  if (item === "Balance sheet components") {
    return "Balance sheet coverage is incomplete for the selected period.";
  }

  return "";
}

export function buildDataReadiness(params: {
  snapshot: PeriodSnapshot;
  entries: FinancialEntry[];
  addBacks: AddBack[];
  reviewItems: AddBackReviewItem[];
  dataQuality: DataQualityReport;
  reconciliation: ReconciliationReport;
}): DataReadiness {
  const {
    snapshot,
    entries,
    addBacks,
    reviewItems,
    dataQuality,
    reconciliation
  } = params;
  const blockingReasons: string[] = [];
  const cautionReasons: string[] = [];

  if (!snapshot.periodId) {
    return {
      status: "blocked",
      label: "Not reliable",
      blockingReasons: ["No reporting period is loaded."],
      cautionReasons: [],
      summaryMessage: "No reporting period is loaded, so adjusted EBITDA is not reliable."
    };
  }

  const currentEntries = entries.filter((entry) => entry.period_id === snapshot.periodId);
  const currentIncomeEntries = currentEntries.filter(
    (entry) => entry.statement_type === "income"
  );
  const currentAcceptedAddBacks = reviewItems.filter(
    (item) => item.periodId === snapshot.periodId && item.status === "accepted"
  );
  const criticalIssues = dataQuality.issueGroups.flatMap((group) =>
    group.issues
      .filter((issue) => issue.severity === "Critical")
      .map((issue) => issue.message)
  );
  const warningIssues = dataQuality.issueGroups.flatMap((group) =>
    group.issues
      .filter((issue) => issue.severity === "Warning")
      .map((issue) => issue.message)
  );
  const canonicalAdjustment = getCanonicalPeriodAdjustment({
    periodId: snapshot.periodId,
    addBacks,
    entries
  });

  if (currentEntries.length === 0) {
    blockingReasons.push("No financial entries are loaded for the selected period.");
  }

  if (currentIncomeEntries.length === 0) {
    blockingReasons.push(
      "The selected period does not contain enough income statement inputs to assess EBITDA."
    );
  }

  if (dataQuality.mappingCoveragePercent < 70) {
    blockingReasons.push(
      "Mapping coverage is below 70%, so adjusted EBITDA is not decision-grade."
    );
  }

  dataQuality.missingCategories.forEach((item) => {
    const blockingMessage = mapBlockingMessage(item);
    if (blockingMessage) {
      blockingReasons.push(blockingMessage);
      return;
    }

    const cautionMessage = mapCautionMessage(item);
    if (cautionMessage) {
      cautionReasons.push(cautionMessage);
    }
  });

  blockingReasons.push(
    ...criticalIssues,
    ...reconciliation.issues
      .filter((issue) => issue.severity === "critical")
      .map((issue) => issue.message)
  );

  if (currentEntries.some((entry) => entry.confidence === "low")) {
    cautionReasons.push("Low-confidence mappings remain in the selected period.");
  }

  if (currentAcceptedAddBacks.some((item) => item.dependsOnLowConfidenceMapping)) {
    cautionReasons.push(
      "Accepted add-backs rely on low-confidence mappings."
    );
  }

  if (canonicalAdjustment.usesLegacyFallback) {
    cautionReasons.push(
      "Adjusted EBITDA currently relies on legacy add-back flags."
    );
  }

  cautionReasons.push(
    ...warningIssues,
    ...reconciliation.issues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => issue.message),
    ...reconciliation.issues
      .filter((issue) => issue.severity === "info")
      .map((issue) => issue.message)
  );

  const finalBlockingReasons = dedupeMessages(blockingReasons);
  const finalCautionReasons = dedupeMessages(
    cautionReasons.filter((message) => !finalBlockingReasons.includes(message))
  );

  if (finalBlockingReasons.length > 0) {
    return {
      status: "blocked",
      label: "Not reliable",
      blockingReasons: finalBlockingReasons,
      cautionReasons: finalCautionReasons,
      summaryMessage:
        "Adjusted EBITDA is not reliable because critical data quality issues remain unresolved."
    };
  }

  if (finalCautionReasons.length > 0) {
    return {
      status: "caution",
      label: "Use with caution",
      blockingReasons: [],
      cautionReasons: finalCautionReasons,
      summaryMessage:
        "Adjusted EBITDA is available, but caution-level diligence issues remain."
    };
  }

  return {
    status: "ready",
    label: "Ready",
    blockingReasons: [],
    cautionReasons: [],
    summaryMessage: "Adjusted EBITDA is ready for decision-grade review."
  };
}
