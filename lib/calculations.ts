import type {
  AddBack,
  FinancialEntry,
  PeriodSnapshot,
  ReportingPeriod,
  StatementRow
} from "./types.ts";
import { calculateAdjustedEbitdaForPeriod } from "./add-backs.ts";

function sumAmounts(entries: FinancialEntry[]) {
  return entries.reduce((total, entry) => total + Number(entry.amount), 0);
}

function isCurrentAssetCategory(category: FinancialEntry["category"]) {
  return category.startsWith("current_assets.");
}

function isCurrentLiabilityCategory(category: FinancialEntry["category"]) {
  return category.startsWith("current_liabilities.");
}

function byCategory(entries: FinancialEntry[], category: FinancialEntry["category"]) {
  return entries.filter((entry) => entry.category === category);
}

function calculateSnapshotForPeriod(
  period: ReportingPeriod,
  entries: FinancialEntry[],
  addBacks: AddBack[]
): PeriodSnapshot {
  const periodEntries = entries.filter((entry) => entry.period_id === period.id);
  const periodAddBacks = addBacks.filter((item) => item.period_id === period.id);

  const revenue = sumAmounts(byCategory(periodEntries, "Revenue"));
  const cogs = sumAmounts(byCategory(periodEntries, "COGS"));
  const operatingExpenses = sumAmounts(
    byCategory(periodEntries, "Operating Expenses")
  );
  const currentAssets = sumAmounts(
    periodEntries.filter((entry) => isCurrentAssetCategory(entry.category))
  );
  const currentLiabilities = sumAmounts(
    periodEntries.filter((entry) => isCurrentLiabilityCategory(entry.category))
  );

  const grossProfit = revenue - cogs;
  const ebitda = grossProfit - operatingExpenses;
  const adjustedEbitda = calculateAdjustedEbitdaForPeriod({
    periodId: period.id,
    reportedEbitda: ebitda,
    addBacks: periodAddBacks,
    entries: periodEntries
  }).adjustedEbitda;
  const workingCapital = currentAssets - currentLiabilities;
  const grossMarginPercent = revenue === 0 ? 0 : (grossProfit / revenue) * 100;
  const ebitdaMarginPercent = revenue === 0 ? 0 : (ebitda / revenue) * 100;
  const adjustedEbitdaMarginPercent =
    revenue === 0 ? 0 : (adjustedEbitda / revenue) * 100;

  return {
    periodId: period.id,
    label: period.label,
    periodDate: period.period_date,
    revenue,
    cogs,
    grossProfit,
    operatingExpenses,
    ebitda,
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
    ebitdaMarginChange: null
  };
}

function percentChange(current: number, previous: number) {
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
        snapshot.grossMarginPercent - previous.grossMarginPercent,
      ebitdaMarginChange:
        snapshot.ebitdaMarginPercent - previous.ebitdaMarginPercent
    };
  });
}

export function buildIncomeStatement(snapshot: PeriodSnapshot): StatementRow[] {
  return [
    { label: "Revenue", value: snapshot.revenue },
    { label: "COGS", value: snapshot.cogs },
    { label: "Gross Profit", value: snapshot.grossProfit },
    { label: "Operating Expenses", value: snapshot.operatingExpenses },
    { label: "Reported EBITDA", value: snapshot.ebitda },
    {
      label: "Accepted Add-Backs",
      value: snapshot.adjustedEbitda - snapshot.ebitda
    },
    { label: "Adjusted EBITDA", value: snapshot.adjustedEbitda }
  ];
}

export function buildBalanceSheet(snapshot: PeriodSnapshot): StatementRow[] {
  return [
    { label: "Current Assets", value: snapshot.currentAssets },
    { label: "Current Liabilities", value: snapshot.currentLiabilities }
  ];
}
