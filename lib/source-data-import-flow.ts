import { normalizeAccountName } from "./auto-mapping.ts";

export type ImportFlowRow = {
  accountKey: string; accountName: string; category: string; statementType: string;
  confidence: string; matchedBy: string; mappingExplanation: string;
  isExcluded?: boolean; isNonBlocking?: boolean;
  periods: Array<{ rowNumber: number; periodLabel: string; periodDate: string; amountText: string; amountValue: number | null }>;
};

export function deriveImportStepStatus(params: { selectedCompanyId: string; hasParsedFile: boolean; hasSelectedSheet: boolean; accountNameColumn: string; amountColumn: string; reviewedRows: Array<{ isExcluded?: boolean }> }) {
  return {
    uploadComplete: Boolean(params.selectedCompanyId && params.hasParsedFile),
    structureComplete: params.hasSelectedSheet && Boolean(params.accountNameColumn) && Boolean(params.amountColumn),
    reviewComplete: params.reviewedRows.some((row) => !row.isExcluded)
  };
}

export function getBlockingImportRows<T extends { category: string; statementType: string; isExcluded?: boolean; isNonBlocking?: boolean }>(rows: T[]) {
  return rows.filter((row) => !(row.category && row.statementType) && !row.isExcluded && !row.isNonBlocking);
}

export function isSourceImportBlocked(params: { isPending: boolean; selectedCompanyId: string; detectedPeriodCount: number; unresolvedPeriodCount: number; periodFallbackMode: "existing" | "new"; selectedPeriodId: string; newPeriodLabel: string; newPeriodDate: string; reviewedRows: Array<{ isExcluded?: boolean }>; blockingRowCount: number }) {
  return params.isPending || !params.selectedCompanyId ||
    (params.detectedPeriodCount === 0 && params.periodFallbackMode === "existing" && !params.selectedPeriodId) ||
    ((params.detectedPeriodCount === 0 || params.unresolvedPeriodCount > 0) && params.periodFallbackMode === "new" && (!params.newPeriodLabel || !params.newPeriodDate)) ||
    !params.reviewedRows.some((row) => !row.isExcluded) || params.blockingRowCount > 0;
}

export function applyManualMappingEdit<T extends Record<string, string>>(params: { rows: T[]; accountNameColumn: string; accountKey: string; patch: Partial<Record<"__manual_category" | "__manual_statement_type", string>> }) {
  return params.rows.map((row) => normalizeAccountName(row[params.accountNameColumn] ?? "") === params.accountKey ? { ...row, ...params.patch } : row);
}

export function buildSourceImportSubmission(params: { companyId: string; groupedRows: ImportFlowRow[]; periodFallbackMode: "existing" | "new"; selectedPeriodId: string; newPeriodLabel: string; newPeriodDate: string }) {
  const droppedRows: Array<{ accountName: string; reason: string; periodLabel?: string; periodDate?: string }> = [];
  const rows = params.groupedRows.filter((row) => {
    if (row.isExcluded) { droppedRows.push({ accountName: row.accountName, reason: "excluded" }); return false; }
    if (!row.category || !row.statementType) { droppedRows.push({ accountName: row.accountName, reason: "missing_mapping" }); return false; }
    return true;
  }).flatMap((row) => row.periods.flatMap((period) => {
    if (period.amountValue === null || period.amountValue === undefined) {
      droppedRows.push({ accountName: row.accountName, reason: "invalid_amount", periodLabel: period.periodLabel, periodDate: period.periodDate }); return [];
    }
    if (!period.periodLabel && !period.periodDate) {
      droppedRows.push({ accountName: row.accountName, reason: "missing_period", periodLabel: period.periodLabel, periodDate: period.periodDate }); return [];
    }
    return [{ accountName: row.accountName, amount: period.amountValue, periodLabel: period.periodLabel || null, periodDate: period.periodDate || null, statementType: row.statementType || null, category: row.category || null, addbackFlag: false, matchedBy: row.matchedBy, confidence: row.confidence, mappingExplanation: row.mappingExplanation }];
  }));
  return {
    payload: {
      companyId: params.companyId,
      periodId: params.periodFallbackMode === "existing" ? params.selectedPeriodId : "",
      createPeriod: params.periodFallbackMode === "new" && params.newPeriodLabel && params.newPeriodDate ? { label: params.newPeriodLabel, periodDate: params.newPeriodDate } : undefined,
      rows
    },
    droppedRows
  };
}
