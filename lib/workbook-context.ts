import type { ParsedImportSheet } from "./import-preview.ts";

export type WorkbookConfidenceLabel = "High confidence" | "Medium confidence" | "Needs review";

export type WorkbookCandidateSummary = {
  sheetName: string;
  statementType: "income_statement" | "balance_sheet" | "cash_flow" | "unknown";
  confidenceLabel: ParsedImportSheet["analysis"]["classification"]["confidenceLabel"];
  periodStructure: ParsedImportSheet["analysis"]["periodDetection"]["structure"];
  columnStructure: ParsedImportSheet["analysis"]["columnStructure"]["type"];
  periodCount: number;
  lineItemHintCount: number;
  selectionReason: string;
  rank: {
    confidence: number;
    statementSignal: number;
    periodCount: number;
    structure: number;
    hintCount: number;
    rowCount: number;
  };
};

export type WorkbookContext = {
  primaryIncomeStatementSheetName: string | null;
  primaryBalanceSheetSheetName: string | null;
  primaryCashFlowSheetName: string | null;
  supportingSheetNames: string[];
  ambiguousSheetNames: string[];
  defaultImportTargetSheetName: string | null;
  conflicts: string[];
  gaps: string[];
  confidenceLabel: WorkbookConfidenceLabel;
  summary: string;
  periodStructureSummary: "annual" | "monthly" | "quarterly" | "mixed" | "unknown";
  selectionReasons: Record<string, string>;
  candidateSummaries: WorkbookCandidateSummary[];
};

function confidenceRank(label: WorkbookCandidateSummary["confidenceLabel"]) {
  if (label === "High confidence") return 3;
  if (label === "Medium confidence") return 2;
  return 0;
}

function structureRank(type: WorkbookCandidateSummary["columnStructure"]) {
  if (type === "long") return 2;
  if (type === "wide") return 1;
  return 0;
}

function statementSignal(sheet: ParsedImportSheet, statementType: WorkbookCandidateSummary["statementType"]) {
  if (statementType === "income_statement") {
    return sheet.analysis.classification.incomeScore;
  }

  if (statementType === "balance_sheet") {
    return sheet.analysis.classification.balanceSheetScore;
  }

  if (statementType === "cash_flow") {
    return sheet.analysis.classification.cashFlowScore;
  }

  return 0;
}

function buildCandidateSummary(sheet: ParsedImportSheet): WorkbookCandidateSummary {
  const statementType = sheet.analysis.classification.statementType;
  const periodCount = sheet.analysis.periodDetection.periods.length;
  const hintCount = sheet.analysis.likelyFinancialLineItemHints.length;

  return {
    sheetName: sheet.name,
    statementType,
    confidenceLabel: sheet.analysis.classification.confidenceLabel,
    periodStructure: sheet.analysis.periodDetection.structure,
    columnStructure: sheet.analysis.columnStructure.type,
    periodCount,
    lineItemHintCount: hintCount,
    selectionReason: [
      sheet.analysis.classification.label,
      periodCount > 0
        ? `${periodCount} detected period${periodCount === 1 ? "" : "s"}`
        : "no detected periods",
      sheet.analysis.columnStructure.label
    ].join(" • "),
    rank: {
      confidence: confidenceRank(sheet.analysis.classification.confidenceLabel),
      statementSignal: statementSignal(sheet, statementType),
      periodCount,
      structure: structureRank(sheet.analysis.columnStructure.type),
      hintCount,
      rowCount: sheet.rows.length
    }
  };
}

function compareCandidates(left: WorkbookCandidateSummary, right: WorkbookCandidateSummary) {
  if (right.rank.confidence !== left.rank.confidence) {
    return right.rank.confidence - left.rank.confidence;
  }

  if (right.rank.statementSignal !== left.rank.statementSignal) {
    return right.rank.statementSignal - left.rank.statementSignal;
  }

  if (right.rank.periodCount !== left.rank.periodCount) {
    return right.rank.periodCount - left.rank.periodCount;
  }

  if (right.rank.structure !== left.rank.structure) {
    return right.rank.structure - left.rank.structure;
  }

  if (right.rank.hintCount !== left.rank.hintCount) {
    return right.rank.hintCount - left.rank.hintCount;
  }

  if (right.rank.rowCount !== left.rank.rowCount) {
    return right.rank.rowCount - left.rank.rowCount;
  }

  return left.sheetName.localeCompare(right.sheetName);
}

function isAmbiguousPair(primary: WorkbookCandidateSummary, runnerUp: WorkbookCandidateSummary | undefined) {
  if (!runnerUp) {
    return false;
  }

  if (primary.rank.confidence === 0 || runnerUp.rank.confidence === 0) {
    return false;
  }

  const closeConfidence = primary.rank.confidence === runnerUp.rank.confidence;
  const closeSignal = Math.abs(primary.rank.statementSignal - runnerUp.rank.statementSignal) <= 1;
  const closePeriods = Math.abs(primary.rank.periodCount - runnerUp.rank.periodCount) <= 1;

  return closeConfidence && closeSignal && closePeriods;
}

function selectPrimaryCandidate(
  candidates: WorkbookCandidateSummary[],
  statementLabel: "income statement" | "balance sheet" | "cash flow",
  conflicts: string[],
  ambiguousSheetNames: Set<string>,
  selectionReasons: Record<string, string>
) {
  if (candidates.length === 0) {
    return null;
  }

  const [primary, runnerUp] = [...candidates].sort(compareCandidates);

  selectionReasons[primary.sheetName] = `Selected as the workbook's default ${statementLabel} because it had the strongest deterministic parser cues.`;

  if (isAmbiguousPair(primary, runnerUp)) {
    ambiguousSheetNames.add(primary.sheetName);
    ambiguousSheetNames.add(runnerUp.sheetName);
    conflicts.push(
      `Multiple possible ${statementLabel} sheets were detected: ${primary.sheetName} and ${runnerUp.sheetName}.`
    );
    selectionReasons[primary.sheetName] = `Defaulted as the workbook's ${statementLabel}, but another sheet is nearly as plausible and should be reviewed.`;
    selectionReasons[runnerUp.sheetName] = `Strong alternate ${statementLabel} candidate that needs review before relying on workbook defaults.`;
  }

  return primary.sheetName;
}

function summarizePeriodStructure(
  primaryIncomeCandidate: WorkbookCandidateSummary | undefined,
  primaryBalanceCandidate: WorkbookCandidateSummary | undefined
): WorkbookContext["periodStructureSummary"] {
  const structures = [
    primaryIncomeCandidate?.periodStructure,
    primaryBalanceCandidate?.periodStructure
  ].filter((value): value is WorkbookCandidateSummary["periodStructure"] => Boolean(value));

  const normalized = structures.filter((value) => value !== "ttm");

  if (normalized.length === 0) {
    return "unknown";
  }

  if (new Set(normalized).size > 1) {
    return "mixed";
  }

  const only = normalized[0];
  if (only === "annual" || only === "monthly" || only === "quarterly") {
    return only;
  }

  return "unknown";
}

export function deriveWorkbookContext(parsedSheets: ParsedImportSheet[]): WorkbookContext {
  const candidateSummaries = parsedSheets.map(buildCandidateSummary);
  const selectionReasons: Record<string, string> = {};
  const conflicts: string[] = [];
  const gaps: string[] = [];
  const ambiguousSheetNames = new Set<string>();

  const incomeCandidates = candidateSummaries.filter(
    (candidate) => candidate.statementType === "income_statement"
  );
  const balanceCandidates = candidateSummaries.filter(
    (candidate) => candidate.statementType === "balance_sheet"
  );
  const cashFlowCandidates = candidateSummaries.filter(
    (candidate) => candidate.statementType === "cash_flow"
  );
  const supportingSheetNames = candidateSummaries
    .filter(
      (candidate) =>
        candidate.statementType === "cash_flow" ||
        (candidate.statementType === "unknown" &&
          (candidate.periodCount > 0 || candidate.lineItemHintCount > 0))
    )
    .map((candidate) => candidate.sheetName);

  const primaryIncomeStatementSheetName = selectPrimaryCandidate(
    incomeCandidates,
    "income statement",
    conflicts,
    ambiguousSheetNames,
    selectionReasons
  );
  const primaryBalanceSheetSheetName = selectPrimaryCandidate(
    balanceCandidates,
    "balance sheet",
    conflicts,
    ambiguousSheetNames,
    selectionReasons
  );
  const primaryCashFlowSheetName = selectPrimaryCandidate(
    cashFlowCandidates,
    "cash flow",
    conflicts,
    ambiguousSheetNames,
    selectionReasons
  );

  if (!primaryIncomeStatementSheetName) {
    gaps.push("No income statement was detected.");
  }

  if (!primaryBalanceSheetSheetName) {
    gaps.push("No balance sheet was detected.");
  }

  const primaryIncomeCandidate = incomeCandidates.find(
    (candidate) => candidate.sheetName === primaryIncomeStatementSheetName
  );
  const primaryBalanceCandidate = balanceCandidates.find(
    (candidate) => candidate.sheetName === primaryBalanceSheetSheetName
  );

  if (primaryIncomeCandidate && primaryIncomeCandidate.periodCount === 0) {
    gaps.push(`No periods were detected on the primary income statement sheet (${primaryIncomeCandidate.sheetName}).`);
  }

  if (primaryBalanceCandidate && primaryBalanceCandidate.periodCount === 0) {
    gaps.push(`No periods were detected on the primary balance sheet sheet (${primaryBalanceCandidate.sheetName}).`);
  }

  if (
    primaryIncomeCandidate &&
    primaryBalanceCandidate &&
    primaryIncomeCandidate.periodStructure !== "unknown" &&
    primaryBalanceCandidate.periodStructure !== "unknown" &&
    primaryIncomeCandidate.periodStructure !== primaryBalanceCandidate.periodStructure
  ) {
    conflicts.push(
      `Primary statements use different period structures (${primaryIncomeCandidate.periodStructure} vs ${primaryBalanceCandidate.periodStructure}).`
    );
  }

  if (
    primaryIncomeCandidate &&
    primaryBalanceCandidate &&
    primaryIncomeCandidate.periodCount > 0 &&
    primaryBalanceCandidate.periodCount > 0 &&
    primaryIncomeCandidate.periodCount !== primaryBalanceCandidate.periodCount
  ) {
    conflicts.push(
      `Primary statements expose different period counts (${primaryIncomeCandidate.periodCount} vs ${primaryBalanceCandidate.periodCount}).`
    );
  }

  if (
    !primaryIncomeStatementSheetName &&
    !primaryBalanceSheetSheetName &&
    candidateSummaries.some((candidate) => candidate.statementType !== "unknown")
  ) {
    gaps.push("The workbook only contains supporting schedules or non-imported statement types.");
  }

  if (candidateSummaries.every((candidate) => candidate.statementType === "unknown")) {
    gaps.push("No importable financial statements were detected.");
  }

  const defaultImportTargetSheetName =
    primaryIncomeStatementSheetName ??
    primaryBalanceSheetSheetName ??
    primaryCashFlowSheetName ??
    candidateSummaries.find((candidate) => candidate.statementType !== "unknown")?.sheetName ??
    candidateSummaries[0]?.sheetName ??
    null;

  const periodStructureSummary = summarizePeriodStructure(
    primaryIncomeCandidate,
    primaryBalanceCandidate
  );

  let confidenceLabel: WorkbookConfidenceLabel = "Needs review";
  if (
    primaryIncomeStatementSheetName &&
    primaryBalanceSheetSheetName &&
    conflicts.length === 0 &&
    gaps.length === 0
  ) {
    confidenceLabel = "High confidence";
  } else if (
    primaryIncomeStatementSheetName ||
    primaryBalanceSheetSheetName ||
    primaryCashFlowSheetName
  ) {
    confidenceLabel = "Medium confidence";
  }

  const summary =
    confidenceLabel === "High confidence"
      ? "The workbook contains a coherent primary income statement and balance sheet package."
      : confidenceLabel === "Medium confidence"
        ? "The workbook contains usable statement candidates, but selection or structure still needs some review."
        : "The workbook still needs review before it looks like a coherent import package.";

  return {
    primaryIncomeStatementSheetName,
    primaryBalanceSheetSheetName,
    primaryCashFlowSheetName,
    supportingSheetNames: Array.from(new Set(supportingSheetNames)).filter(
      (sheetName) =>
        ![
          primaryIncomeStatementSheetName,
          primaryBalanceSheetSheetName,
          primaryCashFlowSheetName
        ].includes(sheetName)
    ),
    ambiguousSheetNames: Array.from(ambiguousSheetNames),
    defaultImportTargetSheetName,
    conflicts,
    gaps,
    confidenceLabel,
    summary,
    periodStructureSummary,
    selectionReasons,
    candidateSummaries
  };
}
