import { normalizeImportedPeriod } from "@/lib/import-periods";
import type { StatementType } from "@/lib/types";

export type WideStatementNormalizedRow = {
  account_name: string;
  amount: string;
  period_label: string;
  period_date: string;
  statement_type: StatementType;
};

type DetectedPeriodColumn = {
  columnIndex: number;
  label: string;
  periodDate: string;
};

type RowClassification = "section" | "line_item" | "subtotal" | "empty";

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

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function hasNonEmptyValue(values: string[]) {
  return values.some((value) => value.trim().length > 0);
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

function isSubtotalLabel(label: string) {
  const normalized = normalizeText(label);

  return (
    normalized.includes("total") ||
    normalized.includes("subtotal") ||
    normalized.includes("gross profit") ||
    normalized.includes("operating income") ||
    normalized.includes("ebitda") ||
    normalized.includes("net income") ||
    normalized.includes("working capital")
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

function detectPeriodColumns(headerRow: string[]) {
  const detected: DetectedPeriodColumn[] = [];

  headerRow.forEach((value, columnIndex) => {
    if (columnIndex === 0) {
      return;
    }

    const normalized = normalizeImportedPeriod({
      periodLabel: value,
      periodDate: value
    });

    if (!normalized) {
      return;
    }

    detected.push({
      columnIndex,
      label: normalized.label,
      periodDate: normalized.periodDate
    });
  });

  return detected;
}

function detectHeaderRowIndex(matrix: string[][]) {
  for (let index = 0; index < Math.min(matrix.length, 6); index += 1) {
    const row = matrix[index] ?? [];
    const firstCell = row[0]?.trim() ?? "";
    const periodColumns = detectPeriodColumns(row);

    if (periodColumns.length >= 2 && (firstCell === "" || !parseAmount(firstCell))) {
      return index;
    }
  }

  return -1;
}

function classifyRow(label: string, amounts: Array<number | null>): RowClassification {
  const hasAmounts = amounts.some((value) => value !== null);
  const hasLabel = label.trim().length > 0;

  if (!hasLabel && !hasAmounts) {
    return "empty";
  }

  if (!hasAmounts) {
    return "section";
  }

  if (isSubtotalLabel(label)) {
    return "subtotal";
  }

  return "line_item";
}

export function isWideStatementFormat(matrix: string[][]) {
  if (matrix.length < 2) {
    return false;
  }

  const headerRowIndex = detectHeaderRowIndex(matrix);

  if (headerRowIndex === -1) {
    return false;
  }

  const periodColumns = detectPeriodColumns(matrix[headerRowIndex] ?? []);

  if (periodColumns.length < 2) {
    return false;
  }

  const dataRows = matrix.slice(headerRowIndex + 1, headerRowIndex + 8);
  const numericRowCount = dataRows.filter((row) => {
    const amounts = periodColumns.map((column) => parseAmount(row[column.columnIndex] ?? ""));
    return (row[0]?.trim() ?? "").length > 0 && amounts.some((value) => value !== null);
  }).length;

  return numericRowCount >= 1;
}

export function parseWideStatementMatrix(matrix: string[][]): WideStatementNormalizedRow[] {
  const headerRowIndex = detectHeaderRowIndex(matrix);

  if (headerRowIndex === -1) {
    return [];
  }

  const headerRow = matrix[headerRowIndex] ?? [];
  const periodColumns = detectPeriodColumns(headerRow);

  if (periodColumns.length < 2) {
    return [];
  }

  const normalizedRows: WideStatementNormalizedRow[] = [];
  const sectionContext: string[] = [];

  matrix.slice(headerRowIndex + 1).forEach((row) => {
    if (!hasNonEmptyValue(row)) {
      return;
    }

    const label = row[0]?.trim() ?? "";
    const amounts = periodColumns.map((column) => parseAmount(row[column.columnIndex] ?? ""));
    const classification = classifyRow(label, amounts);

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

    if (classification === "subtotal") {
      return;
    }

    const statementType = inferStatementTypeFromContext(label, sectionContext);

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

  return normalizedRows;
}
