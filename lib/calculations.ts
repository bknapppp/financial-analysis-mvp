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
import {
  buildIncomeStatementAggregationDebug,
  normalizeIncomeStatementLabel
} from "./income-statement-rollup.ts";
import { normalizeReportedValue } from "./reported-sign-normalization.ts";

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

function calculateMarginPercent(value: number | null, revenue: number | null) {
  if (!hasValue(value)) {
    return null;
  }

  if (!hasValue(revenue)) {
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
  operatingExpenses: number | null;
  operatingExpensesSource?: PeriodSnapshot["incomeStatementDebug"] extends infer T
    ? T extends { operatingExpenses: { source: infer S } }
      ? S
      : never
    : never;
  depreciationAndAmortization: number | null;
  selectedLabels?: string[];
}) {
  if (params.operatingExpenses === null) {
    return null;
  }

  const selectedLabelSet = new Set(
    (params.selectedLabels ?? []).map((label) => normalizeIncomeStatementLabel(label))
  );
  const selectedBroadExpenseSubtotal = Array.from(selectedLabelSet).some(
    (label) =>
      label.startsWith("total ") ||
      label === "cost and expenses" ||
      label === "costs and expenses" ||
      label === "total expenses" ||
      label === "total operating expenses" ||
      label === "total operating expense" ||
      label === "operating costs and expenses"
  );

  if (
    params.depreciationAndAmortization !== null &&
    params.depreciationAndAmortization > 0 &&
    params.operatingExpensesSource === "subtotal_fallback" &&
    selectedBroadExpenseSubtotal
  ) {
    return Math.max(0, params.operatingExpenses - params.depreciationAndAmortization);
  }

  return params.operatingExpenses;
}

function buildEbitdaExplainability(params: {
  netIncome: number | null;
  nonOperating: number | null;
  taxExpense: number | null;
  depreciationAndAmortization: number | null;
  ebit: number | null;
  reportedEbitda: number | null;
  incomeStatementDebug: NonNullable<PeriodSnapshot["incomeStatementDebug"]>;
  incomeStatementMetricDebug: IncomeStatementMetricDebug;
}): EbitdaExplainability {
  const {
    netIncome,
    nonOperating,
    taxExpense,
    depreciationAndAmortization,
    ebit,
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
      netIncome: netIncome!,
      interestAddBack: nonOperating!,
      taxAddBack: taxExpense!,
      depreciationAndAmortizationAddBack: depreciationAndAmortization!,
      computedEbitda:
        netIncome! + nonOperating! + taxExpense! + depreciationAndAmortization!,
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
      note: "Canonical EBITDA uses the explicit reported EBITDA line because a normalized EBITDA row is available for this period.",
      netIncome: incomeStatementDebug.netIncome.source !== "none" ? netIncome : null,
      interestAddBack: incomeStatementDebug.nonOperating.source !== "none" ? nonOperating : null,
      taxAddBack: incomeStatementDebug.taxExpense.source !== "none" ? taxExpense : null,
      depreciationAndAmortizationAddBack:
        incomeStatementDebug.depreciationAndAmortization.source !== "none"
          ? depreciationAndAmortization
          : null,
      computedEbitda:
        ebit !== null && depreciationAndAmortization !== null
          ? ebit + depreciationAndAmortization
          : null,
      reportedEbitda,
      selectedLabels: incomeStatementMetricDebug.ebitda.selectedLabels,
      excludedLabels: incomeStatementMetricDebug.ebitda.excludedLabels,
      missingComponents: []
    };
  }

  return {
    basis: "incomplete",
    basisLabel: "Insufficient bottom-up inputs",
    note:
      reportedEbitda !== null
        ? "Canonical EBITDA is unavailable because the current period does not contain enough bottom-up inputs and no supported reported EBITDA row was selected."
        : "Canonical EBITDA is unavailable because the current period does not contain enough bottom-up inputs.",
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

  const canonicalRevenue = metricOrNull({
    total: incomeStatementDebug.revenue.total,
    source: incomeStatementDebug.revenue.source
  });
  const canonicalCogs = metricOrNull({
    total: incomeStatementDebug.cogs.total,
    source: incomeStatementDebug.cogs.source
  });
  const depreciationAndAmortization = metricOrNull({
    total: incomeStatementDebug.depreciationAndAmortization.total,
    source: incomeStatementDebug.depreciationAndAmortization.source
  });
  const operatingExpenses = computeOperatingExpensesExcludingDa({
    operatingExpenses: metricOrNull({
      total: incomeStatementDebug.operatingExpenses.total,
      source: incomeStatementDebug.operatingExpenses.source
    }),
    operatingExpensesSource: incomeStatementDebug.operatingExpenses.source,
    depreciationAndAmortization,
    selectedLabels: incomeStatementDebug.operatingExpenses.selectedLabels
  });
  const nonOperating = metricOrNull({
    total: incomeStatementDebug.nonOperating.total,
    source: incomeStatementDebug.nonOperating.source
  });
  const taxExpense = metricOrNull({
    total: incomeStatementDebug.taxExpense.total,
    source: incomeStatementDebug.taxExpense.source
  });
  const netIncome = metricOrNull({
    total: incomeStatementDebug.netIncome.total,
    source: incomeStatementDebug.netIncome.source
  });
  const reportedOperatingIncome = metricOrNull({
    total: incomeStatementDebug.operatingIncome.total,
    source: incomeStatementDebug.operatingIncome.source
  });
  const reportedEbitda = metricOrNull({
    total: incomeStatementDebug.ebitda.total,
    source: incomeStatementDebug.ebitda.source
  });
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
    canonicalRevenue !== null &&
    canonicalCogs !== null &&
    operatingExpenses !== null;
  const computedEbit =
    grossProfit === null || operatingExpenses === null
      ? null
      : grossProfit - operatingExpenses;
  const ebit = canComputeEbit
    ? computedEbit
    : reportedOperatingIncome !== null
      ? reportedOperatingIncome
      : null;
  const ebitSource: IncomeStatementMetricDebug["ebit"]["source"] = canComputeEbit
    ? "computed_operations"
    : reportedOperatingIncome !== null
      ? "reported_fallback"
      : "none";
  const canComputeEbitdaBottomUp =
    netIncome !== null &&
    nonOperating !== null &&
    taxExpense !== null &&
    depreciationAndAmortization !== null;
  const computedEbitda = canComputeEbitdaBottomUp
    ? netIncome + nonOperating + taxExpense + depreciationAndAmortization
    : null;
  const normalizedReportedEbitda = normalizeReportedValue({
    kind: "ebitda",
    value: metricOrNull({
      total: incomeStatementDebug.ebitda.total,
      source: incomeStatementDebug.ebitda.source
    }),
    referenceValues: [computedEbitda, ebit, netIncome]
  });
  const computedEbitdaFromEbit =
    ebit !== null && depreciationAndAmortization !== null
      ? ebit + depreciationAndAmortization
      : null;
  const ebitda =
    normalizedReportedEbitda !== null
      ? normalizedReportedEbitda
      : computedEbitdaFromEbit !== null
        ? computedEbitdaFromEbit
        : computedEbitda;
  const ebitdaSource: IncomeStatementMetricDebug["ebitda"]["source"] =
    normalizedReportedEbitda !== null
      ? "reported_fallback"
      : computedEbitdaFromEbit !== null || canComputeEbitdaBottomUp
        ? "bottom_up"
        : "none";
  const ebitSelectedLabels =
    ebitSource === "computed_operations"
      ? mergeLabels(
          incomeStatementDebug.revenue.selectedLabels,
          incomeStatementDebug.cogs.selectedLabels,
          incomeStatementDebug.operatingExpenses.selectedLabels
        )
      : ebitSource === "reported_fallback"
        ? incomeStatementDebug.operatingIncome.selectedLabels
        : [];
  const ebitExcludedLabels =
    ebitSource === "computed_operations"
      ? mergeLabels(
          incomeStatementDebug.revenue.excludedLabels,
          incomeStatementDebug.cogs.excludedLabels,
          incomeStatementDebug.operatingExpenses.excludedLabels,
          depreciationAndAmortization !== null &&
            depreciationAndAmortization > 0 &&
            incomeStatementDebug.operatingExpenses.source === "subtotal_fallback"
            ? incomeStatementDebug.depreciationAndAmortization.selectedLabels
            : []
        )
      : ebitSource === "reported_fallback"
        ? incomeStatementDebug.operatingIncome.excludedLabels
        : [];
  const incomeStatementMetricDebug: IncomeStatementMetricDebug = {
    ebit: {
      source: ebitSource,
      selectedLabels: ebitSelectedLabels,
      excludedLabels: ebitExcludedLabels
    },
    ebitda: {
      source: ebitdaSource,
      selectedLabels:
        ebitdaSource === "reported_fallback"
          ? incomeStatementDebug.ebitda.selectedLabels
          : ebitdaSource === "bottom_up"
          ? mergeLabels(
              computedEbitdaFromEbit !== null
                ? ebitSelectedLabels
                : incomeStatementDebug.netIncome.selectedLabels,
              computedEbitdaFromEbit !== null ? [] : incomeStatementDebug.nonOperating.selectedLabels,
              computedEbitdaFromEbit !== null ? [] : incomeStatementDebug.taxExpense.selectedLabels,
              incomeStatementDebug.depreciationAndAmortization.selectedLabels
            )
          : [],
      excludedLabels:
        ebitdaSource === "reported_fallback"
          ? incomeStatementDebug.ebitda.excludedLabels
          : ebitdaSource === "bottom_up"
          ? mergeLabels(
              computedEbitdaFromEbit !== null
                ? ebitExcludedLabels
                : incomeStatementDebug.netIncome.excludedLabels,
              computedEbitdaFromEbit !== null ? [] : incomeStatementDebug.nonOperating.excludedLabels,
              computedEbitdaFromEbit !== null ? [] : incomeStatementDebug.taxExpense.excludedLabels,
              incomeStatementDebug.depreciationAndAmortization.excludedLabels
            )
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
  const grossMarginPercent = calculateMarginPercent(grossProfit, canonicalRevenue);
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
    ebit,
    reportedEbitda: normalizedReportedEbitda,
    incomeStatementDebug,
    incomeStatementMetricDebug
  });

  return {
    periodId: period.id,
    label: period.label,
    periodDate: period.period_date,
    revenue: canonicalRevenue,
    cogs: canonicalCogs,
    grossProfit,
    operatingExpenses,
    depreciationAndAmortization,
    nonOperating,
    taxExpense,
    netIncome,
    ebit,
    reportedOperatingIncome,
    reportedEbitda: normalizedReportedEbitda,
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
    { label: "Depreciation / Amortization", value: snapshot.depreciationAndAmortization ?? null },
    { label: "EBIT", value: snapshot.ebit ?? null },
    { label: "Non-operating", value: snapshot.nonOperating ?? null },
    { label: "Tax Expense", value: snapshot.taxExpense ?? null },
    { label: "Net Income", value: snapshot.netIncome ?? null },
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
