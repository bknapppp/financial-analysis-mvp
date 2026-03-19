import { getCanonicalPeriodAdjustment } from "@/lib/add-backs";
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
  return {
    statementKey: "income_statement",
    title: "Income Statement",
    rows: [
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
        key: "reported_ebitda",
        label: "Reported EBITDA",
        value: snapshot.ebitda,
        kind: "subtotal",
        rollupKey: "reported_ebitda"
      },
      {
        key: "accepted_add_backs",
        label: "Accepted Add-Backs",
        value: snapshot.adjustedEbitda - snapshot.ebitda,
        kind: "metric",
        rollupKey: "accepted_add_backs"
      },
      {
        key: "adjusted_ebitda",
        label: "Adjusted EBITDA",
        value: snapshot.adjustedEbitda,
        kind: "subtotal",
        rollupKey: "adjusted_ebitda"
      }
    ],
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

  return snapshots.map<NormalizedPeriodOutput>((snapshot) => {
    const mappedLines = buildMappedLinesForPeriod(
      snapshot.periodId,
      entries,
      accountMappings
    );
    const incomeStatement = buildIncomeStatement(snapshot);
    const balanceSheet = buildBalanceSheet(snapshot);
    const acceptedAddBacks = getCanonicalPeriodAdjustment({
      periodId: snapshot.periodId,
      addBacks,
      entries: entries.filter((entry) => entry.period_id === snapshot.periodId)
    }).acceptedAddBackTotal;
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
      reportedEbitda: snapshot.ebitda,
      acceptedAddBacks,
      adjustedEbitda: snapshot.adjustedEbitda,
      grossMarginPercent: snapshot.grossMarginPercent,
      reportedEbitdaMarginPercent: snapshot.ebitdaMarginPercent,
      adjustedEbitdaMarginPercent: snapshot.adjustedEbitdaMarginPercent,
      reportedEbitdaGrowthPercent: snapshot.ebitdaGrowthPercent,
      adjustedEbitdaGrowthPercent: snapshot.adjustedEbitdaGrowthPercent,
      reconciliation,
      bridge: bridgesByPeriodId.get(snapshot.periodId) ?? null
    };
  });
}
