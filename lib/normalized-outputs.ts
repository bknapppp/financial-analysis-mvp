import { getEntryMappingMeta } from "@/lib/mapping-intelligence";
import { buildReconciliationReport } from "@/lib/reconciliation";
import type {
  AccountMapping,
  EbitdaBridge,
  FinancialEntry,
  NormalizedMappedLine,
  NormalizedPeriodOutput,
  NormalizedStatement,
  PeriodSnapshot,
  ReportingPeriod
} from "@/lib/types";

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

function percentChange(current: number | null, previous: number | null) {
  if (!hasValue(current) || !hasValue(previous)) {
    return null;
  }

  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

function mapProvenance(entry: FinancialEntry, mappings: AccountMapping[]) {
  const meta = getEntryMappingMeta(entry, mappings);

  return {
    confidence: meta.confidence,
    mappingExplanation: meta.explanation,
    mappingProvenance:
      meta.matchedBy === "saved_mapping"
        ? ("saved_mapping" as const)
        : meta.matchedBy === "keyword"
          ? ("keyword_mapping" as const)
          : meta.matchedBy === "csv_value"
            ? ("source_provided" as const)
            : ("manual_mapping" as const)
  };
}

function buildMappedLinesForPeriod(
  periodId: string,
  entries: FinancialEntry[],
  accountMappings: AccountMapping[]
): NormalizedMappedLine[] {
  return entries
    .filter((entry) => entry.period_id === periodId)
    .map((entry) => {
      const provenance = mapProvenance(entry, accountMappings);

      return {
        entryId: entry.id,
        periodId: entry.period_id,
        accountName: entry.account_name,
        normalizedCategory: entry.category,
        statementType: entry.statement_type,
        mappingProvenance: provenance.mappingProvenance,
        confidence: provenance.confidence,
        mappingExplanation: provenance.mappingExplanation,
        amount: Number(entry.amount),
        addbackFlag: entry.addback_flag
      };
    })
    .sort((left, right) => {
      if (left.statementType !== right.statementType) {
        return left.statementType.localeCompare(right.statementType);
      }

      if (left.normalizedCategory !== right.normalizedCategory) {
        return left.normalizedCategory.localeCompare(right.normalizedCategory);
      }

      return left.accountName.localeCompare(right.accountName);
    });
}

function buildIncomeStatement(snapshot: PeriodSnapshot): Extract<
  NormalizedStatement,
  { statementKey: "income_statement" }
> {
  const rows: Extract<NormalizedStatement, { statementKey: "income_statement" }>["rows"] = [
    { key: "revenue", label: "Revenue", value: snapshot.revenue, kind: "line_item" },
    { key: "cogs", label: "COGS", value: snapshot.cogs, kind: "line_item" },
    {
      key: "gross_profit",
      label: "Gross Profit",
      value: snapshot.grossProfit,
      kind: "subtotal",
      rollupKey: "gross_profit"
    },
    {
      key: "operating_expenses",
      label: "Operating Expenses",
      value: snapshot.operatingExpenses,
      kind: "line_item"
    },
    {
      key: "depreciation_and_amortization",
      label: "Depreciation / Amortization",
      value: snapshot.depreciationAndAmortization ?? 0,
      kind: "line_item"
    },
    {
      key: "ebit",
      label: "EBIT",
      value: snapshot.ebit ?? null,
      kind: "subtotal",
      rollupKey: "ebit"
    }
  ];

  if (snapshot.reportedOperatingIncome !== null && snapshot.reportedOperatingIncome !== undefined) {
    rows.push({
      key: "reported_operating_income_reference",
      label: "Reported Operating Income (Reference)",
      value: snapshot.reportedOperatingIncome,
      kind: "metric",
      rollupKey: "reported_operating_income_reference"
    });
  }

  rows.push(
    {
      key: "non_operating",
      label: "Non-operating",
      value: snapshot.nonOperating ?? 0,
      kind: "line_item"
    },
    {
      key: "tax_expense",
      label: "Tax Expense",
      value: snapshot.taxExpense ?? 0,
      kind: "line_item"
    },
    {
      key: "net_income",
      label: "Net Income",
      value: snapshot.netIncome ?? 0,
      kind: "subtotal",
      rollupKey: "net_income"
    },
    {
      key: "ebitda",
      label: "EBITDA",
      value: snapshot.ebitda,
      kind: "subtotal",
      rollupKey: "ebitda"
    }
  );

  if (snapshot.reportedEbitda !== null && snapshot.reportedEbitda !== undefined) {
    rows.push({
      key: "reported_ebitda_reference",
      label: "Reported EBITDA (Reference)",
      value: snapshot.reportedEbitda,
      kind: "metric",
      rollupKey: "reported_ebitda_reference"
    });
  }

  rows.push(
    {
      key: "approved_add_backs",
      label: "Approved Add-Backs",
      value: snapshot.acceptedAddBacks,
      kind: "metric",
      rollupKey: "approved_add_backs"
    },
    {
      key: "adjusted_ebitda",
      label: "Adjusted EBITDA",
      value: snapshot.adjustedEbitda,
      kind: "subtotal",
      rollupKey: "adjusted_ebitda"
    }
  );

  return {
    statementKey: "income_statement",
    title: "Income Statement",
    rows,
    footerLabel: "Adjusted EBITDA",
    footerValue: snapshot.adjustedEbitda
  };
}

function buildBalanceSheet(snapshot: PeriodSnapshot): Extract<
  NormalizedStatement,
  { statementKey: "balance_sheet" }
> {
  return {
    statementKey: "balance_sheet",
    title: "Balance Sheet",
    rows: [
      {
        key: "current_assets",
        label: "Current Assets",
        value: snapshot.currentAssets,
        kind: "line_item"
      },
      {
        key: "current_liabilities",
        label: "Current Liabilities",
        value: snapshot.currentLiabilities,
        kind: "line_item"
      },
      {
        key: "working_capital",
        label: "Working Capital",
        value: snapshot.workingCapital,
        kind: "subtotal",
        rollupKey: "working_capital"
      }
    ],
    footerLabel: "Working Capital",
    footerValue: snapshot.workingCapital
  };
}

export function buildNormalizedPeriodOutputs(params: {
  periods: ReportingPeriod[];
  snapshots: PeriodSnapshot[];
  entries: FinancialEntry[];
  accountMappings: AccountMapping[];
  bridgesByPeriodId: Map<string, EbitdaBridge>;
  addBacks: import("@/lib/types").AddBack[];
}) {
  const { periods, snapshots, entries, accountMappings, bridgesByPeriodId, addBacks } =
    params;

  return snapshots.map<NormalizedPeriodOutput>((snapshot, index) => {
    const previousSnapshot = index > 0 ? snapshots[index - 1] ?? null : null;
    const mappedLines = buildMappedLinesForPeriod(
      snapshot.periodId,
      entries,
      accountMappings
    );
    const incomeStatement = buildIncomeStatement(snapshot);
    const balanceSheet = buildBalanceSheet(snapshot);
    const reconciliation = buildReconciliationReport({
      snapshot,
      entries,
      periods,
      addBacks
    });

    return {
      periodId: snapshot.periodId,
      label: snapshot.label,
      periodDate: snapshot.periodDate ?? "",
      mappedLines,
      incomeStatement,
      balanceSheet,
      reportedEbitda: snapshot.reportedEbitda ?? null,
      acceptedAddBacks: snapshot.acceptedAddBacks,
      adjustedEbitda: snapshot.adjustedEbitda,
      grossMarginPercent: snapshot.grossMarginPercent,
      reportedEbitdaMarginPercent: calculateMarginPercent(
        snapshot.reportedEbitda ?? null,
        snapshot.revenue
      ),
      adjustedEbitdaMarginPercent: snapshot.adjustedEbitdaMarginPercent,
      reportedEbitdaGrowthPercent: percentChange(
        snapshot.reportedEbitda ?? null,
        previousSnapshot?.reportedEbitda ?? null
      ),
      adjustedEbitdaGrowthPercent: snapshot.adjustedEbitdaGrowthPercent,
      reconciliation,
      bridge: bridgesByPeriodId.get(snapshot.periodId) ?? null,
      incomeStatementDebug: snapshot.incomeStatementDebug,
      incomeStatementMetricDebug: snapshot.incomeStatementMetricDebug,
      ebitdaExplainability: snapshot.ebitdaExplainability
    };
  });
}
