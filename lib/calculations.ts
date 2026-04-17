import type {
  AddBack,
  EbitdaExplainability,
  FinancialEntry,
  IncomeStatementMetricDebug,
  PeriodSnapshot,
  ReportingPeriod,
  StatementRow
} from "./types";
import { calculateAdjustedEbitdaForPeriod } from "./add-backs.ts";
import { buildIncomeStatementAggregationDebug } from "./income-statement-rollup.ts";

function sumAmounts(entries: FinancialEntry[]) {
  return entries.reduce((total, entry) => total + Number(entry.amount), 0);
}

const EXCLUDED_BALANCE_SHEET_PARENT_CATEGORIES = new Set<FinancialEntry["category"]>([
  "Assets",
  "current_assets",
  "non_current_assets",
  "Liabilities",
  "current_liabilities",
  "non_current_liabilities",
  "Equity",
  "equity"
]);

function isLeafBalanceSheetCategory(category: FinancialEntry["category"]) {
  return !EXCLUDED_BALANCE_SHEET_PARENT_CATEGORIES.has(category);
}

function isCurrentAssetCategory(category: FinancialEntry["category"]) {
  return category.startsWith("current_assets.");
}

function isCurrentLiabilityCategory(category: FinancialEntry["category"]) {
  return category.startsWith("current_liabilities.");
}

function mergeLabels(...groups: Array<Array<string> | undefined>) {
  return Array.from(new Set(groups.flatMap((group) => group ?? [])));
}

function hasValue(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function calculateMarginPercent(value: number | null, revenue: number) {
  if (!hasValue(value)) {
    return null;
  }

  if (revenue === 0) {
    return value === 0 ? 0 : null;
  }

  return (value / revenue) * 100;
}

function metricOrNull(params: {
  total: number;
  source: "components" | "subtotal_fallback" | "none";
}) {
  return params.source === "none" ? null : params.total;
}

function computeOperatingExpensesExcludingDa(params: {
  operatingExpenses: number;
  operatingExpensesSource?: PeriodSnapshot["incomeStatementDebug"] extends infer T
    ? T extends { operatingExpenses: { source: infer S } }
      ? S
      : never
    : never;
  depreciationAndAmortization: number;
}) {
  if (
    params.depreciationAndAmortization > 0 &&
    params.operatingExpensesSource === "subtotal_fallback"
  ) {
    return Math.max(0, params.operatingExpenses - params.depreciationAndAmortization);
  }

  return params.operatingExpenses;
}

function buildEbitdaExplainability(params: {
  netIncome: number;
  nonOperating: number;
  taxExpense: number;
  depreciationAndAmortization: number;
  reportedEbitda: number;
  incomeStatementDebug: NonNullable<PeriodSnapshot["incomeStatementDebug"]>;
  incomeStatementMetricDebug: IncomeStatementMetricDebug;
}): EbitdaExplainability {
  const {
    netIncome,
    nonOperating,
    taxExpense,
    depreciationAndAmortization,
    reportedEbitda,
    incomeStatementDebug,
    incomeStatementMetricDebug
  } = params;
  const source = incomeStatementMetricDebug.ebitda.source;
  const missingComponents = [
    incomeStatementDebug.netIncome.source === "none" ? "Net Income" : null,
    incomeStatementDebug.nonOperating.source === "none" ? "Interest / Non-operating" : null,
    incomeStatementDebug.taxExpense.source === "none" ? "Tax Expense" : null,
    incomeStatementDebug.depreciationAndAmortization.source === "none"
      ? "Depreciation & Amortization"
      : null
  ].filter((value): value is string => Boolean(value));

  if (source === "bottom_up") {
    return {
      basis: "computed",
      basisLabel: "Computed from bottom-up inputs",
      note: "Canonical EBITDA is built from Net Income plus interest/non-operating, taxes, and depreciation & amortization.",
      netIncome,
      interestAddBack: nonOperating,
      taxAddBack: taxExpense,
      depreciationAndAmortizationAddBack: depreciationAndAmortization,
      computedEbitda:
        netIncome + nonOperating + taxExpense + depreciationAndAmortization,
      reportedEbitda:
        incomeStatementDebug.ebitda.source !== "none" ? reportedEbitda : null,
      selectedLabels: incomeStatementMetricDebug.ebitda.selectedLabels,
      excludedLabels: incomeStatementMetricDebug.ebitda.excludedLabels,
      missingComponents: []
    };
  }

  if (source === "reported_fallback") {
    return {
      basis: "reported_fallback",
      basisLabel: "Using reported EBITDA (fallback)",
      note: "Canonical EBITDA is falling back to the reported EBITDA line because full bottom-up inputs are not available.",
      netIncome: incomeStatementDebug.netIncome.source !== "none" ? netIncome : null,
      interestAddBack: incomeStatementDebug.nonOperating.source !== "none" ? nonOperating : null,
      taxAddBack: incomeStatementDebug.taxExpense.source !== "none" ? taxExpense : null,
      depreciationAndAmortizationAddBack:
        incomeStatementDebug.depreciationAndAmortization.source !== "none"
          ? depreciationAndAmortization
          : null,
      computedEbitda: null,
      reportedEbitda,
      selectedLabels: incomeStatementMetricDebug.ebitda.selectedLabels,
      excludedLabels: incomeStatementMetricDebug.ebitda.excludedLabels,
      missingComponents
    };
  }

  return {
    basis: "incomplete",
    basisLabel: "Insufficient bottom-up inputs",
    note: "EBITDA is unavailable because the current period does not contain enough bottom-up inputs or a reported EBITDA fallback.",
    netIncome: incomeStatementDebug.netIncome.source !== "none" ? netIncome : null,
    interestAddBack: incomeStatementDebug.nonOperating.source !== "none" ? nonOperating : null,
    taxAddBack: incomeStatementDebug.taxExpense.source !== "none" ? taxExpense : null,
    depreciationAndAmortizationAddBack:
      incomeStatementDebug.depreciationAndAmortization.source !== "none"
        ? depreciationAndAmortization
        : null,
    computedEbitda: null,
    reportedEbitda: incomeStatementDebug.ebitda.source !== "none" ? reportedEbitda : null,
    selectedLabels: incomeStatementMetricDebug.ebitda.selectedLabels,
    excludedLabels: incomeStatementMetricDebug.ebitda.excludedLabels,
    missingComponents
  };
}

function calculateSnapshotForPeriod(
  period: ReportingPeriod,
  entries: FinancialEntry[],
  addBacks: AddBack[]
): PeriodSnapshot {
  const periodEntries = entries.filter((entry) => entry.period_id === period.id);
  const periodAddBacks = addBacks.filter((item) => item.period_id === period.id);
  const incomeStatementDebug = buildIncomeStatementAggregationDebug(entries, period.id);

  const revenue = incomeStatementDebug.revenue.total;
  const cogs = incomeStatementDebug.cogs.total;
  const canonicalRevenue = metricOrNull({
    total: revenue,
    source: incomeStatementDebug.revenue.source
  });
  const canonicalCogs = metricOrNull({
    total: cogs,
    source: incomeStatementDebug.cogs.source
  });
  const depreciationAndAmortization =
    incomeStatementDebug.depreciationAndAmortization.total;
  const operatingExpenses = computeOperatingExpensesExcludingDa({
    operatingExpenses: incomeStatementDebug.operatingExpenses.total,
    operatingExpensesSource: incomeStatementDebug.operatingExpenses.source,
    depreciationAndAmortization
  });
  const nonOperating = incomeStatementDebug.nonOperating.total;
  const taxExpense = incomeStatementDebug.taxExpense.total;
  const netIncome = incomeStatementDebug.netIncome.total;
  const reportedOperatingIncome = incomeStatementDebug.operatingIncome.total;
  const reportedEbitda = incomeStatementDebug.ebitda.total;
  const leafBalanceSheetEntries = periodEntries.filter(
    (entry) =>
      entry.statement_type === "balance_sheet" &&
      isLeafBalanceSheetCategory(entry.category)
  );
  const currentAssets = sumAmounts(
    leafBalanceSheetEntries.filter((entry) => isCurrentAssetCategory(entry.category))
  );
  const currentLiabilities = sumAmounts(
    leafBalanceSheetEntries.filter((entry) =>
      isCurrentLiabilityCategory(entry.category)
    )
  );

  const grossProfit =
    canonicalRevenue !== null && canonicalCogs !== null
      ? canonicalRevenue - canonicalCogs
      : null;
  const canComputeEbit =
    incomeStatementDebug.revenue.source !== "none" &&
    incomeStatementDebug.cogs.source !== "none" &&
    incomeStatementDebug.operatingExpenses.source !== "none";
  const computedEbit = grossProfit === null ? null : grossProfit - operatingExpenses;
  const ebit = canComputeEbit
    ? computedEbit
    : incomeStatementDebug.operatingIncome.source !== "none"
      ? reportedOperatingIncome
      : null;
  const ebitSource: IncomeStatementMetricDebug["ebit"]["source"] = canComputeEbit
    ? "computed_operations"
    : incomeStatementDebug.operatingIncome.source !== "none"
      ? "reported_fallback"
      : "none";
  const canComputeEbitdaBottomUp =
    incomeStatementDebug.netIncome.source !== "none" &&
    incomeStatementDebug.nonOperating.source !== "none" &&
    incomeStatementDebug.taxExpense.source !== "none" &&
    incomeStatementDebug.depreciationAndAmortization.source !== "none";
  const computedEbitda =
    netIncome + nonOperating + taxExpense + depreciationAndAmortization;
  const ebitda = canComputeEbitdaBottomUp
    ? computedEbitda
    : incomeStatementDebug.ebitda.source !== "none"
      ? reportedEbitda
      : null;
  const ebitdaSource: IncomeStatementMetricDebug["ebitda"]["source"] =
    canComputeEbitdaBottomUp
      ? "bottom_up"
      : incomeStatementDebug.ebitda.source !== "none"
        ? "reported_fallback"
        : "none";
  const incomeStatementMetricDebug: IncomeStatementMetricDebug = {
    ebit: {
      source: ebitSource,
      selectedLabels:
        ebitSource === "computed_operations"
          ? mergeLabels(
              incomeStatementDebug.revenue.selectedLabels,
              incomeStatementDebug.cogs.selectedLabels,
              incomeStatementDebug.operatingExpenses.selectedLabels
            )
          : ebitSource === "reported_fallback"
            ? incomeStatementDebug.operatingIncome.selectedLabels
            : [],
      excludedLabels:
        ebitSource === "computed_operations"
          ? mergeLabels(
              incomeStatementDebug.revenue.excludedLabels,
              incomeStatementDebug.cogs.excludedLabels,
              incomeStatementDebug.operatingExpenses.excludedLabels,
              depreciationAndAmortization > 0 &&
                incomeStatementDebug.operatingExpenses.source === "subtotal_fallback"
                ? incomeStatementDebug.depreciationAndAmortization.selectedLabels
                : []
            )
          : ebitSource === "reported_fallback"
            ? incomeStatementDebug.operatingIncome.excludedLabels
            : []
    },
    ebitda: {
      source: ebitdaSource,
      selectedLabels:
        ebitdaSource === "bottom_up"
          ? mergeLabels(
              incomeStatementDebug.netIncome.selectedLabels,
              incomeStatementDebug.nonOperating.selectedLabels,
              incomeStatementDebug.taxExpense.selectedLabels,
              incomeStatementDebug.depreciationAndAmortization.selectedLabels
            )
          : ebitdaSource === "reported_fallback"
            ? incomeStatementDebug.ebitda.selectedLabels
            : [],
      excludedLabels:
        ebitdaSource === "bottom_up"
          ? mergeLabels(
              incomeStatementDebug.netIncome.excludedLabels,
              incomeStatementDebug.nonOperating.excludedLabels,
              incomeStatementDebug.taxExpense.excludedLabels,
              incomeStatementDebug.depreciationAndAmortization.excludedLabels
            )
          : ebitdaSource === "reported_fallback"
            ? incomeStatementDebug.ebitda.excludedLabels
            : []
    }
  };
  const adjustment = calculateAdjustedEbitdaForPeriod({
    periodId: period.id,
    canonicalEbitda: ebitda,
    addBacks: periodAddBacks,
    entries: periodEntries
  });
  const acceptedAddBacks = adjustment.acceptedAddBackTotal;
  const adjustedEbitda = adjustment.adjustedEbitda;
  const workingCapital = currentAssets - currentLiabilities;
  const grossMarginPercent =
    grossProfit === null || canonicalRevenue === null
      ? null
      : canonicalRevenue === 0
        ? null
        : (grossProfit / canonicalRevenue) * 100;
  const ebitdaMarginPercent =
    canonicalRevenue === null ? null : calculateMarginPercent(ebitda, canonicalRevenue);
  const adjustedEbitdaMarginPercent =
    canonicalRevenue === null
      ? null
      : calculateMarginPercent(adjustedEbitda, canonicalRevenue);
  const ebitdaExplainability = buildEbitdaExplainability({
    netIncome,
    nonOperating,
    taxExpense,
    depreciationAndAmortization,
    reportedEbitda,
    incomeStatementDebug,
    incomeStatementMetricDebug
  });

  return {
    periodId: period.id,
    label: period.label,
    periodDate: period.period_date,
    revenue,
    cogs,
    grossProfit,
    operatingExpenses,
    depreciationAndAmortization,
    nonOperating,
    taxExpense,
    netIncome,
    ebit,
    reportedOperatingIncome,
    reportedEbitda,
    ebitda,
    acceptedAddBacks,
    adjustedEbitda,
    grossMarginPercent,
    ebitdaMarginPercent,
    adjustedEbitdaMarginPercent,
    currentAssets,
    currentLiabilities,
    workingCapital,
    revenueGrowthPercent: null,
    ebitdaGrowthPercent: null,
    adjustedEbitdaGrowthPercent: null,
    grossMarginChange: null,
    ebitdaMarginChange: null,
    incomeStatementDebug,
    incomeStatementMetricDebug,
    ebitdaExplainability
  };
}

function percentChange(current: number | null, previous: number | null) {
  if (!hasValue(current) || !hasValue(previous)) {
    return null;
  }

  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

export function buildSnapshots(
  periods: ReportingPeriod[],
  entries: FinancialEntry[],
  addBacks: AddBack[] = []
): PeriodSnapshot[] {
  const baseSnapshots = periods.map((period) =>
    calculateSnapshotForPeriod(period, entries, addBacks)
  );

  return baseSnapshots.map((snapshot, index) => {
    const previous = index > 0 ? baseSnapshots[index - 1] : null;

    if (!previous) {
      return snapshot;
    }

    return {
      ...snapshot,
      revenueGrowthPercent: percentChange(snapshot.revenue, previous.revenue),
      ebitdaGrowthPercent: percentChange(snapshot.ebitda, previous.ebitda),
      adjustedEbitdaGrowthPercent: percentChange(
        snapshot.adjustedEbitda,
        previous.adjustedEbitda
      ),
      grossMarginChange:
        hasValue(snapshot.grossMarginPercent) && hasValue(previous.grossMarginPercent)
          ? snapshot.grossMarginPercent - previous.grossMarginPercent
          : null,
      ebitdaMarginChange:
        hasValue(snapshot.ebitdaMarginPercent) && hasValue(previous.ebitdaMarginPercent)
          ? snapshot.ebitdaMarginPercent - previous.ebitdaMarginPercent
          : null
    };
  });
}

export function buildIncomeStatement(snapshot: PeriodSnapshot): StatementRow[] {
  const rows: StatementRow[] = [
    { label: "Revenue", value: snapshot.revenue },
    { label: "COGS", value: snapshot.cogs },
    { label: "Gross Profit", value: snapshot.grossProfit },
    { label: "Operating Expenses", value: snapshot.operatingExpenses },
    {
      label: "Depreciation / Amortization",
      value: snapshot.depreciationAndAmortization ?? 0
    },
    { label: "EBIT", value: snapshot.ebit ?? null },
    { label: "Non-operating", value: snapshot.nonOperating ?? 0 },
    { label: "Tax Expense", value: snapshot.taxExpense ?? 0 },
    { label: "Net Income", value: snapshot.netIncome ?? 0 },
    { label: "EBITDA", value: snapshot.ebitda },
    {
      label: "Approved Add-Backs",
      value: snapshot.acceptedAddBacks
    },
    { label: "Adjusted EBITDA", value: snapshot.adjustedEbitda }
  ];

  if (snapshot.reportedOperatingIncome !== null && snapshot.reportedOperatingIncome !== undefined) {
    rows.splice(6, 0, {
      label: "Reported Operating Income (Reference)",
      value: snapshot.reportedOperatingIncome
    });
  }

  if (snapshot.reportedEbitda !== null && snapshot.reportedEbitda !== undefined) {
    rows.splice(rows.length - 2, 0, {
      label: "Reported EBITDA (Reference)",
      value: snapshot.reportedEbitda
    });
  }

  return rows;
}

export function buildBalanceSheet(snapshot: PeriodSnapshot): StatementRow[] {
  return [
    { label: "Current Assets", value: snapshot.currentAssets },
    { label: "Current Liabilities", value: snapshot.currentLiabilities }
  ];
}
