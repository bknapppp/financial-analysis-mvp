import { buildBalanceSheet as buildSnapshotBalanceSheet, buildIncomeStatement as buildSnapshotIncomeStatement } from "../../lib/calculations.ts";
import { buildBalanceSheetRollup, buildBalanceSheetValidation, type BalanceSheetValidationResult } from "../../components/financials-view-rollup.ts";
import { buildEbitdaChain } from "../../lib/underwriting/ebitda.ts";
import { buildDealShellViewModel, type DealShellViewModel } from "../../lib/view-models/deal-shell.ts";
import type {
  BackingSummaryItem,
  DashboardData,
  DashboardSeriesPoint,
  DiligenceIssue,
  EbitdaBridge,
  NormalizedPeriodOutput,
  NormalizedStatement,
  PeriodDriverAnalysis,
  PeriodSnapshot,
  ReconciliationReport
} from "../../lib/types.ts";

export type FinancialsPeriodViewModel = {
  periodId: string;
  label: string;
  periodDate: string | null;
  entryCount: number;
  snapshot: PeriodSnapshot;
  reportedStatement: NormalizedStatement;
  adjustedStatement: NormalizedStatement;
  balanceSheet: NormalizedStatement;
  canonicalEbitda: number | null;
  reportedEbitda: number | null;
  acceptedAddBacks: number;
  adjustedEbitda: number | null;
  bridge: EbitdaBridge | null;
  reconciliation: ReconciliationReport;
  validation: BalanceSheetValidationResult;
};

export type FinancialsPageViewModel = {
  state: "populated" | "unavailable";
  companyId: string;
  companyName: string;
  currency: string;
  shell: DealShellViewModel;
  defaultPeriodId: string;
  periods: FinancialsPeriodViewModel[];
  readiness: DashboardData["readiness"];
  backing: BackingSummaryItem[];
  issues: DiligenceIssue[];
  snapshots: PeriodSnapshot[];
  series: DashboardSeriesPoint[];
  driverAnalyses: PeriodDriverAnalysis[];
};

function rows(rows: Array<{ label: string; value: number | null }>, subtotals: string[]) {
  return rows.map((row) => ({
    key: row.label.toLowerCase().replace(/[^\w]+/g, "_").replace(/^_|_$/g, ""),
    label: row.label,
    value: row.value,
    kind: subtotals.includes(row.label) ? ("subtotal" as const) : ("line_item" as const)
  }));
}

function incomeStatement(output: NormalizedPeriodOutput | null, snapshot: PeriodSnapshot, adjusted: number | null, mode: "reported" | "adjusted"): NormalizedStatement {
  const footerLabel = mode === "reported" ? "EBITDA" : "Adjusted EBITDA";
  const footerValue = mode === "reported" ? snapshot.ebitda : adjusted;
  if (output?.incomeStatement) return { ...output.incomeStatement, title: "Income Statement", footerLabel, footerValue };
  return {
    statementKey: "income_statement",
    title: "Income Statement",
    rows: rows(buildSnapshotIncomeStatement(snapshot), ["Gross Profit", "EBIT", "Net Income", "Computed EBITDA", "Adjusted EBITDA"]),
    footerLabel,
    footerValue
  };
}

function balanceStatement(snapshot: PeriodSnapshot, rollup: ReturnType<typeof buildBalanceSheetRollup>): NormalizedStatement {
  const total = rollup.finalTotals;
  if (rollup.selectedPeriodRows.length) {
    return {
      statementKey: "balance_sheet",
      title: "Balance Sheet",
      rows: [
        { key: "assets_section", label: "Assets", value: 0, kind: "metric", rollupKey: "section_header" },
        { key: "current_assets", label: "Current Assets", value: total.totalCurrentAssets, kind: "line_item" },
        { key: "non_current_assets", label: "Non-Current Assets", value: total.totalNonCurrentAssets, kind: "line_item" },
        { key: "total_assets", label: "Total Assets", value: total.totalAssets, kind: "subtotal", rollupKey: "total_assets" },
        { key: "liabilities_section", label: "Liabilities", value: 0, kind: "metric", rollupKey: "section_header" },
        { key: "current_liabilities", label: "Current Liabilities", value: total.totalCurrentLiabilities, kind: "line_item" },
        { key: "non_current_liabilities", label: "Non-Current Liabilities", value: total.totalNonCurrentLiabilities, kind: "line_item" },
        { key: "total_liabilities", label: "Total Liabilities", value: total.totalLiabilities, kind: "subtotal", rollupKey: "total_liabilities" },
        { key: "equity_section", label: "Equity", value: 0, kind: "metric", rollupKey: "section_header" },
        { key: "total_equity", label: "Total Equity", value: total.totalEquity, kind: "subtotal", rollupKey: "total_equity" },
        { key: "total_liabilities_and_equity", label: "Total Liabilities & Equity", value: total.totalLiabilitiesAndEquity, kind: "subtotal", rollupKey: "total_liabilities_and_equity" }
      ],
      footerLabel: "Working Capital",
      footerValue: total.workingCapital
    };
  }
  return {
    statementKey: "balance_sheet",
    title: "Balance Sheet",
    rows: rows(buildSnapshotBalanceSheet(snapshot), ["Working Capital"]),
    footerLabel: "Working Capital",
    footerValue: snapshot.workingCapital
  };
}

export function buildFinancialsPageViewModel(data: DashboardData): FinancialsPageViewModel | null {
  if (!data.company) return null;
  const counts = new Map<string, number>();
  data.entries.forEach((entry) => counts.set(entry.period_id, (counts.get(entry.period_id) ?? 0) + 1));
  const periodSnapshots = data.snapshots
    .filter((snapshot) => (counts.get(snapshot.periodId) ?? 0) > 0)
    .sort((a, b) => (a.periodDate || a.label).localeCompare(b.periodDate || b.label));
  const periods = periodSnapshots.map((snapshot) => {
    const output = data.normalizedPeriods.find((item) => item.periodId === snapshot.periodId) ?? (data.normalizedOutput?.periodId === snapshot.periodId ? data.normalizedOutput : null);
    const bridge = output?.bridge ?? (data.ebitdaBridge?.periodId === snapshot.periodId ? data.ebitdaBridge : null);
    const canonicalEbitda = bridge?.canonicalEbitda ?? snapshot.ebitda ?? snapshot.reportedEbitda ?? null;
    const reportedEbitda = bridge?.reportedEbitdaReference ?? snapshot.reportedEbitda ?? canonicalEbitda;
    const acceptedAddBacks = bridge?.addBackTotal ?? snapshot.acceptedAddBacks ?? 0;
    const chain = buildEbitdaChain({ canonicalEbitda, acceptedAddbacks: acceptedAddBacks });
    const rollup = buildBalanceSheetRollup(data.entries, snapshot.periodId);
    return {
      periodId: snapshot.periodId,
      label: snapshot.label,
      periodDate: snapshot.periodDate ?? null,
      entryCount: counts.get(snapshot.periodId) ?? 0,
      snapshot,
      reportedStatement: incomeStatement(output, snapshot, chain.adjustedEbitda, "reported"),
      adjustedStatement: incomeStatement(output, snapshot, chain.adjustedEbitda, "adjusted"),
      balanceSheet: balanceStatement(snapshot, rollup),
      canonicalEbitda,
      reportedEbitda,
      acceptedAddBacks,
      adjustedEbitda: chain.adjustedEbitda,
      bridge,
      reconciliation: output?.reconciliation ?? data.reconciliation,
      validation: buildBalanceSheetValidation({ entries: data.entries, snapshot, rollup })
    };
  });
  const defaultPeriodId = periods.some((item) => item.periodId === data.snapshot.periodId)
    ? data.snapshot.periodId
    : periods.at(-1)?.periodId ?? "";
  const progress = data.readiness.status === "ready" ? 100 : data.readiness.status === "caution" ? 65 : 35;
  return {
    state: periods.length ? "populated" : "unavailable",
    companyId: data.company.id,
    companyName: data.company.name,
    currency: data.company.base_currency,
    shell: buildDealShellViewModel({ company: data.company, requestedSection: "financials", context: "financials", progressPercent: progress, progressLabel: "Financial readiness", progressIsPreview: false }),
    defaultPeriodId,
    periods,
    readiness: data.readiness,
    backing: Object.values(data.backing.summary),
    issues: data.diligenceIssues,
    snapshots: periodSnapshots,
    series: data.series,
    driverAnalyses: data.driverAnalyses
  };
}
