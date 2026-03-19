import {
  inferStatementTypeFromCategory,
  normalizeAccountName,
  parseCategory,
  parseStatementType,
  suggestAccountMapping
} from "@/lib/auto-mapping";
import { getPreviewMappingMeta } from "@/lib/mapping-intelligence";
import { getCellValue } from "@/lib/import-preview";
import type {
  AccountMapping,
  AuditConfidence,
  AuditMatchedBy,
  NormalizedCategory,
  StatementType
} from "@/lib/types";
import type { ImportColumnMapping, RawImportRow } from "@/lib/import-preview";

export type ImportPreviewRow = {
  rowNumber: number;
  accountName: string;
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
  needsReview: boolean;
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
  needsReview: boolean;
  hasConflict: boolean;
  sourcePeriodLabels: string[];
  sourcePeriodDates: string[];
};

function severityRank(confidence: AuditConfidence) {
  if (confidence === "low") return 3;
  if (confidence === "medium") return 2;
  return 1;
}

function matchedByRank(matchedBy: AuditMatchedBy) {
  if (matchedBy === "manual") return 4;
  if (matchedBy === "csv_value" || matchedBy === "csv") return 3;
  if (matchedBy === "keyword" || matchedBy === "keyword_rule") return 2;
  return 1;
}

export function buildImportPreviewRows(params: {
  rows: RawImportRow[];
  columnMapping: ImportColumnMapping;
  savedMappings: AccountMapping[];
}) {
  const { rows, columnMapping, savedMappings } = params;

  return rows.map<ImportPreviewRow>((row, index) => {
    const accountName = getCellValue(row, columnMapping.accountName);
    const amountText = getCellValue(row, columnMapping.amount);
    const manualCategory = parseCategory(getCellValue(row, "__manual_category"));
    const manualStatementType = parseStatementType(
      getCellValue(row, "__manual_statement_type")
    );
    const csvCategory = parseCategory(getCellValue(row, columnMapping.category));
    const csvStatementType = parseStatementType(
      getCellValue(row, columnMapping.statementType)
    );
    const suggestion = suggestAccountMapping(accountName, savedMappings);
    const category = manualCategory ?? csvCategory ?? suggestion.category ?? null;
    const statementType =
      manualStatementType ??
      csvStatementType ??
      suggestion.statementType ??
      inferStatementTypeFromCategory(category);
    const mappingMeta = getPreviewMappingMeta({
      accountName,
      category,
      statementType,
      savedMappings,
      hasCsvValues: Boolean(csvCategory || csvStatementType),
      hasManualOverride: Boolean(manualCategory || manualStatementType)
    });
    const amountValue = Number.isFinite(Number(amountText)) ? Number(amountText) : null;
    const needsReview =
      !accountName ||
      amountValue === null ||
      !category ||
      !statementType ||
      mappingMeta.confidence === "low";

    return {
      rowNumber: index + 1,
      accountName,
      accountKey: normalizeAccountName(accountName),
      amountText,
      amountValue,
      sourcePeriodLabel: getCellValue(row, columnMapping.periodLabel),
      sourcePeriodDate: getCellValue(row, columnMapping.periodDate),
      statementType: statementType ?? "",
      category: category ?? "",
      addbackFlag:
        getCellValue(row, "__manual_addback_flag") ||
        getCellValue(row, columnMapping.addbackFlag),
      matchedBy: mappingMeta.matchedBy,
      confidence: mappingMeta.confidence,
      mappingExplanation: mappingMeta.explanation,
      needsReview
    };
  });
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
        needsReview: rows.some((row) => row.needsReview) || uniqueMappings.size > 1,
        hasConflict: uniqueMappings.size > 1,
        sourcePeriodLabels,
        sourcePeriodDates
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
