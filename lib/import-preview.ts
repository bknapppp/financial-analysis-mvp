import Papa from "papaparse";
import { devLog } from "./debug.ts";
import { normalizeImportedPeriod, type NormalizedImportPeriod } from "./import-periods.ts";
import {
  parseWideStatementMatrixWithDiagnostics,
  type StatementMatrixRow,
  type WideStatementParserDebug
} from "./statement-parser.ts";

export type ImportFileKind = "csv" | "xlsx";

export type ImportFieldKey =
  | "accountName"
  | "amount"
  | "periodLabel"
  | "periodDate"
  | "statementType"
  | "category"
  | "addbackFlag";

export type ImportColumnMapping = Record<ImportFieldKey, string>;

export type RawImportRow = Record<string, string>;

export type SheetClassificationStatus =
  | "likely_income_statement"
  | "likely_balance_sheet"
  | "likely_cash_flow"
  | "needs_review";

export type SheetPeriodStructure =
  | "annual"
  | "monthly"
  | "quarterly"
  | "ttm"
  | "mixed"
  | "unknown";

export type SheetColumnStructure = "wide" | "long" | "unknown";

export type ParsedSheetClassification = {
  statementType: "income_statement" | "balance_sheet" | "cash_flow" | "unknown";
  status: SheetClassificationStatus;
  label:
    | "Likely income statement"
    | "Likely balance sheet"
    | "Likely cash flow"
    | "Needs review";
  confidenceLabel: "High confidence" | "Medium confidence" | "Needs review";
  matchedPatterns: string[];
  explanation: string;
  incomeScore: number;
  balanceSheetScore: number;
  cashFlowScore: number;
};

export type ParsedSheetPeriodDetection = {
  structure: SheetPeriodStructure;
  label:
    | "Annual periods"
    | "Monthly periods"
    | "Quarterly periods"
    | "TTM present"
    | "Mixed periods"
    | "Needs review";
  periods: Array<{
    label: string;
    periodDate: string;
    granularity: NormalizedImportPeriod["granularity"];
  }>;
  headerRowIndex: number | null;
  ttmHeaders: string[];
  explanation: string;
};

export type ParsedImportSheetAnalysis = {
  classification: ParsedSheetClassification;
  periodDetection: ParsedSheetPeriodDetection;
  columnStructure: {
    type: SheetColumnStructure;
    label: "Wide columns" | "Long rows" | "Needs review";
    explanation: string;
  };
  likelyLineItemRowNumbers: number[];
  likelyFinancialLineItemHints: string[];
  previewRowCount: number;
};

export type WorkbookImportContext = {
  fileName: string;
  fileKind: ImportFileKind;
  selectedSheetName: string;
  selectedSheetClassification: ParsedSheetClassification;
  selectedSheetPeriodDetection: ParsedSheetPeriodDetection;
  selectedSheetColumnStructure: ParsedImportSheetAnalysis["columnStructure"];
};

export type ParsedImportSheet = {
  name: string;
  headers: string[];
  rows: RawImportRow[];
  analysis: ParsedImportSheetAnalysis;
  debug?: {
    wideStatement?: WideStatementParserDebug;
  };
};

export type ParsedImportFile = {
  kind: ImportFileKind;
  fileName: string;
  sheets: ParsedImportSheet[];
};

const HEADER_CANDIDATES: Record<ImportFieldKey, string[]> = {
  accountName: ["account", "name", "description", "line item", "gl account"],
  amount: ["amount", "value", "balance", "total", "actual"],
  periodLabel: ["period", "month", "label"],
  periodDate: ["date", "period end", "as of"],
  statementType: ["statement", "type"],
  category: ["category", "class"],
  addbackFlag: ["addback", "add-back", "adjustment"]
};

const INCOME_STATEMENT_PATTERNS = [
  "revenue",
  "sales",
  "net sales",
  "gross profit",
  "cost of goods sold",
  "cogs",
  "operating expenses",
  "selling general administrative",
  "sga",
  "ebitda",
  "operating income",
  "pretax",
  "pre tax",
  "net income"
];

const BALANCE_SHEET_PATTERNS = [
  "cash",
  "accounts receivable",
  "receivables",
  "inventory",
  "prepaid",
  "fixed assets",
  "property plant equipment",
  "ppe",
  "accounts payable",
  "accrued liabilities",
  "debt",
  "borrowings",
  "liabilities",
  "equity",
  "retained earnings",
  "working capital"
];

const CASH_FLOW_PATTERNS = [
  "cash flow",
  "operating activities",
  "investing activities",
  "financing activities",
  "net cash provided",
  "net cash used",
  "capital expenditures",
  "change in cash",
  "cash from operations"
];

const LINE_ITEM_PATTERNS = [
  ...INCOME_STATEMENT_PATTERNS,
  ...BALANCE_SHEET_PATTERNS,
  ...CASH_FLOW_PATTERNS
];
const TTM_PATTERN = /\bttm\b|trailing\s+twelve\s+months|last\s+twelve\s+months/i;

function sanitizeHeader(value: string, index: number) {
  const trimmed = value.trim();
  return trimmed || `Column ${index + 1}`;
}

function dedupeHeaders(headers: string[]) {
  const counts = new Map<string, number>();

  return headers.map((header) => {
    const current = counts.get(header) ?? 0;
    counts.set(header, current + 1);

    if (current === 0) {
      return header;
    }

    return `${header} (${current + 1})`;
  });
}

function hasNonEmptyValue(values: string[]) {
  return values.some((value) => value.trim().length > 0);
}

function coerceExcelCellValue(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "object") {
    const maybeRichText = value as { richText?: Array<{ text?: string }> };
    if (Array.isArray(maybeRichText.richText)) {
      return maybeRichText.richText.map((part) => part.text ?? "").join("").trim();
    }

    const maybeText = value as { text?: string; result?: unknown };
    if (typeof maybeText.text === "string") {
      return maybeText.text.trim();
    }

    if (maybeText.result != null) {
      return String(maybeText.result).trim();
    }
  }

  return String(value).trim();
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function includesPattern(value: string, pattern: string) {
  return normalizeText(value).includes(normalizeText(pattern));
}

function detectHeaderRowIndex(matrix: StatementMatrixRow[]) {
  const candidateRows = matrix.slice(0, 10);
  let bestRowIndex: number | null = null;
  let bestScore = -1;

  candidateRows.forEach((row) => {
    let periodHits = 0;
    let keywordHits = 0;

    row.cells.forEach((cell) => {
      if (normalizeImportedPeriod({ periodLabel: cell })) {
        periodHits += 1;
      }

      if (TTM_PATTERN.test(cell)) {
        periodHits += 1;
      }

      if (
        HEADER_CANDIDATES.accountName.some((candidate) =>
          includesPattern(cell, candidate)
        )
      ) {
        keywordHits += 1;
      }
    });

    const nonEmptyCount = row.cells.filter((cell) => cell.trim().length > 0).length;
    const score = periodHits * 5 + keywordHits * 3 + nonEmptyCount;

    if (score > bestScore) {
      bestScore = score;
      bestRowIndex = row.sheetRowIndex;
    }
  });

  return bestRowIndex;
}

function classifySheet(matrix: StatementMatrixRow[], rows: RawImportRow[]) {
  const matchedPatterns = new Set<string>();
  let incomeScore = 0;
  let balanceSheetScore = 0;
  let cashFlowScore = 0;

  rows.slice(0, 40).forEach((row) => {
    const firstValue =
      Object.values(row).find((value) => String(value ?? "").trim().length > 0) ?? "";
    const normalized = normalizeText(String(firstValue));

    if (!normalized) {
      return;
    }

    INCOME_STATEMENT_PATTERNS.forEach((pattern) => {
      if (normalized.includes(normalizeText(pattern))) {
        incomeScore += 1;
        matchedPatterns.add(pattern);
      }
    });

    BALANCE_SHEET_PATTERNS.forEach((pattern) => {
      if (normalized.includes(normalizeText(pattern))) {
        balanceSheetScore += 1;
        matchedPatterns.add(pattern);
      }
    });

    CASH_FLOW_PATTERNS.forEach((pattern) => {
      if (normalized.includes(normalizeText(pattern))) {
        cashFlowScore += 1;
        matchedPatterns.add(pattern);
      }
    });
  });

  matrix.slice(0, 6).forEach((row) => {
    row.cells.forEach((cell) => {
      if (/income statement|profit and loss|p&l/i.test(cell)) {
        incomeScore += 3;
        matchedPatterns.add(cell.trim());
      }

      if (/balance sheet|statement of financial position/i.test(cell)) {
        balanceSheetScore += 3;
        matchedPatterns.add(cell.trim());
      }

      if (/cash flow|cash flows|statement of cash flows/i.test(cell)) {
        cashFlowScore += 3;
        matchedPatterns.add(cell.trim());
      }
    });
  });

  const scores = [
    { type: "income_statement" as const, score: incomeScore },
    { type: "balance_sheet" as const, score: balanceSheetScore },
    { type: "cash_flow" as const, score: cashFlowScore }
  ].sort((left, right) => right.score - left.score);
  const leading = scores[0];
  const runnerUp = scores[1];
  const difference = (leading?.score ?? 0) - (runnerUp?.score ?? 0);

  if (leading?.type === "income_statement" && incomeScore >= 3 && difference >= 2) {
    return {
      statementType: "income_statement" as const,
      status: "likely_income_statement" as const,
      label: "Likely income statement" as const,
      confidenceLabel: incomeScore >= 6 ? "High confidence" as const : "Medium confidence" as const,
      matchedPatterns: Array.from(matchedPatterns).slice(0, 6),
      explanation: `Matched ${incomeScore} income-statement cues versus ${balanceSheetScore} balance-sheet and ${cashFlowScore} cash-flow cues.`,
      incomeScore,
      balanceSheetScore,
      cashFlowScore
    };
  }

  if (leading?.type === "balance_sheet" && balanceSheetScore >= 3 && difference >= 2) {
    return {
      statementType: "balance_sheet" as const,
      status: "likely_balance_sheet" as const,
      label: "Likely balance sheet" as const,
      confidenceLabel:
        balanceSheetScore >= 6 ? "High confidence" as const : "Medium confidence" as const,
      matchedPatterns: Array.from(matchedPatterns).slice(0, 6),
      explanation: `Matched ${balanceSheetScore} balance-sheet cues versus ${incomeScore} income-statement and ${cashFlowScore} cash-flow cues.`,
      incomeScore,
      balanceSheetScore,
      cashFlowScore
    };
  }

  if (leading?.type === "cash_flow" && cashFlowScore >= 3 && difference >= 2) {
    return {
      statementType: "cash_flow" as const,
      status: "likely_cash_flow" as const,
      label: "Likely cash flow" as const,
      confidenceLabel: cashFlowScore >= 6 ? "High confidence" as const : "Medium confidence" as const,
      matchedPatterns: Array.from(matchedPatterns).slice(0, 6),
      explanation: `Matched ${cashFlowScore} cash-flow cues versus ${incomeScore} income-statement and ${balanceSheetScore} balance-sheet cues.`,
      incomeScore,
      balanceSheetScore,
      cashFlowScore
    };
  }

  return {
    statementType: "unknown" as const,
    status: "needs_review" as const,
    label: "Needs review" as const,
    confidenceLabel: "Needs review" as const,
    matchedPatterns: Array.from(matchedPatterns).slice(0, 6),
    explanation: `Matched ${incomeScore} income-statement, ${balanceSheetScore} balance-sheet, and ${cashFlowScore} cash-flow cues, which is not decisive.`,
    incomeScore,
    balanceSheetScore,
    cashFlowScore
  };
}

function detectSheetPeriods(matrix: StatementMatrixRow[]) {
  const headerRowIndex = detectHeaderRowIndex(matrix);
  const candidateRows = matrix.filter((row) =>
    headerRowIndex === null ? row.sheetRowIndex <= 10 : row.sheetRowIndex <= headerRowIndex + 1
  );
  const periods = new Map<string, ParsedSheetPeriodDetection["periods"][number]>();
  const ttmHeaders = new Set<string>();

  candidateRows.forEach((row) => {
    row.cells.forEach((cell) => {
      const trimmed = cell.trim();

      if (!trimmed) {
        return;
      }

      if (TTM_PATTERN.test(trimmed)) {
        ttmHeaders.add(trimmed);
      }

      const normalized = normalizeImportedPeriod({ periodLabel: trimmed });
      if (!normalized) {
        return;
      }

      periods.set(normalized.key, {
        label: normalized.label,
        periodDate: normalized.periodDate,
        granularity: normalized.granularity
      });
    });
  });

  const detectedPeriods = Array.from(periods.values()).sort((left, right) =>
    left.periodDate.localeCompare(right.periodDate)
  );
  const granularities = new Set(detectedPeriods.map((period) => period.granularity));
  let structure: SheetPeriodStructure = "unknown";
  let label: ParsedSheetPeriodDetection["label"] = "Needs review";

  if (ttmHeaders.size > 0 && detectedPeriods.length === 0) {
    structure = "ttm";
    label = "TTM present";
  } else if (ttmHeaders.size > 0) {
    structure = "mixed";
    label = "Mixed periods";
  } else if (granularities.size === 1) {
    const onlyGranularity = detectedPeriods[0]?.granularity ?? "year";
    if (onlyGranularity === "year") {
      structure = "annual";
      label = "Annual periods";
    } else if (onlyGranularity === "month") {
      structure = "monthly";
      label = "Monthly periods";
    } else if (onlyGranularity === "quarter") {
      structure = "quarterly";
      label = "Quarterly periods";
    }
  } else if (granularities.size > 1) {
    structure = "mixed";
    label = "Mixed periods";
  }

  const explanation =
    structure === "unknown"
      ? "No clear period headers were detected in the top rows."
      : structure === "ttm"
        ? "TTM labeling was detected in the candidate header rows."
        : structure === "mixed"
          ? "More than one period style was detected in the candidate header rows."
          : `Detected ${label.toLowerCase()} from likely header rows.`;

  return {
    structure,
    label,
    periods: detectedPeriods.slice(0, 8),
    headerRowIndex,
    ttmHeaders: Array.from(ttmHeaders).slice(0, 4),
    explanation
  };
}

function detectLikelyLineItemRowNumbers(rows: RawImportRow[]) {
  return rows
    .map((row, index) => {
      const firstValue =
        Object.values(row).find((value) => String(value ?? "").trim().length > 0) ?? "";
      const normalized = normalizeText(String(firstValue));

      if (!normalized) {
        return null;
      }

      const matched = LINE_ITEM_PATTERNS.some((pattern) =>
        normalized.includes(normalizeText(pattern))
      );

      return matched ? index + 1 : null;
    })
    .filter((value): value is number => value !== null);
}

function detectLikelyFinancialLineItemHints(rows: RawImportRow[]) {
  const hints = new Set<string>();

  rows.slice(0, 40).forEach((row) => {
    const firstValue =
      Object.values(row).find((value) => String(value ?? "").trim().length > 0) ?? "";
    const trimmed = String(firstValue).trim();
    const normalized = normalizeText(trimmed);

    if (!normalized) {
      return;
    }

    const matched = LINE_ITEM_PATTERNS.some((pattern) =>
      normalized.includes(normalizeText(pattern))
    );

    if (matched) {
      hints.add(trimmed);
    }
  });

  return Array.from(hints).slice(0, 8);
}

function detectColumnStructure(params: {
  headers: string[];
  rows: RawImportRow[];
  wideFormatDetected: boolean;
}) {
  const { headers, rows, wideFormatDetected } = params;

  if (wideFormatDetected) {
    return {
      type: "wide" as const,
      label: "Wide columns" as const,
      explanation:
        "Period values were spread across columns and normalized into the long-form preview shape."
    };
  }

  const normalizedHeaders = headers.map((header) => normalizeText(header));
  const hasAccountHeader = normalizedHeaders.some((header) =>
    HEADER_CANDIDATES.accountName.some((candidate) => header.includes(normalizeText(candidate)))
  );
  const hasAmountHeader = normalizedHeaders.some((header) =>
    HEADER_CANDIDATES.amount.some((candidate) => header.includes(normalizeText(candidate)))
  );
  const hasPeriodHeader = normalizedHeaders.some((header) =>
    HEADER_CANDIDATES.periodLabel
      .concat(HEADER_CANDIDATES.periodDate)
      .some((candidate) => header.includes(normalizeText(candidate)))
  );

  if (hasAccountHeader && hasAmountHeader && hasPeriodHeader && rows.length > 0) {
    return {
      type: "long" as const,
      label: "Long rows" as const,
      explanation:
        "The sheet already resembles row-based import columns with account, amount, and period fields."
    };
  }

  return {
    type: "unknown" as const,
    label: "Needs review" as const,
    explanation:
      "The sheet structure was parseable, but the column pattern was not decisive enough to label as wide or long."
  };
}

function analyzeSheet(params: {
  matrix: StatementMatrixRow[];
  rows: RawImportRow[];
  headers: string[];
  wideFormatDetected?: boolean;
}): ParsedImportSheetAnalysis {
  const { matrix, rows, headers, wideFormatDetected = false } = params;

  return {
    classification: classifySheet(matrix, rows),
    periodDetection: detectSheetPeriods(matrix),
    columnStructure: detectColumnStructure({ headers, rows, wideFormatDetected }),
    likelyLineItemRowNumbers: detectLikelyLineItemRowNumbers(rows),
    likelyFinancialLineItemHints: detectLikelyFinancialLineItemHints(rows),
    previewRowCount: Math.min(rows.length, 25)
  };
}

export function buildSheetAnalysisForTest(params: {
  matrix: StatementMatrixRow[];
  rows: RawImportRow[];
  headers?: string[];
  wideFormatDetected?: boolean;
}) {
  return analyzeSheet({
    matrix: params.matrix,
    rows: params.rows,
    headers:
      params.headers ??
      Object.keys(params.rows[0] ?? {}).filter(Boolean),
    wideFormatDetected: params.wideFormatDetected ?? false
  });
}

function buildRowsFromMatrix(matrix: StatementMatrixRow[]) {
  if (matrix.length === 0) {
    return {
      headers: [],
      rows: [] as RawImportRow[],
      analysis: analyzeSheet({ matrix, rows: [], headers: [] }),
      debug: undefined as ParsedImportSheet["debug"]
    };
  }

  const { rows: normalizedRows, debug } = parseWideStatementMatrixWithDiagnostics(matrix);
  const wideFormatDetected = debug.wideFormatDetected && normalizedRows.length > 0;

  if (wideFormatDetected) {
    const transformedRows = normalizedRows.map((row) => ({
      "Account Name": row.account_name,
      Amount: row.amount,
      "Period Label": row.period_label,
      "Period Date": row.period_date,
      "Statement Type": row.statement_type
    }));

    devLog("IMPORT FORMAT DETECTED", {
      format: "wide",
      reason:
        "Wide-format table detected and transformed into the internal long-format row shape before preview rendering.",
      headerRowIndex: debug.headerRowIndex,
      accountColumnIndex: debug.accountColumnIndex,
      periodColumns: debug.detectedPeriodColumns.map((column) => ({
        columnIndex: column.columnIndex,
        label: column.resolvedPeriodLabel,
        periodDate: column.resolvedPeriodDate
      })),
      transformedRowsGenerated: transformedRows.length,
      sampleTransformedRow: transformedRows[0] ?? null
    });
    const headers = [
      "Account Name",
      "Amount",
      "Period Label",
      "Period Date",
      "Statement Type"
    ];

    return {
      headers,
      rows: transformedRows,
      analysis: analyzeSheet({
        matrix,
        rows: transformedRows,
        headers,
        wideFormatDetected: true
      }),
      debug: {
        wideStatement: debug
      }
    };
  }

  devLog("IMPORT FORMAT DETECTED", {
    format: "existing-long-format",
    reason:
      "Wide-format transformation was not applied, so the existing long-format parser remains the default path.",
    headerRowIndex: debug.headerRowIndex,
    accountColumnIndex: debug.accountColumnIndex,
    periodColumns: debug.detectedPeriodColumns.map((column) => ({
      columnIndex: column.columnIndex,
      label: column.resolvedPeriodLabel,
      periodDate: column.resolvedPeriodDate
    })),
    transformedRowsGenerated: 0
  });

  const headers = dedupeHeaders(
    matrix[0].cells.map((header, index) => sanitizeHeader(header, index))
  );
  const rows = matrix
    .slice(1)
    .map((matrixRow) => {
      const row: RawImportRow = {};
      const cells = matrixRow.cells;

      headers.forEach((header, index) => {
        row[header] = (cells[index] ?? "").trim();
      });

      return row;
    })
    .filter((row) => hasNonEmptyValue(Object.values(row)));

  return {
    headers,
    rows,
    analysis: analyzeSheet({ matrix, rows, headers, wideFormatDetected: false }),
    debug: undefined
  };
}

export function getCellValue(row: RawImportRow, key: string) {
  if (!key) {
    return "";
  }

  return String(row[key] ?? "").trim();
}

export function buildInitialColumnMapping(headers: string[]): ImportColumnMapping {
  const findMatch = (field: ImportFieldKey) =>
    headers.find((header) =>
      HEADER_CANDIDATES[field].some((candidate) =>
        header.toLowerCase().includes(candidate)
      )
    ) ?? "";

  return {
    accountName: findMatch("accountName"),
    amount: findMatch("amount"),
    periodLabel: findMatch("periodLabel"),
    periodDate: findMatch("periodDate"),
    statementType: findMatch("statementType"),
    category: findMatch("category"),
    addbackFlag: findMatch("addbackFlag")
  };
}

async function parseCsvImportFile(file: File): Promise<ParsedImportFile> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        const parsedRows = results.data
          .map((row) => {
            const cleanedRow: RawImportRow = {};

            Object.entries(row).forEach(([key, value]) => {
              if (key === "__parsed_extra") {
                return;
              }

              cleanedRow[key.trim()] = String(value ?? "").trim();
            });

            return cleanedRow;
          })
          .filter((row) => hasNonEmptyValue(Object.values(row)));
        const rawHeaders = (results.meta.fields ?? []).filter(
          (field): field is string => Boolean(field)
        );
        const headers =
          rawHeaders.length > 0
            ? dedupeHeaders(
                rawHeaders.map((header, index) => sanitizeHeader(header, index))
              )
            : Object.keys(parsedRows[0] ?? {});

        if (headers.length === 0) {
          reject(new Error("The uploaded CSV did not contain usable headers."));
          return;
        }

        const matrix: StatementMatrixRow[] = [
          { sheetRowIndex: 1, cells: headers },
          ...parsedRows.map((row, index) => ({
            sheetRowIndex: index + 2,
            cells: headers.map((header) => row[header] ?? "")
          }))
        ];

        resolve({
          kind: "csv",
          fileName: file.name,
          sheets: [
            {
              name: "CSV import",
              headers,
              rows: parsedRows,
              analysis: analyzeSheet({
                matrix,
                rows: parsedRows,
                headers,
                wideFormatDetected: false
              })
            }
          ]
        });
      },
      error: () => {
        reject(new Error("The uploaded CSV could not be parsed."));
      }
    });
  });
}

async function parseExcelImportFile(file: File): Promise<ParsedImportFile> {
  const ExcelJs = await import("exceljs");
  const workbook = new ExcelJs.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const sheets: ParsedImportSheet[] = [];

  workbook.worksheets.forEach((worksheet) => {
    const matrix: StatementMatrixRow[] = [];
    const columnCount = Math.max(worksheet.columnCount, worksheet.actualColumnCount);

    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.from({ length: Math.max(columnCount, row.cellCount) }, (_, index) =>
        coerceExcelCellValue(row.getCell(index + 1).value)
      );

      if (hasNonEmptyValue(values)) {
        matrix.push({
          sheetRowIndex: row.number,
          cells: values
        });
      }
    });

    const { headers, rows, analysis, debug } = buildRowsFromMatrix(matrix);

    if (headers.length > 0) {
      sheets.push({
        name: worksheet.name,
        headers,
        rows,
        analysis,
        debug
      });
    }
  });

  if (sheets.length === 0) {
    throw new Error("The uploaded workbook did not contain any usable sheets.");
  }

  return {
    kind: "xlsx",
    fileName: file.name,
    sheets
  };
}

export async function parseImportFile(file: File): Promise<ParsedImportFile> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".csv")) {
    return parseCsvImportFile(file);
  }

  if (lowerName.endsWith(".xlsx")) {
    return parseExcelImportFile(file);
  }

  throw new Error("Only .csv and .xlsx files are supported.");
}
