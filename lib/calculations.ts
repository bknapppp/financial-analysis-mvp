import type {
  FinancialEntry,
  PeriodSnapshot,
  ReportingPeriod,
  StatementRow
} from "@/lib/types";

function sumAmounts(entries: FinancialEntry[]) {
  return entries.reduce((total, entry) => total + Number(entry.amount), 0);
}

function byCategory(entries: FinancialEntry[], category: FinancialEntry["category"]) {
  return entries.filter((entry) => entry.category === category);
}

function calculateSnapshotForPeriod(
  period: ReportingPeriod,
  entries: FinancialEntry[]
): PeriodSnapshot {
  const periodEntries = entries.filter((entry) => entry.period_id === period.id);

  const revenue = sumAmounts(byCategory(periodEntries, "Revenue"));
  const cogs = sumAmounts(byCategory(periodEntries, "COGS"));
  const operatingExpenses = sumAmounts(
    byCategory(periodEntries, "Operating Expenses")
  );
  const addBacks = sumAmounts(periodEntries.filter((entry) => entry.addback_flag));
  const currentAssets = sumAmounts(byCategory(periodEntries, "Assets"));
  const currentLiabilities = sumAmounts(byCategory(periodEntries, "Liabilities"));

  const grossProfit = revenue - cogs;
  const ebitda = grossProfit - operatingExpenses;
  const adjustedEbitda = ebitda + addBacks;
  const workingCapital = currentAssets - currentLiabilities;
  const grossMarginPercent = revenue === 0 ? 0 : (grossProfit / revenue) * 100;
  const ebitdaMarginPercent = revenue === 0 ? 0 : (ebitda / revenue) * 100;

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
    currentAssets,
    currentLiabilities,
    workingCapital,
    revenueGrowthPercent: null,
    ebitdaGrowthPercent: null,
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
  entries: FinancialEntry[]
): PeriodSnapshot[] {
  const baseSnapshots = periods.map((period) =>
    calculateSnapshotForPeriod(period, entries)
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
    { label: "EBITDA", value: snapshot.ebitda },
    {
      label: "Add-Backs",
      value: snapshot.adjustedEbitda - snapshot.ebitda
    }
  ];
}

export function buildBalanceSheet(snapshot: PeriodSnapshot): StatementRow[] {
  return [
    { label: "Current Assets", value: snapshot.currentAssets },
    { label: "Current Liabilities", value: snapshot.currentLiabilities }
  ];
}
