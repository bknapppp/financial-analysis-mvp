import {
  normalizeImportedPeriod,
  type NormalizedImportPeriod
} from "./import-periods.ts";
import type { StatementType } from "./types.ts";

export type WideStatementNormalizedRow = {
  account_name: string;
  amount: string;
  period_label: string;
  period_date: string;
  statement_type: StatementType;
};

export type StatementMatrixRow = {
  sheetRowIndex: number;
  cells: string[];
};

export type WideStatementParserDebugPeriodColumn = {
  columnIndex: number;
  rawHeaderValueRow1: string;
  rawHeaderValueRow2: string;
  chosenInterpretation: string;
  resolvedPeriodLabel: string;
  resolvedPeriodDate: string;
  notes: string;
};

export type WideStatementParserDebug = {
  wideFormatDetected: boolean;
  headerRowIndex: number;
  stackedHeaderRowIndex: number | null;
  headerSheetRowIndex: number | null;
  stackedHeaderSheetRowIndex: number | null;
  accountColumnIndex: number | null;
  accountColumnScore: number | null;
  accountColumnReason: string | null;
  usedSecondStackedHeaderRow: boolean;
  detectedPeriodColumns: WideStatementParserDebugPeriodColumn[];
  chosenStatementType: StatementType | "mixed" | "unknown";
  classifiedRowCounts: Record<RowClassification, number>;
};

type DetectedPeriodColumn = {
  columnIndex: number;
  label: string;
  periodDate: string;
  rawHeaderValueRow1: string;
  rawHeaderValueRow2: string;
  chosenInterpretation: string;
  usedSecondRow: boolean;
  notes: string;
};

type HeaderDetectionCandidate = {
  headerRowIndex: number;
  stackedHeaderRowIndex: number | null;
  periodColumns: DetectedPeriodColumn[];
  usedSecondStackedHeaderRow: boolean;
  secondRowContributionCount: number;
};

type AccountColumnCandidate = {
  columnIndex: number;
  score: number;
  reason: string;
};

type RowClassification =
  | "header_row"
  | "section"
  | "line_item"
  | "subtotal"
  | "total"
  | "ratio"
  | "per_share"
  | "note"
  | "empty";

const INCOME_SECTION_RULES = [
  "revenue",
  "sales",
  "cogs",
  "cost of goods",
  "gross profit",
  "operating expenses",
  "selling",
  "general",
  "administrative",
  "ebitda",
  "income",
  "expense"
];

const BALANCE_SECTION_RULES = [
  "assets",
  "current assets",
  "liabilities",
  "current liabilities",
  "equity",
  "cash",
  "receivable",
  "inventory",
  "payable",
  "debt"
];

const CASH_FLOW_SECTION_RULES = [
  "operating activities",
  "investing activities",
  "financing activities"
];

const RATIO_RULES = [
  "%",
  "margin",
  "ratio",
  "tax rate",
  "growth rate",
  "return on",
  "as a %"
];

const PER_SHARE_RULES = [
  "eps",
  "earnings per share",
  "diluted eps",
  "basic eps",
  "weighted average shares",
  "shares outstanding"
];

const NOTE_RULES = [
  "see note",
  "note ",
  "notes ",
  "reference",
  "memo",
  "adjusted",
  "unaudited"
];

const MALFORMED_LABEL_RULES = ["-", "--", "n/a", "na", "nm", "none"];
const HEADER_ROW_PHRASES = [
  "consolidated statements",
  "statements of operations",
  "statement of operations",
  "statements of income",
  "income statement",
  "statement of earnings"
];
const COMPANY_NAME_MARKERS = [" inc", " corp", " ltd", " plc", " llc", " holdings", " markets"];
const FINANCIAL_LABEL_KEYWORDS = [
  "revenue",
  "sales",
  "cost",
  "income",
  "expense",
  "profit",
  "ebitda",
  "ebit",
  "tax",
  "interest",
  "gross",
  "operating",
  "amortization",
  "depreciation"
];

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function hasNonEmptyValue(values: string[]) {
  return values.some((value) => value.trim().length > 0);
}

function getCells(row: StatementMatrixRow) {
  return row.cells;
}

function parseAmount(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const normalized = trimmed
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/\(([^)]+)\)/, "-$1");

  const numeric = Number(normalized);

  return Number.isFinite(numeric) ? numeric : null;
}

function hasAlphabeticCharacters(value: string) {
  return /[a-z]/i.test(value);
}

function isPlaceholderCell(value: string) {
  const normalized = normalizeText(value);
  return normalized.length === 0 || MALFORMED_LABEL_RULES.includes(normalized) || normalized === "x";
}

function isSubtotalLabel(label: string) {
  const normalized = normalizeText(label);

  return (
    normalized.includes("subtotal") ||
    normalized.includes("sub-total") ||
    normalized.includes("subtotal:")
  );
}

function isTotalLabel(label: string) {
  const normalized = normalizeText(label);

  return (
    normalized.startsWith("total ") ||
    normalized === "total" ||
    normalized.startsWith("net ") ||
    normalized.includes("ending balance")
  );
}

function isRatioLabel(label: string) {
  const normalized = normalizeText(label);
  return RATIO_RULES.some((rule) => normalized.includes(rule));
}

function isPerShareLabel(label: string) {
  const normalized = normalizeText(label);
  return PER_SHARE_RULES.some((rule) => normalized.includes(rule));
}

function isNoteLabel(label: string) {
  const normalized = normalizeText(label);
  return NOTE_RULES.some((rule) => normalized.includes(rule));
}

function isMalformedLabel(label: string) {
  const normalized = normalizeText(label);

  if (!normalized) {
    return true;
  }

  if (MALFORMED_LABEL_RULES.includes(normalized)) {
    return true;
  }

  return !/[a-z]/i.test(label);
}

function hasFinancialKeyword(label: string) {
  const normalized = normalizeText(label);
  return FINANCIAL_LABEL_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function isHeaderRowLabel(label: string) {
  const trimmed = label.trim();
  const normalized = normalizeText(label);
  const uppercaseRatio =
    trimmed.length === 0
      ? 0
      : trimmed.replace(/[^A-Z]/g, "").length / Math.max(trimmed.replace(/[^A-Za-z]/g, "").length, 1);

  return (
    HEADER_ROW_PHRASES.some((phrase) => normalized.includes(phrase)) ||
    COMPANY_NAME_MARKERS.some((marker) => normalized.includes(marker.trim())) ||
    (uppercaseRatio > 0.85 && trimmed.split(/\s+/).length >= 2 && !hasFinancialKeyword(label)) ||
    (!hasFinancialKeyword(label) && trimmed.split(/\s+/).length >= 4)
  );
}

function inferStatementTypeFromContext(label: string, sectionContext: string[]): StatementType {
  const normalizedLabel = normalizeText(label);
  const context = [normalizedLabel, ...sectionContext].join(" ");

  if (BALANCE_SECTION_RULES.some((rule) => context.includes(rule))) {
    return "balance_sheet";
  }

  if (
    INCOME_SECTION_RULES.some((rule) => context.includes(rule)) ||
    CASH_FLOW_SECTION_RULES.some((rule) => context.includes(rule))
  ) {
    return "income";
  }

  return "income";
}

function combineStackedHeaderValues(primary: string, secondary: string) {
  const trimmedPrimary = primary.trim();
  const trimmedSecondary = secondary.trim();

  if (!trimmedPrimary) {
    return trimmedSecondary;
  }

  if (!trimmedSecondary) {
    return trimmedPrimary;
  }

  return `${trimmedPrimary} ${trimmedSecondary}`.trim();
}

function getPeriodSpecificityRank(period: NormalizedImportPeriod) {
  if (period.granularity === "month") {
    return 3;
  }

  if (period.granularity === "quarter") {
    return 2;
  }

  return 1;
}

function extractYearFromPeriod(period: NormalizedImportPeriod) {
  return Number(period.periodDate.slice(0, 4));
}

function arePeriodsCompatible(
  candidate: NormalizedImportPeriod,
  otherPeriods: NormalizedImportPeriod[]
) {
  if (otherPeriods.length === 0) {
    return true;
  }

  const candidateYear = extractYearFromPeriod(candidate);

  return otherPeriods.every((period) => extractYearFromPeriod(period) === candidateYear);
}

function resolveStackedPeriodColumn(
  row1Value: string,
  row2Value: string
): Omit<DetectedPeriodColumn, "columnIndex"> | null {
  const candidates = [
    {
      interpretation: "row 1",
      rawValue: row1Value.trim(),
      normalized: normalizeImportedPeriod({
        periodLabel: row1Value,
        periodDate: row1Value
      })
    },
    {
      interpretation: "row 2",
      rawValue: row2Value.trim(),
      normalized: normalizeImportedPeriod({
        periodLabel: row2Value,
        periodDate: row2Value
      })
    },
    {
      interpretation: "row 1 + row 2",
      rawValue: combineStackedHeaderValues(row1Value, row2Value),
      normalized: normalizeImportedPeriod({
        periodLabel: combineStackedHeaderValues(row1Value, row2Value),
        periodDate: combineStackedHeaderValues(row1Value, row2Value)
      })
    },
    {
      interpretation: "row 2 + row 1",
      rawValue: combineStackedHeaderValues(row2Value, row1Value),
      normalized: normalizeImportedPeriod({
        periodLabel: combineStackedHeaderValues(row2Value, row1Value),
        periodDate: combineStackedHeaderValues(row2Value, row1Value)
      })
    }
  ].filter(
    (
      candidate
    ): candidate is {
      interpretation: string;
      rawValue: string;
      normalized: NormalizedImportPeriod;
    } => Boolean(candidate.normalized)
  );

  if (candidates.length === 0) {
    return null;
  }

  const allPeriods = candidates.map((candidate) => candidate.normalized);
  const compatibleCandidates = candidates.filter((candidate) =>
    arePeriodsCompatible(
      candidate.normalized,
      allPeriods.filter((period) => period !== candidate.normalized)
    )
  );
  const rankingPool = compatibleCandidates.length > 0 ? compatibleCandidates : candidates;
  const bestCandidate = [...rankingPool].sort((left, right) => {
    const specificityDelta =
      getPeriodSpecificityRank(right.normalized) - getPeriodSpecificityRank(left.normalized);

    if (specificityDelta !== 0) {
      return specificityDelta;
    }

    const combinedPreferenceDelta =
      Number(left.interpretation.includes("+")) - Number(right.interpretation.includes("+"));

    if (combinedPreferenceDelta !== 0) {
      return combinedPreferenceDelta;
    }

    return left.rawValue.localeCompare(right.rawValue);
  })[0];

  const moreSpecificAlternatives = candidates.filter(
    (candidate) =>
      candidate !== bestCandidate &&
      getPeriodSpecificityRank(candidate.normalized) >
        getPeriodSpecificityRank(bestCandidate.normalized)
  );

  const notes =
    getPeriodSpecificityRank(bestCandidate.normalized) === 3
      ? `Chose ${bestCandidate.interpretation} because it resolved a month-specific period.`
      : getPeriodSpecificityRank(bestCandidate.normalized) === 2
        ? `Chose ${bestCandidate.interpretation} because it resolved a quarter-specific period.`
        : `Chose ${bestCandidate.interpretation} because only year-level context was available.`;

  return {
    label: bestCandidate.normalized.label,
    periodDate: bestCandidate.normalized.periodDate,
    rawHeaderValueRow1: row1Value,
    rawHeaderValueRow2: row2Value,
    chosenInterpretation: bestCandidate.rawValue || bestCandidate.interpretation,
    usedSecondRow:
      bestCandidate.interpretation === "row 2" ||
      bestCandidate.interpretation === "row 1 + row 2" ||
      bestCandidate.interpretation === "row 2 + row 1",
    notes:
      moreSpecificAlternatives.length === 0
        ? notes
        : `${notes} More specific alternatives were rejected due to conflicting year context.`
  };
}

function buildHeaderDetectionCandidate(
  matrix: StatementMatrixRow[],
  headerRowIndex: number,
  stackedHeaderRowIndex: number | null
): HeaderDetectionCandidate {
  const headerRow = getCells(matrix[headerRowIndex] ?? { sheetRowIndex: -1, cells: [] });
  const stackedHeaderRow =
    stackedHeaderRowIndex !== null
      ? getCells(matrix[stackedHeaderRowIndex] ?? { sheetRowIndex: -1, cells: [] })
      : undefined;

  return {
    headerRowIndex,
    stackedHeaderRowIndex,
    periodColumns: detectPeriodColumns(headerRow, stackedHeaderRow),
    usedSecondStackedHeaderRow: stackedHeaderRowIndex !== null,
    secondRowContributionCount: detectPeriodColumns(headerRow, stackedHeaderRow).filter(
      (column) => column.usedSecondRow
    ).length
  };
}

function getHeaderDetectionCandidates(matrix: StatementMatrixRow[], headerRowIndex: number) {
  const candidates: HeaderDetectionCandidate[] = [];
  const stackedWindowEnd = Math.min(matrix.length - 1, headerRowIndex + 3);

  candidates.push(buildHeaderDetectionCandidate(matrix, headerRowIndex, null));

  for (
    let candidateIndex = headerRowIndex + 1;
    candidateIndex <= stackedWindowEnd;
    candidateIndex += 1
  ) {
    candidates.push(buildHeaderDetectionCandidate(matrix, candidateIndex, null));
    candidates.push(buildHeaderDetectionCandidate(matrix, headerRowIndex, candidateIndex));
  }

  return candidates;
}

function selectBestHeaderDetectionCandidate(candidates: HeaderDetectionCandidate[]) {
  return [...candidates].sort((left, right) => {
    if (right.periodColumns.length !== left.periodColumns.length) {
      return right.periodColumns.length - left.periodColumns.length;
    }

    if (right.secondRowContributionCount !== left.secondRowContributionCount) {
      return right.secondRowContributionCount - left.secondRowContributionCount;
    }

    if (left.usedSecondStackedHeaderRow !== right.usedSecondStackedHeaderRow) {
      return left.usedSecondStackedHeaderRow ? -1 : 1;
    }

    return left.headerRowIndex - right.headerRowIndex;
  })[0];
}

function detectStackedHeaderRowIndex(
  matrix: StatementMatrixRow[],
  headerRowIndex: number,
  periodColumnCount: number
) {
  const candidates = [headerRowIndex - 1, headerRowIndex + 1].filter(
    (index) => index >= 0 && index < matrix.length
  );

  for (const candidateIndex of candidates) {
    const row = getCells(matrix[candidateIndex] ?? { sheetRowIndex: -1, cells: [] });
    const populatedPeriodCells = row
      .slice(1)
      .filter((value) => value.trim().length > 0).length;

    if (populatedPeriodCells >= Math.max(1, Math.min(periodColumnCount, 2))) {
      return candidateIndex;
    }
  }

  return null;
}

function detectPeriodColumns(
  headerRow: string[],
  stackedHeaderRow?: string[]
) {
  const detected: DetectedPeriodColumn[] = [];

  headerRow.forEach((value, columnIndex) => {
    if (columnIndex === 0) {
      return;
    }

    const stackedValue = stackedHeaderRow?.[columnIndex] ?? "";
    const resolved = resolveStackedPeriodColumn(value, stackedValue);

    if (!resolved) {
      return;
    }

    detected.push({
      columnIndex,
      label: resolved.label,
      periodDate: resolved.periodDate,
      rawHeaderValueRow1: resolved.rawHeaderValueRow1,
      rawHeaderValueRow2: resolved.rawHeaderValueRow2,
      chosenInterpretation: resolved.chosenInterpretation,
      usedSecondRow: resolved.usedSecondRow,
      notes: resolved.notes
    });
  });

  return detected;
}

function detectAccountColumn(
  matrix: StatementMatrixRow[],
  headerRowIndex: number,
  periodColumns: DetectedPeriodColumn[]
): AccountColumnCandidate | null {
  const periodColumnIndexes = new Set(periodColumns.map((column) => column.columnIndex));
  const candidateIndexes = new Set<number>();

  matrix.slice(headerRowIndex + 1, headerRowIndex + 15).forEach((row) => {
    row.cells.forEach((_, columnIndex) => {
      if (!periodColumnIndexes.has(columnIndex)) {
        candidateIndexes.add(columnIndex);
      }
    });
  });

  const candidates = Array.from(candidateIndexes).map((columnIndex) => {
    const sampleValues = matrix
      .slice(headerRowIndex + 1)
      .map((row) => row.cells[columnIndex] ?? "")
      .filter((value) => value.trim().length > 0)
      .slice(0, 24);

    if (sampleValues.length === 0) {
      return {
        columnIndex,
        score: -100,
        reason: "Mostly empty column"
      };
    }

    const nonNumericCount = sampleValues.filter((value) => parseAmount(value) === null).length;
    const alphabeticCount = sampleValues.filter((value) => hasAlphabeticCharacters(value)).length;
    const keywordCount = sampleValues.filter((value) => {
      const normalized = normalizeText(value);
      return FINANCIAL_LABEL_KEYWORDS.some((keyword) => normalized.includes(keyword));
    }).length;
    const placeholderCount = sampleValues.filter((value) => isPlaceholderCell(value)).length;
    const uniqueValueCount = new Set(sampleValues.map((value) => normalizeText(value))).size;

    const nonNumericRatio = nonNumericCount / sampleValues.length;
    const alphabeticRatio = alphabeticCount / sampleValues.length;
    const keywordRatio = keywordCount / sampleValues.length;
    const placeholderRatio = placeholderCount / sampleValues.length;
    const uniquenessRatio = uniqueValueCount / sampleValues.length;

    const score =
      nonNumericRatio * 45 +
      alphabeticRatio * 30 +
      keywordRatio * 35 +
      uniquenessRatio * 10 -
      placeholderRatio * 60;

    return {
      columnIndex,
      score,
      reason: `text ${(nonNumericRatio * 100).toFixed(0)}%, alpha ${(alphabeticRatio * 100).toFixed(0)}%, financial keywords ${(keywordRatio * 100).toFixed(0)}%, placeholders ${(placeholderRatio * 100).toFixed(0)}%`
    };
  });

  const viableCandidates = candidates.filter((candidate) => candidate.score > 15);

  if (viableCandidates.length === 0) {
    return null;
  }

  return viableCandidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.columnIndex - right.columnIndex;
  })[0];
}

function detectHeaderRowIndex(matrix: StatementMatrixRow[]) {
  for (let index = 0; index < Math.min(matrix.length, 6); index += 1) {
    const candidates = getHeaderDetectionCandidates(matrix, index);
    const bestCandidate = selectBestHeaderDetectionCandidate(candidates);
    const firstRow = getCells(
      matrix[bestCandidate.headerRowIndex] ?? { sheetRowIndex: -1, cells: [] }
    );
    const firstCell = firstRow[0]?.trim() ?? "";

    if (
      bestCandidate.periodColumns.length >= 2 &&
      (firstCell === "" || !parseAmount(firstCell))
    ) {
      return index;
    }
  }

  return -1;
}

function resolveHeaderDetection(matrix: StatementMatrixRow[]) {
  const scanLimit = Math.min(matrix.length, 6);

  for (let index = 0; index < scanLimit; index += 1) {
    const candidates = getHeaderDetectionCandidates(matrix, index);
    const eligibleCandidates = candidates.filter((candidate) => {
      const firstRow = getCells(
        matrix[candidate.headerRowIndex] ?? { sheetRowIndex: -1, cells: [] }
      );
      const firstCell = firstRow[0]?.trim() ?? "";

      return (
        candidate.periodColumns.length >= 2 &&
        (firstCell === "" || !parseAmount(firstCell))
      );
    });

    if (eligibleCandidates.length === 0) {
      continue;
    }

    const bestCandidate = selectBestHeaderDetectionCandidate(eligibleCandidates);
    const firstRow = getCells(
      matrix[bestCandidate.headerRowIndex] ?? { sheetRowIndex: -1, cells: [] }
    );
    const firstCell = firstRow[0]?.trim() ?? "";

    if (
      bestCandidate.periodColumns.length >= 2 &&
      (firstCell === "" || !parseAmount(firstCell))
    ) {
      return bestCandidate;
    }
  }

  return null;
}

function classifyRow(label: string, amounts: Array<number | null>): RowClassification {
  const hasAmounts = amounts.some((value) => value !== null);
  const hasLabel = label.trim().length > 0;

  if (!hasLabel && !hasAmounts) {
    return "empty";
  }

  if (!hasLabel || isMalformedLabel(label)) {
    return "empty";
  }

  if (!hasAmounts && isHeaderRowLabel(label)) {
    return "header_row";
  }

  if (isRatioLabel(label)) {
    return "ratio";
  }

  if (isPerShareLabel(label)) {
    return "per_share";
  }

  if (isNoteLabel(label)) {
    return "note";
  }

  if (!hasAmounts) {
    return "section";
  }

  if (isTotalLabel(label)) {
    return "total";
  }

  if (isSubtotalLabel(label)) {
    return "subtotal";
  }

  return "line_item";
}

export function isWideStatementFormat(matrix: StatementMatrixRow[]) {
  if (matrix.length < 2) {
    return false;
  }

  const detection = resolveHeaderDetection(matrix);

  if (!detection) {
    return false;
  }
  const { headerRowIndex, periodColumns } = detection;

  if (periodColumns.length < 2) {
    return false;
  }

  const dataRows = matrix.slice(headerRowIndex + 1, headerRowIndex + 8);
  const numericRowCount = dataRows.filter((row) => {
    const cells = getCells(row);
    const amounts = periodColumns.map((column) => parseAmount(cells[column.columnIndex] ?? ""));
    return (cells[0]?.trim() ?? "").length > 0 && amounts.some((value) => value !== null);
  }).length;

  return numericRowCount >= 1;
}

export function parseWideStatementMatrix(matrix: StatementMatrixRow[]): WideStatementNormalizedRow[] {
  return parseWideStatementMatrixWithDiagnostics(matrix).rows;
}

export function parseWideStatementMatrixWithDiagnostics(matrix: StatementMatrixRow[]): {
  rows: WideStatementNormalizedRow[];
  debug: WideStatementParserDebug;
} {
  const detection = resolveHeaderDetection(matrix);

  if (!detection) {
    return {
      rows: [],
      debug: {
        wideFormatDetected: false,
        headerRowIndex: -1,
        stackedHeaderRowIndex: null,
        headerSheetRowIndex: null,
        stackedHeaderSheetRowIndex: null,
        accountColumnIndex: null,
        accountColumnScore: null,
        accountColumnReason: null,
        usedSecondStackedHeaderRow: false,
        detectedPeriodColumns: [],
        chosenStatementType: "unknown",
        classifiedRowCounts: {
          header_row: 0,
          section: 0,
          line_item: 0,
          subtotal: 0,
          total: 0,
          ratio: 0,
          per_share: 0,
          note: 0,
          empty: 0
        }
      }
    };
  }

  const {
    headerRowIndex,
    stackedHeaderRowIndex,
    periodColumns,
    usedSecondStackedHeaderRow
  } = detection;
  const accountColumn = detectAccountColumn(matrix, headerRowIndex, periodColumns);

  if (periodColumns.length < 2) {
    return {
      rows: [],
      debug: {
        wideFormatDetected: false,
        headerRowIndex,
        stackedHeaderRowIndex,
        headerSheetRowIndex: matrix[headerRowIndex]?.sheetRowIndex ?? null,
        stackedHeaderSheetRowIndex:
          stackedHeaderRowIndex !== null
            ? (matrix[stackedHeaderRowIndex]?.sheetRowIndex ?? null)
            : null,
        accountColumnIndex: accountColumn?.columnIndex ?? null,
        accountColumnScore: accountColumn?.score ?? null,
        accountColumnReason: accountColumn?.reason ?? null,
        usedSecondStackedHeaderRow,
        detectedPeriodColumns: [],
        chosenStatementType: "unknown",
        classifiedRowCounts: {
          header_row: 0,
          section: 0,
          line_item: 0,
          subtotal: 0,
          total: 0,
          ratio: 0,
          per_share: 0,
          note: 0,
          empty: 0
        }
      }
    };
  }

  const normalizedRows: WideStatementNormalizedRow[] = [];
  const sectionContext: string[] = [];
  const classifiedRowCounts: Record<RowClassification, number> = {
    header_row: 0,
    section: 0,
    line_item: 0,
    subtotal: 0,
    total: 0,
    ratio: 0,
    per_share: 0,
    note: 0,
    empty: 0
  };
  const statementTypesSeen = new Set<StatementType>();

  matrix.slice(headerRowIndex + 1).forEach((row) => {
    const cells = getCells(row);

    if (!hasNonEmptyValue(cells)) {
      classifiedRowCounts.empty += 1;
      return;
    }

    const label = accountColumn ? cells[accountColumn.columnIndex]?.trim() ?? "" : cells[0]?.trim() ?? "";
    const amounts = periodColumns.map((column) =>
      parseAmount(cells[column.columnIndex] ?? "")
    );
    const classification = classifyRow(label, amounts);
    classifiedRowCounts[classification] += 1;

    if (classification === "empty") {
      return;
    }

    if (classification === "section") {
      if (label) {
        sectionContext.unshift(label);
        if (sectionContext.length > 3) {
          sectionContext.length = 3;
        }
      }
      return;
    }

    if (
      classification === "header_row" ||
      classification === "subtotal" ||
      classification === "total" ||
      classification === "ratio" ||
      classification === "per_share" ||
      classification === "note"
    ) {
      return;
    }

    const statementType = inferStatementTypeFromContext(label, sectionContext);
    statementTypesSeen.add(statementType);

    periodColumns.forEach((column, index) => {
      const amount = amounts[index];

      if (amount === null) {
        return;
      }

      normalizedRows.push({
        account_name: label,
        amount: String(amount),
        period_label: column.label,
        period_date: column.periodDate,
        statement_type: statementType
      });
    });
  });

  return {
    rows: normalizedRows,
      debug: {
        wideFormatDetected: true,
        headerRowIndex,
        stackedHeaderRowIndex,
        headerSheetRowIndex: matrix[headerRowIndex]?.sheetRowIndex ?? null,
        stackedHeaderSheetRowIndex:
          stackedHeaderRowIndex !== null
            ? (matrix[stackedHeaderRowIndex]?.sheetRowIndex ?? null)
            : null,
        accountColumnIndex: accountColumn?.columnIndex ?? null,
        accountColumnScore: accountColumn?.score ?? null,
        accountColumnReason:
          accountColumn
            ? `Selected column ${accountColumn.columnIndex + 1}: ${accountColumn.reason}`
            : "Fell back to first column because no stronger label column was found.",
        usedSecondStackedHeaderRow,
        detectedPeriodColumns: periodColumns.map((column) => ({
          columnIndex: column.columnIndex,
          rawHeaderValueRow1: column.rawHeaderValueRow1,
          rawHeaderValueRow2: column.rawHeaderValueRow2,
          chosenInterpretation: column.chosenInterpretation,
          resolvedPeriodLabel: column.label,
          resolvedPeriodDate: column.periodDate,
          notes: column.notes
        })),
      chosenStatementType:
        statementTypesSeen.size === 0
          ? "unknown"
          : statementTypesSeen.size === 1
            ? Array.from(statementTypesSeen)[0]
            : "mixed",
      classifiedRowCounts
    }
  };
}
