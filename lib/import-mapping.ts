import {
  inferStatementTypeFromCategory,
  isBalanceSheetLeafCategory,
  isBalanceSheetParentCategory,
  normalizeAccountName,
  parseCategory,
  parseStatementType,
  resolveMappingSelection,
  sanitizeCategoryForStatementType,
} from "@/lib/auto-mapping";
import { getCellValue } from "@/lib/import-preview";
import type {
  AccountMapping,
  AuditConfidence,
  AuditMatchedBy,
  NormalizedCategory,
  StatementType
} from "@/lib/types";
import { devLog } from "@/lib/debug";
import type { ImportColumnMapping, RawImportRow } from "@/lib/import-preview";

export type ImportPreviewRow = {
  rowNumber: number;
  accountName: string;
  normalizedLabel: string;
  accountKey: string;
  amountText: string;
  amountValue: number | null;
  sourcePeriodLabel: string;
  sourcePeriodDate: string;
  statementType: StatementType | "";
  category: NormalizedCategory | "";
  addbackFlag: string;
  matchedBy: AuditMatchedBy;
  confidence: AuditConfidence;
  mappingExplanation: string;
  memoryScope?: "company" | "shared" | null;
  needsReview: boolean;
  isExcluded: boolean;
  isNonBlocking: boolean;
  isForcedInclude: boolean;
};

export type ImportAccountReviewRow = {
  accountName: string;
  accountKey: string;
  rowCount: number;
  rowNumbers: number[];
  category: NormalizedCategory | "";
  statementType: StatementType | "";
  matchedBy: AuditMatchedBy;
  confidence: AuditConfidence;
  mappingExplanation: string;
  memoryScope?: "company" | "shared" | null;
  needsReview: boolean;
  hasConflict: boolean;
  sourcePeriodLabels: string[];
  sourcePeriodDates: string[];
  isExcluded: boolean;
  isNonBlocking: boolean;
  isForcedInclude: boolean;
};

export type GroupedImportPreviewRow = {
  accountName: string;
  normalizedLabel: string;
  accountKey: string;
  rowNumbers: number[];
  category: NormalizedCategory | "";
  statementType: StatementType | "";
  matchedBy: AuditMatchedBy;
  confidence: AuditConfidence;
  mappingExplanation: string;
  memoryScope?: "company" | "shared" | null;
  needsReview: boolean;
  isExcluded: boolean;
  isNonBlocking: boolean;
  isForcedInclude: boolean;
  periods: Array<{
    rowNumber: number;
    periodLabel: string;
    periodDate: string;
    amountText: string;
    amountValue: number | null;
  }>;
};

const NON_FINANCIAL_PREVIEW_PATTERNS = [
  "margin",
  "ratio",
  "%",
  "per share",
  "eps",
  "tax rate"
];

const NON_BLOCKING_DERIVED_LABELS = [
  "cost and expenses",
  "gross profit",
  "operating income",
  "income before tax",
  "net income"
];

export function isNonBlockingDerivedLabel(normalizedLabel: string) {
  if (!normalizedLabel) {
    return false;
  }

  return NON_BLOCKING_DERIVED_LABELS.includes(normalizedLabel);
}

function parseImportAmount(value: string) {
  if (value == null) {
    return null;
  }

  const str = String(value).trim();

  if (!str) {
    return null;
  }

  const isNegative = str.includes("(") && str.includes(")");
  const cleaned = str.replace(/[$,]/g, "").replace(/[()]/g, "");
  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return isNegative ? -parsed : parsed;
}

function getImportFieldValue(
  row: RawImportRow,
  selectedKey: string,
  fallbackKeys: string[]
) {
  if (selectedKey) {
    const selectedValue = row[selectedKey];

    if (selectedValue != null && String(selectedValue).trim() !== "") {
      return String(selectedValue).trim();
    }
  }

  for (const key of fallbackKeys) {
    const value = row[key];

    if (value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
}

function severityRank(confidence: AuditConfidence) {
  if (confidence === "low") return 3;
  if (confidence === "medium") return 2;
  return 1;
}

function matchedByRank(matchedBy: AuditMatchedBy) {
  if (matchedBy === "memory") return 5;
  if (matchedBy === "manual") return 4;
  if (matchedBy === "csv_value" || matchedBy === "csv") return 3;
  if (matchedBy === "keyword" || matchedBy === "keyword_rule") return 2;
  return 1;
}

function toPreviewMatchedBy(
  value: "manual" | "memory" | "saved_mapping" | "csv_value" | "keyword_rule" | "unmapped"
): AuditMatchedBy {
  if (value === "keyword_rule") {
    return "keyword_rule";
  }

  if (value === "unmapped") {
    return "manual";
  }

  return value;
}

function isNonFinancialPreviewLabel(accountName: string) {
  const normalized = normalizeAccountName(accountName);

  if (!normalized) {
    return false;
  }

  return NON_FINANCIAL_PREVIEW_PATTERNS.some((pattern) => {
    const normalizedPattern = normalizeAccountName(pattern);

    if (!normalizedPattern) {
      return false;
    }

    if (pattern === "%") {
      return accountName.includes("%");
    }

    return normalized.includes(normalizedPattern);
  });
}

export function buildImportPreviewRows(params: {
  companyId: string | null;
  rows: RawImportRow[];
  columnMapping: ImportColumnMapping;
  savedMappings: AccountMapping[];
  fallbackPeriod?: {
    label: string;
    periodDate: string;
  } | null;
}) {
  const { companyId, rows, columnMapping, savedMappings, fallbackPeriod = null } = params;
  devLog("BUILD IMPORT PREVIEW CALLED", {
    totalRows: rows.length
  });
  const accountNameKey = columnMapping.accountName;
  const amountKey = columnMapping.amount;
  const periodLabelKey = columnMapping.periodLabel;
  const periodDateKey = columnMapping.periodDate;
  const statementTypeKey = columnMapping.statementType;
  const categoryKey = columnMapping.category;
  const acceptedRows: ImportPreviewRow[] = [];

  const builtRows = rows
    .map<ImportPreviewRow | null>((row, index) => {
      const accountName = getImportFieldValue(row, accountNameKey, [
        "Account Name",
        "Account",
        "Line Item",
        "Description"
      ]);
      const amountText = getImportFieldValue(row, amountKey, [
        "Amount",
        "Value",
        "Balance"
      ]);
      const amountValue = parseImportAmount(amountText);
      const sourcePeriodLabel = getImportFieldValue(row, periodLabelKey, [
        "Period Label",
        "Period",
        "Month"
      ]);
      const sourcePeriodDate = getImportFieldValue(row, periodDateKey, [
        "Period Date",
        "Date",
        "Period End"
      ]);
      const sourceStatementType = getImportFieldValue(row, statementTypeKey, [
        "Statement Type",
        "Statement"
      ]);
      const sourceCategory = getImportFieldValue(row, categoryKey, ["Category"]);
      const periodLabel = sourcePeriodLabel || fallbackPeriod?.label || null;
      const periodDate = sourcePeriodDate || fallbackPeriod?.periodDate || null;
      const normalizedLabel = normalizeAccountName(accountName);

      if (index < 3) {
        devLog("ROW EXTRACTION DEBUG", {
          rowIndex: index,
          rawRow: row,
          selectedHeaders: {
            accountName: columnMapping.accountName,
            amount: columnMapping.amount,
            periodLabel: columnMapping.periodLabel,
            periodDate: columnMapping.periodDate,
            statementType: columnMapping.statementType,
            category: columnMapping.category
          },
          extracted: {
            accountName,
            amountText,
            amountValue,
            sourcePeriodLabel,
            sourcePeriodDate,
            sourceStatementType,
            sourceCategory
          },
          validation: {
            hasAccountName: !!accountName,
            hasAmountValue: amountValue !== null,
            hasPeriod: !!(sourcePeriodLabel || sourcePeriodDate)
          }
        });
      }

      if (!accountName) {
        return null;
      }

      if (isNonFinancialPreviewLabel(accountName)) {
        if (index < 3) {
          devLog("POST-VALIDATION DROP", {
            rowIndex: index,
            reason: "nonFinancialLabel",
            accountName,
            normalizedLabel,
            sourceStatementType,
            sourceCategory
          });
        }
        return null;
      }

      if (!accountName) {
        return null;
      }

      if (amountValue === null) {
        return null;
      }

      if (!periodLabel && !periodDate) {
        return null;
      }

      const manualCategory = parseCategory(getCellValue(row, "__manual_category"));
      const manualStatementType = parseStatementType(
        getCellValue(row, "__manual_statement_type")
      );
      const csvCategory = parseCategory(
        sourceCategory
      );
      const csvStatementType = parseStatementType(
        sourceStatementType
      );
      const selection = resolveMappingSelection({
        accountName,
        companyId,
        savedMappings,
        sourceType: "reported_financials",
        preferredStatementType: manualStatementType ?? csvStatementType ?? null,
        manualCategory,
        manualStatementType,
        csvCategory,
        csvStatementType
      });
      const category = selection.category;
      const statementType =
        selection.statementType ?? inferStatementTypeFromCategory(category);
      const sanitizedCategory = sanitizeCategoryForStatementType({
        category,
        statementType
      });
      if (statementType === "balance_sheet") {
        devLog("BALANCE SHEET CATEGORY VALIDATION", {
          accountName,
          incomingCategory: manualCategory ?? csvCategory ?? selection.category ?? null,
          parsedCategory: category,
          statementType,
          isLeaf: isBalanceSheetLeafCategory(category),
          isParent: isBalanceSheetParentCategory(category),
          finalCategory: sanitizedCategory,
          manualCategory,
          csvCategory,
          suggestionCategory: selection.category,
          manualWasParent: isBalanceSheetParentCategory(manualCategory),
          csvWasParent: isBalanceSheetParentCategory(csvCategory)
        });
      }
      const needsReview =
        !accountName ||
        amountValue === null ||
        !sanitizedCategory ||
        !statementType ||
        selection.confidence === "low";

      const previewRow: ImportPreviewRow = {
        rowNumber: index + 1,
        accountName: accountName.trim() || `Row ${index + 1}`,
        normalizedLabel,
        accountKey: normalizedLabel || `row-${index + 1}`,
        amountText,
        amountValue: Number(amountValue ?? amountText ?? 0),
        sourcePeriodLabel: periodLabel ?? "",
        sourcePeriodDate: periodDate ?? "",
        statementType: (statementType ?? "") as StatementType | "",
        category: (sanitizedCategory ?? "") as NormalizedCategory | "",
        addbackFlag:
          getCellValue(row, "__manual_addback_flag") ||
          getCellValue(row, columnMapping.addbackFlag),
        matchedBy: toPreviewMatchedBy(selection.matchedBy),
        confidence: selection.confidence,
        mappingExplanation: selection.explanation,
        memoryScope:
          selection.matchedBy === "memory" ? selection.memoryScope ?? null : null,
        needsReview,
        isExcluded: false,
        isNonBlocking: isNonBlockingDerivedLabel(normalizedLabel),
        isForcedInclude: false
      };

      if (index < 3) {
        devLog("PREVIEW ROW ACCEPTED", {
          rowIndex: index,
          accountName,
          amountValue,
          sourcePeriodLabel: periodLabel,
          sourcePeriodDate: periodDate
        });
      }

      acceptedRows.push(previewRow);

      return previewRow;
    })
    .filter((row): row is ImportPreviewRow => Boolean(row));

  devLog("PREVIEW VALIDATION SUMMARY", {
    totalRows: rows.length,
    validRowsBeforeGrouping: builtRows.length,
    firstAcceptedRow: acceptedRows[0] ?? null
  });

  return builtRows;
}

export function buildImportAccountReviewRows(previewRows: ImportPreviewRow[]) {
  const grouped = new Map<string, ImportPreviewRow[]>();

  previewRows.forEach((row) => {
    const current = grouped.get(row.accountKey) ?? [];
    current.push(row);
    grouped.set(row.accountKey, current);
  });

  return Array.from(grouped.values())
    .map<ImportAccountReviewRow>((rows) => {
      const sortedRows = [...rows].sort((left, right) => {
        const confidenceDelta =
          severityRank(right.confidence) - severityRank(left.confidence);

        if (confidenceDelta !== 0) {
          return confidenceDelta;
        }

        return matchedByRank(right.matchedBy) - matchedByRank(left.matchedBy);
      });
      const primaryRow = sortedRows[0];
      const uniqueMappings = new Set(
        rows.map((row) => `${row.category || "none"}::${row.statementType || "none"}`)
      );
      const sourcePeriodLabels = Array.from(
        new Set(rows.map((row) => row.sourcePeriodLabel).filter(Boolean))
      );
      const sourcePeriodDates = Array.from(
        new Set(rows.map((row) => row.sourcePeriodDate).filter(Boolean))
      );

      return {
        accountName: primaryRow.accountName,
        accountKey: primaryRow.accountKey,
        rowCount: rows.length,
        rowNumbers: rows.map((row) => row.rowNumber),
        category: primaryRow.category,
        statementType: primaryRow.statementType,
        matchedBy: primaryRow.matchedBy,
        confidence: primaryRow.confidence,
        mappingExplanation: primaryRow.mappingExplanation,
        memoryScope: primaryRow.memoryScope ?? null,
        needsReview: rows.some((row) => row.needsReview) || uniqueMappings.size > 1,
        hasConflict: uniqueMappings.size > 1,
        sourcePeriodLabels,
        sourcePeriodDates,
        isExcluded: rows.every((row) => row.isExcluded),
        isNonBlocking: rows.every((row) => row.isNonBlocking),
        isForcedInclude: rows.some((row) => row.isForcedInclude)
      };
    })
    .sort((left, right) => {
      if (left.needsReview !== right.needsReview) {
        return left.needsReview ? -1 : 1;
      }

      if (left.hasConflict !== right.hasConflict) {
        return left.hasConflict ? -1 : 1;
      }

      const confidenceDelta =
        severityRank(right.confidence) - severityRank(left.confidence);

      if (confidenceDelta !== 0) {
        return confidenceDelta;
      }

      return left.accountName.localeCompare(right.accountName);
    });
}

export function buildGroupedImportPreviewRows(previewRows: ImportPreviewRow[]) {
  const grouped = new Map<string, ImportPreviewRow[]>();

  const rowsEligibleForGrouping = previewRows.filter(
    (row) =>
      Boolean(row.accountName.trim()) &&
      row.amountValue !== null &&
      Boolean(row.sourcePeriodLabel || row.sourcePeriodDate)
  );

  rowsEligibleForGrouping.forEach((row) => {
    const key =
      row.normalizedLabel ||
      row.accountName.trim() ||
      `row-${row.rowNumber}`;
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  });

  return Array.from(grouped.values())
    .map<GroupedImportPreviewRow>((rows) => {
      const sortedRows = [...rows].sort((left, right) => left.rowNumber - right.rowNumber);
      const primaryRow = [...rows].sort((left, right) => {
        const confidenceDelta =
          severityRank(right.confidence) - severityRank(left.confidence);

        if (confidenceDelta !== 0) {
          return confidenceDelta;
        }

        return matchedByRank(right.matchedBy) - matchedByRank(left.matchedBy);
      })[0];

      return {
        accountName: primaryRow.accountName,
        normalizedLabel: primaryRow.normalizedLabel,
        accountKey: primaryRow.accountKey,
        rowNumbers: sortedRows.map((row) => row.rowNumber),
        category: primaryRow.category,
        statementType: primaryRow.statementType,
        matchedBy: primaryRow.matchedBy,
        confidence: primaryRow.confidence,
        mappingExplanation: primaryRow.mappingExplanation,
        memoryScope: primaryRow.memoryScope ?? null,
        needsReview: rows.some((row) => row.needsReview),
        isExcluded: rows.every((row) => row.isExcluded),
        isNonBlocking: rows.every((row) => row.isNonBlocking),
        isForcedInclude: rows.some((row) => row.isForcedInclude),
        periods: sortedRows.map((row) => ({
          rowNumber: row.rowNumber,
          periodLabel: row.sourcePeriodLabel,
          periodDate: row.sourcePeriodDate,
          amountText: row.amountText,
          amountValue: row.amountValue
        }))
      };
    })
    .sort((left, right) => {
      if (left.needsReview !== right.needsReview) {
        return left.needsReview ? -1 : 1;
      }

      return left.accountName.localeCompare(right.accountName);
    });
}
